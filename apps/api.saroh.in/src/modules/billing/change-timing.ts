/**
 * When a change of plan takes effect (DEC-159), as pure rules the quote
 * (`checkout-quote.ts`), the change itself (`CheckoutService`), the
 * provider's events (`BillingWebhookService`) and their specs share. Saroh
 * refunds nothing, so:
 *
 * - **A dearer plan starts today.** In a paid period it pays the difference
 *   for what is left of the period. In the first month (a plan's first-month
 *   offer, or free first days: `TRIALING`) the month ends there: the dearer
 *   plan's full first charge is taken now and its autopay starts now.
 *   The offer belongs to the plan it was started on and is used once, so
 *   nobody uses a dearer plan for the first month's amount.
 * - **Anything else waits until what was paid for has run out**: a plan
 *   that costs the same or less, the other cycle, or Free, from the end of
 *   the period paid, or of the first month. The business keeps its plan
 *   until then and is charged nothing more for it.
 * - **The provider's side ending early never cuts that short.** A first
 *   month's provider subscription has no cycle to end with, so it is ended
 *   at once (its first full charge must never be taken) and the plan runs
 *   on to the month's end by Saroh's own date.
 */

/** The subscription, as much as these rules need. */
export interface TimedSubscription {
    status: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    plan: { priceCents: number };
}

/** The subscription is billed by Saroh's provider, and still running. */
export function billedByProvider(sub: TimedSubscription | null): boolean {
    return Boolean(
        sub &&
        sub.status !== "CANCELLED" &&
        sub.provider &&
        sub.providerSubscriptionId &&
        sub.plan.priceCents > 0,
    );
}

/**
 * Until when the business has paid for the plan it is on: the end of its
 * period at the provider, a first month's included. Null when nothing is
 * paid ahead (Free, a plan not billed through the provider, a period that
 * is over), so a change has nothing to wait for.
 */
export function paidUntil(
    sub: TimedSubscription | null,
    now: Date,
): Date | null {
    if (!sub || !billedByProvider(sub)) return null;
    return sub.currentPeriodEnd && sub.currentPeriodEnd > now
        ? sub.currentPeriodEnd
        : null;
}

/** The end of the first month the business is in, or null when it's in none. */
export function firstMonthEnd(
    sub: TimedSubscription | null,
    now: Date,
): Date | null {
    return sub?.status === "TRIALING" ? paidUntil(sub, now) : null;
}

/**
 * A change made during the first month: `NOW` for a plan that costs more a
 * month than the one it's on, at that plan's full price; `AT_END` for
 * every other plan, when the month ends. The same price is not a move up.
 */
export type FirstMonthMove = "NOW" | "AT_END";

export function firstMonthMove(input: {
    /** What the plan it's on costs a month, before GST. */
    fromMonthlyPaise: number;
    /** What the plan it would be on costs a month, whatever cycle is paid. */
    toMonthlyPaise: number;
}): FirstMonthMove {
    return input.toMonthlyPaise > input.fromMonthlyPaise ? "NOW" : "AT_END";
}

/**
 * How the provider subscription a business is leaving is ended: with the
 * cycle already paid, or, in a first month, at once. A first month's has
 * no cycle running (its charges start when the month ends), and left alone
 * it would take the plan's full charge then.
 */
export function leavesWithCycle(sub: { status: string }): boolean {
    return sub.status !== "TRIALING";
}

/**
 * The provider's dates drift a little from Saroh's: an ending this close
 * to the move's date is the period's end, not an early one.
 */
export const PERIOD_END_SLACK_MS = 60 * 60 * 1000;

/**
 * The provider subscription ended, and the move the business chose waits on
 * a date still ahead: the plan runs on to that date, because it is paid to
 * it. True in a first month whenever the date is ahead (its subscription
 * is ended at once, by `leavesWithCycle`), and in a paid period only when
 * the ending came clearly early. Only for a move that ends the plan it's on
 * (`cancelAtPeriodEnd`): any other pending move was never paid up to.
 */
export function runsToMoveDate(
    sub: {
        status: string;
        cancelAtPeriodEnd: boolean;
        pendingFrom: Date | null;
        currentPeriodEnd: Date | null;
    },
    now: Date,
): boolean {
    if (!sub.cancelAtPeriodEnd || !sub.pendingFrom) return false;
    if (!sub.currentPeriodEnd || sub.currentPeriodEnd <= now) return false;
    const ahead = sub.pendingFrom.getTime() - now.getTime();
    if (ahead <= 0) return false;
    return sub.status === "TRIALING" || ahead > PERIOD_END_SLACK_MS;
}
