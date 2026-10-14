import type { Prisma } from "@saroh/database";

import { moneyWordsMinor } from "../../common/words-format";

type Tx = Prisma.TransactionClient;

/**
 * A price change ahead (DEC-161). There is no price lock: a new catalogue
 * version may change what a business already on a plan pays. Published
 * with "move them", each such business gets a pending move to its plan on
 * the new version, at its first billing date at least `PRICE_NOTICE_DAYS`
 * (30) after go-live (`pricing/moves.service.ts`), and is told then, by
 * email and in its inbox (`pricing/move-notice.handler.ts`), and on
 * Settings › Plan and billing. Its autopay never changes its amount by
 * itself, so it is asked to approve the new amount (a SCHEDULED checkout
 * to the new row). Until it does, the move waits (`moveReadiness`:
 * `needs-authorisation`) and it keeps paying the price it has on the
 * autopay it has: nothing moves it to Free or stops a charge.
 *
 * Pure words and one read, shared by the inbox notice and the email so
 * both say the same.
 */
export interface PriceChange {
    organizationId: string;
    planName: string;
    /** What it pays now, and will pay, before GST, per `interval`. */
    fromPaise: number;
    toPaise: number;
    interval: "month" | "year";
    /** When the new price was to start: the move's date. */
    pendingFrom: Date;
}

/** "₹999 a month plus GST". */
export function priceWords(paise: number, interval: "month" | "year") {
    return `${moneyWordsMinor(paise, "INR")} ${interval === "year" ? "a year" : "a month"} plus GST`;
}

/**
 * The price change a move notice is about, read now; null when the move
 * changed since (cancelled, replaced, applied), costs the same, or the
 * business has already approved the new amount (a SCHEDULED checkout to
 * the new row): nothing left to tell it.
 */
export async function priceChangeOf(
    db: Pick<Tx, "subscription" | "billingCheckout">,
    p: { subscriptionId: string; pendingPlanId: string; pendingFrom: string },
): Promise<PriceChange | null> {
    const sub = await db.subscription.findUnique({
        where: { id: p.subscriptionId },
        select: {
            organizationId: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            pendingPlanId: true,
            pendingFrom: true,
            plan: { select: { priceCents: true, interval: true } },
            pendingPlan: {
                select: { name: true, priceCents: true, interval: true },
            },
        },
    });
    if (
        !sub?.pendingPlan ||
        !sub.pendingFrom ||
        sub.pendingPlanId !== p.pendingPlanId ||
        sub.pendingFrom.toISOString() !== p.pendingFrom
    ) {
        return null;
    }
    // A price change is one the provider would charge: a paid plan billed
    // through it, moving to another paid amount on the same cycle.
    if (
        sub.status === "CANCELLED" ||
        !sub.provider ||
        !sub.providerSubscriptionId ||
        sub.plan.priceCents <= 0 ||
        sub.pendingPlan.priceCents <= 0 ||
        sub.pendingPlan.priceCents === sub.plan.priceCents ||
        sub.pendingPlan.interval !== sub.plan.interval
    ) {
        return null;
    }
    const approved = await db.billingCheckout.findFirst({
        where: {
            organizationId: sub.organizationId,
            status: "SCHEDULED",
            planId: p.pendingPlanId,
        },
        select: { id: true },
    });
    if (approved) return null;
    return {
        organizationId: sub.organizationId,
        planName: sub.pendingPlan.name,
        fromPaise: sub.plan.priceCents,
        toPaise: sub.pendingPlan.priceCents,
        interval: sub.plan.interval === "year" ? "year" : "month",
        pendingFrom: sub.pendingFrom,
    };
}
