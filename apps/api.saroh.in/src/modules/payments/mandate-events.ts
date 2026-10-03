import { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { SubscriptionActor } from "../subscriptions/subscription-events";
import {
    customerActor,
    JOB,
    recordSubscriptionEvent,
} from "../subscriptions/subscription-events";

import { heldReportOf, readJoinAutopay } from "./join-autopay";

import {
    cancelOpenCharges,
    enqueueMandateCancelInTx,
} from "./mandate-cancel-job";
import type { MandateStatus, ReportedMandateChange } from "./mandate-rules";
import {
    nextMandateStatus,
    safeDisplayHint,
    safeFailureReason,
    SETUP_TTL_MS,
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
    method: string | null;
    setupSource: string | null;
    setupAccountId: string | null;
}

const ROW_SELECT = {
    id: true,
    subscriptionId: true,
    status: true,
    activatedAt: true,
    providerMandateId: true,
    cancelConfirmedAt: true,
    method: true,
    setupSource: true,
    setupAccountId: true,
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
    let row = await findMandate(tx, organizationId, provider, change);
    if (!row) {
        // A plan joined with autopay has no row until its payment starts
        // the subscription (D12): the report waits on the join's draft.
        if (await holdForJoinInTx(tx, organizationId, provider, change)) {
            return { applied: true };
        }
        // The join was paid meanwhile, and its row made.
        row = await findMandate(tx, organizationId, provider, change);
    }
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
            await cancelOpenCharges(tx, organizationId, row.id);
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
                await cancelOpenCharges(tx, organizationId, old.id);
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
            setUpBy(row),
            {
                data: {
                    method: isMandateMethod(change.method)
                        ? change.method
                        : row.method,
                    ...(row.setupSource ? { source: row.setupSource } : {}),
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

/**
 * Who set a mandate up, for the log (D12): the customer from their site
 * account (the Prices page or the account), the customer from a pay link
 * (no account: whoever holds the link is taken as the customer the invoice
 * is for) or from a set-up link staff sent them (D14, the same), or Saroh
 * when nothing says.
 */
function setUpBy(
    row: Pick<MandateRow, "setupSource" | "setupAccountId">,
): SubscriptionActor {
    if (row.setupAccountId) return customerActor(row.setupAccountId);
    if (row.setupSource === "PAY_LINK" || row.setupSource === "SETUP_LINK") {
        return {
            actorKind: "CUSTOMER",
            actorUserId: null,
            customerAccountId: null,
        };
    }
    return JOB;
}

/**
 * Hold a report for a set-up started while joining a plan (D12), whose row
 * doesn't exist until the join's payment lands: kept on the draft, under
 * its lock, and applied when the row is made (`plan-join-autopay.ts`).
 * False when no waiting draft started this set-up.
 */
async function holdForJoinInTx(
    tx: Tx,
    organizationId: string,
    provider: string,
    change: ReportedMandateChange,
): Promise<boolean> {
    if (!change.setupReference) return false;
    const draft = await tx.invoice.findFirst({
        where: {
            organizationId,
            source: "SUBSCRIPTION",
            status: "DRAFT",
            number: null,
            planTerms: {
                path: ["autopay", "setupReference"],
                equals: change.setupReference,
            },
        },
        select: { id: true },
    });
    if (!draft) return false;
    // The payment's webhook takes the same lock before it joins.
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${draft.id} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const locked = await tx.invoice.findFirst({
        where: { id: draft.id, organizationId, status: "DRAFT" },
        select: { planTerms: true },
    });
    const autopay = readJoinAutopay(locked?.planTerms);
    if (
        !locked?.planTerms ||
        typeof locked.planTerms !== "object" ||
        Array.isArray(locked.planTerms) ||
        autopay?.provider !== provider ||
        autopay.setupReference !== change.setupReference
    ) {
        return false;
    }
    await tx.invoice.update({
        where: { id: draft.id },
        data: {
            planTerms: {
                ...locked.planTerms,
                autopay: { ...autopay, reported: { ...heldReportOf(change) } },
            },
        },
    });
    return true;
}

function isWholePositive(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * The provider named the mandate a set-up made (D19): Razorpay's
 * authorisation payment carries the token id, which its token webhooks
 * never tie to a link or order. Writes the id (and the provider's
 * customer) onto the PENDING mandate whose set-up it paid, once — only
 * while it has none, so a later or repeated payment changes nothing.
 * Returns the mandate linked and when its set-up started, or null: the
 * row's making, or earlier for a plan joined with autopay (D12), whose row
 * is made only when the payment lands — its set-up started a set-up TTL
 * before `setupExpiresAt`.
 */
export async function linkMandateSetupInTx(
    tx: Tx,
    organizationId: string,
    provider: string,
    link: {
        providerMandateId: string;
        providerCustomerId?: string;
        setupReferences: string[];
    },
): Promise<{ mandateId: string; startedAt: Date } | null> {
    if (link.setupReferences.length === 0) return null;
    const row = await tx.paymentMandate.findFirst({
        where: {
            organizationId,
            provider,
            status: "PENDING",
            providerMandateId: null,
            setupReference: { in: link.setupReferences },
        },
        select: { id: true, createdAt: true, setupExpiresAt: true },
        orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    const { count } = await tx.paymentMandate.updateMany({
        where: { id: row.id, status: "PENDING", providerMandateId: null },
        data: {
            providerMandateId: link.providerMandateId,
            ...(link.providerCustomerId
                ? { providerCustomerId: link.providerCustomerId }
                : {}),
        },
    });
    if (count === 0) return null;
    const setupStarted = row.setupExpiresAt
        ? new Date(row.setupExpiresAt.getTime() - SETUP_TTL_MS)
        : row.createdAt;
    return {
        mandateId: row.id,
        startedAt: setupStarted < row.createdAt ? setupStarted : row.createdAt,
    };
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
