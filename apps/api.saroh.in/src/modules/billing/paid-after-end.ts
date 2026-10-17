import type { BillingCheckout, Prisma } from "@saroh/database";

import { billingMayChargeFor } from "./business-closing";
import { enqueueProviderCancel } from "./provider-cancel.job";

type Tx = Prisma.TransactionClient;

/**
 * Money the provider took after Saroh had let go of what it was for (owner,
 * 17 Oct 2026): a checkout given up on (replaced, lapsed, the business
 * moved to Free) that the business approved anyway, or a provider
 * subscription Saroh had ended or left whose cancel hadn't reached the
 * provider. The rule: a business keeps what it paid for, unless that would
 * put it on two paid plans at once — then the provider subscription is
 * ended now and the payment refunded automatically
 * (`double-charge.ts`). These say which: null when the payment can be
 * honoured, else why it can't (the words go in the audit row and notes).
 */

/**
 * A payment on a checkout that is CANCELLED. It can be honoured — the
 * checkout completed as if it had never been dropped — unless:
 *
 * - the business may not be charged (closing or deleted, #921);
 * - the provider ended it (`provider:*`): nothing would bill the plan;
 * - it starts on a date already past (an upgrade or a scheduled change):
 *   its quote is stale, and the plan it would replace has renewed since;
 * - another plan was authorised (a SCHEDULED checkout) or completed since
 *   it was made.
 */
export async function droppedCheckoutConflictInTx(
    tx: Tx,
    checkout: BillingCheckout,
    now: Date,
): Promise<string | null> {
    if (!(await billingMayChargeFor(tx, checkout.organizationId))) {
        return "the business is closing";
    }
    if (checkout.endedReason?.startsWith("provider:")) {
        return "the provider had ended it";
    }
    if (
        checkout.kind !== "NEW" &&
        checkout.startAt &&
        checkout.startAt.getTime() <= now.getTime()
    ) {
        return "its start date had passed";
    }
    const other = await tx.billingCheckout.findFirst({
        where: {
            organizationId: checkout.organizationId,
            id: { not: checkout.id },
            OR: [
                { status: "SCHEDULED" },
                {
                    status: "COMPLETED",
                    completedAt: { gt: checkout.createdAt },
                },
            ],
        },
        select: { status: true },
    });
    if (other?.status === "SCHEDULED") return "another plan was authorised";
    if (other) return "another plan was bought since";
    return null;
}

/**
 * A charge on a provider subscription Saroh had ended (CANCELLED) or left
 * (the business moved off it). It can be honoured unless the business may
 * not be charged, or it is billed for a plan through another provider
 * subscription, or has authorised one (a SCHEDULED checkout).
 */
export async function chargeAfterEndConflictInTx(
    tx: Tx,
    organizationId: string,
    providerSubscriptionId: string,
): Promise<string | null> {
    if (!(await billingMayChargeFor(tx, organizationId))) {
        return "the business is closing";
    }
    const sub = await tx.subscription.findUnique({
        where: { organizationId },
        select: {
            status: true,
            provider: true,
            providerSubscriptionId: true,
            plan: { select: { priceCents: true } },
        },
    });
    if (
        sub &&
        sub.status !== "CANCELLED" &&
        sub.provider &&
        sub.providerSubscriptionId &&
        sub.providerSubscriptionId !== providerSubscriptionId &&
        sub.plan.priceCents > 0
    ) {
        return "it is billed for a plan through another subscription";
    }
    const scheduled = await tx.billingCheckout.findFirst({
        where: {
            organizationId,
            status: "SCHEDULED",
            providerSubscriptionId: { not: providerSubscriptionId },
        },
        select: { id: true },
    });
    if (scheduled) return "another plan was authorised";
    return null;
}

/** Every OPEN checkout but `keep` given up: a plan is back, so its quote is stale. */
export async function dropOpenCheckoutsInTx(
    tx: Tx,
    organizationId: string,
    keep: string | null,
    reason: string,
): Promise<void> {
    const open = await tx.billingCheckout.findMany({
        where: {
            organizationId,
            status: "OPEN",
            ...(keep ? { id: { not: keep } } : {}),
        },
    });
    for (const c of open) {
        await tx.billingCheckout.update({
            where: { id: c.id },
            data: { status: "CANCELLED", endedReason: reason },
        });
        await enqueueProviderCancel(tx, {
            organizationId,
            provider: c.provider,
            providerSubscriptionId: c.providerSubscriptionId,
            atCycleEnd: false,
        });
    }
}
