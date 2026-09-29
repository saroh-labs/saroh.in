import type { Prisma } from "@saroh/database";

import type { SubscriptionActor } from "../subscriptions/subscription-events";
import {
    JOB,
    recordSubscriptionEvent,
} from "../subscriptions/subscription-events";

/**
 * A mandate ends with what the customer authorised it for (round-2 D20,
 * DEC-038): its subscription, their details, or their contact in a merge.
 *
 * This file is the in-transaction half, for callers that already hold a
 * transaction (every move of a subscription to CANCELLED, and a merge): it
 * marks the live mandates in scope CANCELLED in that transaction — so none
 * is charged again, whatever the provider says later — and writes the
 * `mandate.cancel` job that asks the provider after commit (the outbox,
 * DEC-008). A provider timeout never rolls the caller back.
 *
 * `MandatesService.cancelFor` is the synchronous half, for a privacy removal
 * (C11) that must hear the provider's answer before it goes ahead.
 */

/** The job that asks the provider to cancel the mandates in a scope. */
export const MANDATE_CANCEL_TYPE = "mandate.cancel";

/**
 * Tries before the job gives up confirming: backing off from a second to
 * five minutes, twelve spread over about twenty minutes. A mandate still
 * unconfirmed after that stays CANCELLED (never charged), with
 * `cancelConfirmedAt` null, and the job is FAILED where it can be seen.
 */
export const MANDATE_CANCEL_ATTEMPTS = 12;

/** Why a mandate was cancelled (`PaymentMandate.cancelReason`). */
export type MandateCancelReason =
    | "CUSTOMER"
    | "STAFF"
    | "SUBSCRIPTION_ENDED"
    | "PRIVACY_REMOVAL"
    | "MERGED"
    | "PROVIDER"
    /** A new authorisation for the same subscription took its place (D11). */
    | "REPLACED";

/** A mandate that can still be charged, or become chargeable. */
export const LIVE_MANDATE_STATUSES = ["PENDING", "ACTIVE", "PAUSED"] as const;

/** Every mandate of one subscription, or every mandate one contact set up. */
export type MandateScope =
    | { organizationId: string; subscriptionId: string }
    | { organizationId: string; contactId: string };

/** The job's payload: the scope's id, never data (`backend-jobs.md`). */
export type MandateCancelPayload =
    { subscriptionId: string } | { contactId: string };

export function scopeWhere(
    scope: MandateScope,
): Prisma.PaymentMandateWhereInput {
    return "subscriptionId" in scope
        ? {
              organizationId: scope.organizationId,
              subscriptionId: scope.subscriptionId,
          }
        : { organizationId: scope.organizationId, contactId: scope.contactId };
}

export function scopePayload(scope: MandateScope): MandateCancelPayload {
    return "subscriptionId" in scope
        ? { subscriptionId: scope.subscriptionId }
        : { contactId: scope.contactId };
}

/** The scope a job names, or null when its payload names none. */
export function scopeOfJob(
    organizationId: string | null,
    payload: unknown,
): MandateScope | null {
    if (!organizationId || typeof payload !== "object" || payload === null) {
        return null;
    }
    const { subscriptionId, contactId } = payload as Record<string, unknown>;
    if (typeof subscriptionId === "string" && subscriptionId.length > 0) {
        return { organizationId, subscriptionId };
    }
    if (typeof contactId === "string" && contactId.length > 0) {
        return { organizationId, contactId };
    }
    return null;
}

export interface MarkedCancelled {
    /** Mandates this call moved to CANCELLED. */
    cancelled: number;
    /** Of those, the ones the provider still has to confirm. */
    awaitingProvider: number;
}

/**
 * Mark every live mandate in scope CANCELLED, write "Autopay cancelled" on
 * each one's subscription (actor JOB, or `actor` — staff's "Cancel
 * autopay", D14; `data.reason`), and — unless `queue` is false — write the
 * `mandate.cancel` job when any is at the provider.
 *
 * A mandate that never reached the provider (no provider id) is confirmed
 * on the spot: there is nothing to ask. Each row moves under its own
 * conditional update, so two callers racing on one mandate cancel it once
 * and write one event. With nothing live in scope it writes nothing and
 * queues nothing (`backend-jobs.md`: never enqueue a no-op).
 */
export async function cancelMandatesInTx(
    tx: Prisma.TransactionClient,
    scope: MandateScope,
    reason: MandateCancelReason,
    opts: { queue?: boolean; now?: Date; actor?: SubscriptionActor } = {},
): Promise<MarkedCancelled> {
    const live = await tx.paymentMandate.findMany({
        where: {
            ...scopeWhere(scope),
            status: { in: [...LIVE_MANDATE_STATUSES] },
        },
        select: { id: true, subscriptionId: true, providerMandateId: true },
        orderBy: { id: "asc" },
    });
    const now = opts.now ?? new Date();
    const marked: MarkedCancelled = { cancelled: 0, awaitingProvider: 0 };
    const ended = new Set<string>();
    for (const mandate of live) {
        const atProvider = mandate.providerMandateId !== null;
        const { count } = await tx.paymentMandate.updateMany({
            where: {
                id: mandate.id,
                status: { in: [...LIVE_MANDATE_STATUSES] },
            },
            data: {
                status: "CANCELLED",
                cancelledAt: now,
                cancelReason: reason,
                cancelConfirmedAt: atProvider ? null : now,
            },
        });
        if (count === 0) continue;
        marked.cancelled += 1;
        if (atProvider) marked.awaitingProvider += 1;
        ended.add(mandate.subscriptionId);
    }
    for (const subscriptionId of ended) {
        await recordSubscriptionEvent(
            tx,
            scope.organizationId,
            subscriptionId,
            "MANDATE_CANCELLED",
            opts.actor ?? JOB,
            { data: { reason } },
        );
    }
    if (opts.queue !== false && marked.awaitingProvider > 0) {
        await enqueueMandateCancelInTx(tx, scope);
    }
    return marked;
}

/** Write the job that asks the provider to confirm the scope's cancels. */
export async function enqueueMandateCancelInTx(
    tx: Prisma.TransactionClient,
    scope: MandateScope,
): Promise<void> {
    await tx.job.create({
        data: {
            organizationId: scope.organizationId,
            type: MANDATE_CANCEL_TYPE,
            payload: scopePayload(scope),
            maxAttempts: MANDATE_CANCEL_ATTEMPTS,
        },
    });
}
