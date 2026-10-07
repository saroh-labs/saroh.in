import { addMonthsUtc } from "@saroh/pricing-catalog";

import type { PaymentKind } from "./checkout-quote";
import { renewOpen, TERM_CHARGES } from "./checkout-quote";

/**
 * A paid plan's term (DEC-093, R15, #803), as one pure rule the quote, the
 * plan page and the hourly sweep share.
 *
 * - **Monthly** is a provider subscription made for `TERM_CHARGES` charges:
 *   the term ends that many months after its charges start (the checkout's
 *   `startAt`, or, for a plan whose first charge was taken as it was
 *   authorised, when the checkout completed).
 * - **Yearly** is one payment for the year (`ONE_TIME_PAYMENT`): the term
 *   is the year paid for, so it ends with the period.
 *
 * Inside the last `RENEW_WINDOW_DAYS` the same plan quotes as `RENEW`: one
 * tap authorises a new term from the day this one ends. A term nobody
 * renews runs to its end and the business is then on Free (the safest
 * reading of DEC-093: nothing paid for is cut short, nothing unpaid
 * continues).
 */

/**
 * What a one-time payment's checkout holds where an autopay checkout keeps
 * its provider plan: there is none, the amount is the order's own.
 */
export const ONE_TIME_PAYMENT = "one-time";

/** The checkout behind a subscription, as much as the rule needs. */
export interface TermCheckout {
    providerPlanId: string;
    cycle: string;
    startAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
}

export interface Term {
    payment: PaymentKind;
    endsAt: Date;
    /** Inside the renewal window: the same plan quotes as `RENEW`. */
    renewOpen: boolean;
}

/** Whether a checkout is paid once rather than on autopay. */
export function isOneTime(checkout: Pick<TermCheckout, "providerPlanId">) {
    return checkout.providerPlanId === ONE_TIME_PAYMENT;
}

/**
 * The term of the plan a subscription is billed for, or null when it has
 * none: Free, a plan not billed through the checkout, or a yearly autopay
 * made before DEC-093 (open-ended).
 */
export function termOf(
    sub: { currentPeriodEnd: Date | null } | null,
    checkout: TermCheckout | null,
    now: Date,
): Term | null {
    if (!sub || !checkout) return null;
    let endsAt: Date | null = null;
    if (isOneTime(checkout)) {
        endsAt = sub.currentPeriodEnd;
    } else if (checkout.cycle === "month") {
        const start =
            checkout.startAt ?? checkout.completedAt ?? checkout.createdAt;
        endsAt = addMonthsUtc(start, TERM_CHARGES);
    }
    if (!endsAt) return null;
    return {
        payment: isOneTime(checkout) ? "ONE_TIME" : "AUTOPAY",
        endsAt,
        renewOpen: renewOpen(endsAt, now),
    };
}
