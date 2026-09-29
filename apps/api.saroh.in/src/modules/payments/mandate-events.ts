import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import {
    JOB,
    recordSubscriptionEvent,
} from "../subscriptions/subscription-events";

import { enqueueMandateCancelInTx } from "./mandate-cancel-job";
import type { MandateStatus, ReportedMandateChange } from "./mandate-rules";
import {
    nextMandateStatus,
    safeDisplayHint,
    safeFailureReason,
} from "./mandate-rules";
import { isMandateMethod } from "./providers/provider.port";

/**
 * What a provider says about a mandate, applied in the caller's
 * transaction (round-2 D11): the webhook inbox (`token.*`,
 * `order.notification.*`) and `MandatesService.refresh` both come here,
 * so a lost webhook and a late one settle the same way.
 *
 * Every move is a conditional update from the state it was read in, so a
 * duplicate or racing delivery moves a mandate once (the inbox's unique
 * key is the first guard; this is the second). A CANCELLED or FAILED
 * mandate never comes back.
 */

const logger = new Logger("MandateEvents");

type Tx = Prisma.TransactionClient;

interface MandateRow {
    id: string;
    subscriptionId: string;
    status: string;
    activatedAt: Date | null;
    providerMandateId: string | null;
    cancelConfirmedAt: Date | null;
}

const ROW_SELECT = {
    id: true,
    subscriptionId: true,
    status: true,
    activatedAt: true,
    providerMandateId: true,
    cancelConfirmedAt: true,
} as const;

/** The mandate a change names: by the provider's id, else by its set-up. */
async function findMandate(
    tx: Tx,
    organizationId: string,
    provider: string,
    change: ReportedMandateChange,
): Promise<MandateRow | null> {
    if (change.providerMandateId) {
        const byToken = await tx.paymentMandate.findFirst({
            where: {
                organizationId,
                provider,
                providerMandateId: change.providerMandateId,
            },
            select: ROW_SELECT,
        });
        if (byToken) return byToken;
    }
    if (change.setupReference) {
        return tx.paymentMandate.findFirst({
            where: {
                organizationId,
                provider,
                setupReference: change.setupReference,
            },
            select: ROW_SELECT,
            orderBy: { createdAt: "desc" },
        });
    }
    return null;
}

/**
 * Apply a provider's report on one mandate. Returns whether anything
 * moved. An unknown mandate is logged and acknowledged: nothing is made
 * from a webhook.
 */
export async function applyMandateChangeInTx(
    tx: Tx,
    organizationId: string,
    provider: string,
    change: ReportedMandateChange,
    now: Date = new Date(),
): Promise<{ applied: boolean }> {
    const row = await findMandate(tx, organizationId, provider, change);
    if (!row) {
        logger.warn(
            `${provider} reported a mandate Saroh doesn't have (${change.status}); acknowledged, nothing written`,
        );
        return { applied: false };
    }
    const current = row.status as MandateStatus;

    // Cancelled in Saroh first (D20), and now the provider says so too.
    if (
        change.status === "CANCELLED" &&
        current === "CANCELLED" &&
        !row.cancelConfirmedAt
    ) {
        const { count } = await tx.paymentMandate.updateMany({
            where: { id: row.id, status: "CANCELLED", cancelConfirmedAt: null },
            data: { cancelConfirmedAt: now },
        });
        return { applied: count > 0 };
    }

    const next = nextMandateStatus(current, change.status);
    if (!next) return { applied: false };

    switch (next) {
        case "ACTIVE":
            return activate(tx, organizationId, row, change, now);
        case "PAUSED": {
            const { count } = await tx.paymentMandate.updateMany({
                where: { id: row.id, status: current },
                data: { status: "PAUSED", pausedAt: now },
            });
            return { applied: count > 0 };
        }
        case "FAILED": {
            const { count } = await tx.paymentMandate.updateMany({
                where: { id: row.id, status: current },
                data: {
                    status: "FAILED",
                    failedAt: now,
                    failureReason: safeFailureReason(change.failureReason),
                },
            });
            return { applied: count > 0 };
        }
        case "CANCELLED": {
            // The customer (or their bank) ended it at the provider:
            // nothing to ask, so it is confirmed now.
            const { count } = await tx.paymentMandate.updateMany({
                where: { id: row.id, status: current },
                data: {
                    status: "CANCELLED",
                    cancelledAt: now,
                    cancelReason: "PROVIDER",
                    cancelConfirmedAt: now,
                },
            });
            if (count === 0) return { applied: false };
            await recordSubscriptionEvent(
                tx,
                organizationId,
                row.subscriptionId,
                "MANDATE_CANCELLED",
                JOB,
                { data: { reason: "PROVIDER" } },
            );
            return { applied: true };
        }
        default:
            return { applied: false };
    }
}

/**
 * A mandate becomes ACTIVE. The subscription's older ACTIVE or PAUSED
 * mandate, if any, is cancelled first (REPLACED), so the one-ACTIVE index
 * holds and it is never charged again; the `mandate.cancel` job then asks
 * the provider. A subscription that ended while the customer was
 * authorising gets its new mandate cancelled straight away.
 */
async function activate(
    tx: Tx,
    organizationId: string,
    row: MandateRow,
    change: ReportedMandateChange,
    now: Date,
): Promise<{ applied: boolean }> {
    const subscription = await tx.customerSubscription.findFirst({
        where: { id: row.subscriptionId, organizationId },
        select: { status: true },
    });
    const ended = !subscription || subscription.status === "CANCELLED";

    let queued = false;
    if (!ended && row.status === "PENDING") {
        const older = await tx.paymentMandate.findMany({
            where: {
                organizationId,
                subscriptionId: row.subscriptionId,
                id: { not: row.id },
                status: { in: ["ACTIVE", "PAUSED"] },
            },
            select: { id: true, providerMandateId: true },
        });
        for (const old of older) {
            const atProvider = old.providerMandateId !== null;
            const { count } = await tx.paymentMandate.updateMany({
                where: { id: old.id, status: { in: ["ACTIVE", "PAUSED"] } },
                data: {
                    status: "CANCELLED",
                    cancelledAt: now,
                    cancelReason: "REPLACED",
                    cancelConfirmedAt: atProvider ? null : now,
                },
            });
            if (count > 0) {
                await recordSubscriptionEvent(
                    tx,
                    organizationId,
                    row.subscriptionId,
                    "MANDATE_CANCELLED",
                    JOB,
                    { data: { reason: "REPLACED" } },
                );
                queued ||= atProvider;
            }
        }
    }

    const providerMandateId =
        change.providerMandateId ?? row.providerMandateId ?? null;
    const { count } = await tx.paymentMandate.updateMany({
        where: { id: row.id, status: row.status },
        data: ended
            ? {
                  status: "CANCELLED",
                  cancelledAt: now,
                  cancelReason: "SUBSCRIPTION_ENDED",
                  providerMandateId,
                  cancelConfirmedAt: providerMandateId ? null : now,
              }
            : {
                  status: "ACTIVE",
                  activatedAt: row.activatedAt ?? now,
                  pausedAt: null,
                  providerMandateId,
                  ...(change.providerCustomerId
                      ? { providerCustomerId: change.providerCustomerId }
                      : {}),
                  ...(isMandateMethod(change.method)
                      ? { method: change.method }
                      : {}),
                  ...(safeDisplayHint(change.displayHint)
                      ? { displayHint: safeDisplayHint(change.displayHint) }
                      : {}),
                  ...(isWholePositive(change.maxAmountCents)
                      ? { maxAmountCents: change.maxAmountCents }
                      : {}),
                  ...(change.expiresAt &&
                  !Number.isNaN(change.expiresAt.getTime())
                      ? { expiresAt: change.expiresAt }
                      : {}),
              },
    });
    if (count === 0) return { applied: false };

    if (ended) {
        queued ||= providerMandateId !== null;
        await recordSubscriptionEvent(
            tx,
            organizationId,
            row.subscriptionId,
            "MANDATE_CANCELLED",
            JOB,
            { data: { reason: "SUBSCRIPTION_ENDED" } },
        );
    } else if (row.status === "PENDING") {
        await recordSubscriptionEvent(
            tx,
            organizationId,
            row.subscriptionId,
            "MANDATE_SET_UP",
            JOB,
            {
                data: {
                    method: isMandateMethod(change.method)
                        ? change.method
                        : null,
                },
            },
        );
    }
    if (queued) {
        await enqueueMandateCancelInTx(tx, {
            organizationId,
            subscriptionId: row.subscriptionId,
        });
    }
    return { applied: true };
}

function isWholePositive(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * A mandate charge's pre-debit notice was delivered, or failed (Razorpay
 * `order.notification.delivered` / `.failed`). Moves only a notice still
 * PENDING, so a late or repeated report changes nothing twice.
 */
export async function applyPreDebitInTx(
    tx: Tx,
    organizationId: string,
    provider: string,
    providerIntentId: string,
    status: "DELIVERED" | "FAILED",
): Promise<{ applied: boolean }> {
    const { count } = await tx.paymentIntent.updateMany({
        where: {
            organizationId,
            provider,
            providerIntentId,
            viaMandateId: { not: null },
            preDebitStatus: "PENDING",
        },
        data: { preDebitStatus: status },
    });
    if (count === 0) {
        logger.warn(
            `${provider} reported a pre-debit notice (${status}) for no waiting mandate charge; acknowledged`,
        );
    }
    return { applied: count > 0 };
}
