import type { Prisma } from "@saroh/database";
import { unsyncedCatalogueVersions } from "@saroh/database";

import { clearAddonsInTx } from "./addon-charges";
import { periodEnd } from "./checkout-quote";
import { enqueueProviderCancel } from "./provider-cancel.job";

type Tx = Prisma.TransactionClient;

/**
 * Applying a subscription's pending move (pricing catalogue U15, KTD-4).
 *
 * A pending move (`pendingPlanId` + `pendingFrom`, both or neither — a
 * CHECK) is either "move them" from a publish (U4) or a change the business
 * chose for the end of its period (a cheaper plan, the other cycle, Free).
 * When its date comes it is applied by the renewal path: a `charged` or
 * `cancelled` webhook from the provider, or the hourly sweep for whatever no
 * webhook reaches (Free plans bill nothing). The access read
 * (`CatalogueAccessService`) follows the same rule, so access and billing
 * agree on the plan a business is on.
 *
 * A due move applies only when it can be billed as it reads:
 *
 * - **held**: its version's paid plans aren't at the billing provider yet
 *   (RECOMMENDATIONS 5). It waits.
 * - **needs-authorisation**: the provider is charging the old amount and the
 *   new plan costs something else (OQ-6). Never applied silently; it waits
 *   until the business authorises the new amount (a SCHEDULED checkout).
 * - **ready**: everything else — no provider (Free, or billed by hand), the
 *   same amount on the same cycle, a move to Free whose provider subscription
 *   was told to end with the period, or one the business has authorised.
 */
export type MoveReadiness =
    "none" | "not-due" | "held" | "needs-authorisation" | "ready";

export interface MovePlanRow {
    id: string;
    key: string;
    version: number;
    interval: string;
    priceCents: number;
}

export interface MoveSubscription {
    status: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    cancelAtPeriodEnd: boolean;
    pendingPlanId: string | null;
    pendingFrom: Date | null;
    plan: MovePlanRow;
    pendingPlan: MovePlanRow | null;
}

/** The pure rule; `held` are the versions not yet at the provider. */
export function moveReadiness(input: {
    subscription: MoveSubscription;
    /** The business's SCHEDULED checkout, if any: the plan it authorised. */
    scheduledPlanId: string | null;
    held: ReadonlySet<number>;
    now: Date;
}): MoveReadiness {
    const { subscription: sub, now } = input;
    const target = sub.pendingPlan;
    if (!target || !sub.pendingFrom) return "none";
    if (sub.pendingFrom.getTime() > now.getTime()) return "not-due";
    if (input.held.has(target.version)) return "held";
    if (input.scheduledPlanId === target.id) return "ready";
    const billed =
        sub.status !== "CANCELLED" &&
        Boolean(sub.provider && sub.providerSubscriptionId) &&
        sub.plan.priceCents > 0;
    if (!billed) return "ready";
    if (target.priceCents === 0 && sub.cancelAtPeriodEnd) return "ready";
    if (
        target.priceCents === sub.plan.priceCents &&
        target.interval === sub.plan.interval
    ) {
        return "ready";
    }
    return "needs-authorisation";
}

const PLAN_SELECT = {
    id: true,
    key: true,
    version: true,
    interval: true,
    priceCents: true,
} as const;

export type AppliedMove =
    | { applied: true; planId: string }
    | { applied: false; readiness: MoveReadiness };

/**
 * Apply the subscription's move if it is due and ready, on the caller's
 * transaction, under the subscription's row lock. Idempotent: a move
 * already applied is gone, so a second call finds "none".
 *
 * Applying sets `planId` and the cycle and clears both pending columns
 * together. A move the business authorised (its SCHEDULED checkout) also
 * takes that checkout's provider subscription and completes it; a move to a
 * free plan leaves the provider behind (its subscription was told to end
 * with the period when the change was made).
 */
export async function applyDueMoveInTx(
    tx: Tx,
    subscriptionId: string,
    now: Date,
    options: { currentPeriodEnd?: Date | null } = {},
): Promise<AppliedMove> {
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
    const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            pendingPlanId: true,
            pendingFrom: true,
            plan: { select: PLAN_SELECT },
            pendingPlan: { select: PLAN_SELECT },
        },
    });
    if (!sub) return { applied: false, readiness: "none" };
    if (!sub.pendingPlan || !sub.pendingFrom) {
        return { applied: false, readiness: "none" };
    }
    if (sub.pendingFrom.getTime() > now.getTime()) {
        return { applied: false, readiness: "not-due" };
    }
    const scheduled = await tx.billingCheckout.findFirst({
        where: { organizationId: sub.organizationId, status: "SCHEDULED" },
    });
    const held = new Set(await unsyncedCatalogueVersions(tx));
    const readiness = moveReadiness({
        subscription: sub,
        scheduledPlanId: scheduled?.planId ?? null,
        held,
        now,
    });
    if (readiness !== "ready") return { applied: false, readiness };

    const target = sub.pendingPlan;
    const cycle = target.interval === "year" ? "year" : "month";
    const data: Prisma.SubscriptionUncheckedUpdateInput = {
        planId: target.id,
        billingCycle: cycle,
        pendingPlanId: null,
        pendingFrom: null,
    };

    if (scheduled?.planId === target.id) {
        // The business authorised this plan: its provider subscription
        // takes over from the one that ended with the period.
        data.provider = scheduled.provider;
        data.providerSubscriptionId = scheduled.providerSubscriptionId;
        data.providerCustomerId = scheduled.providerCustomerId;
        data.status = "ACTIVE";
        data.cancelAtPeriodEnd = false;
        data.freeChosenAt = null;
        data.currentPeriodEnd =
            options.currentPeriodEnd ??
            periodEnd(scheduled.startAt ?? sub.pendingFrom, cycle);
        await tx.billingCheckout.update({
            where: { id: scheduled.id },
            data: { status: "COMPLETED", completedAt: now },
        });
        // The old one was told to end with the period; make sure it has.
        if (
            sub.provider &&
            sub.providerSubscriptionId &&
            sub.providerSubscriptionId !== scheduled.providerSubscriptionId
        ) {
            await enqueueProviderCancel(tx, {
                organizationId: sub.organizationId,
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
                atCycleEnd: true,
            });
        }
    } else if (target.priceCents === 0) {
        // Free bills nothing: no provider, no period, no add-ons (U16).
        await clearAddonsInTx(tx, sub.id);
        data.provider = null;
        data.providerSubscriptionId = null;
        data.providerCustomerId = null;
        data.status = "ACTIVE";
        data.cancelAtPeriodEnd = false;
        data.freeChosenAt = null;
        data.currentPeriodEnd = null;
        data.providerEventAt = null;
    } else if (options.currentPeriodEnd !== undefined) {
        data.currentPeriodEnd = options.currentPeriodEnd;
    }

    await tx.subscription.update({ where: { id: sub.id }, data });
    return { applied: true, planId: target.id };
}
