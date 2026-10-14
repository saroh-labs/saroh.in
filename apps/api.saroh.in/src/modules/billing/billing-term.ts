import type { Prisma } from "@saroh/database";
import { addMonthsUtc, autopayCharges } from "@saroh/pricing-catalog";

import type { PaymentKind } from "./checkout-quote";
import { renewOpen } from "./checkout-quote";
import { catalogueOfVersion } from "./offers";

/**
 * How long what a business approved runs (DEC-093, DEC-161, #803), as one
 * pure rule the quote, the plan page and the hourly sweep share. The code
 * calls it the "term"; a business never reads that word, and it is not a
 * price promise (DEC-161: prices can change, with notice and approval).
 *
 * - **Monthly** is a provider subscription made for the number of charges
 *   one autopay approval covers (`autopayCharges` of the catalogue version
 *   its checkout was made on: 12 today). It runs out that many months after
 *   its charges start (the checkout's `startAt`, or, for a plan whose first
 *   charge was taken as it was authorised, when the checkout completed).
 * - **Yearly** is one payment for the year (`ONE_TIME_PAYMENT`): it ends
 *   with the year paid for.
 *
 * Inside the last `RENEW_WINDOW_DAYS` the same plan quotes as `RENEW`: one
 * confirmation approves the next autopay from the day this one runs out.
 * One nobody renews runs to its end and the business is then on Free (the
 * safest reading of DEC-093: nothing paid for is cut short, nothing unpaid
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
    /**
     * Monthly charges its autopay was made for (DEC-161): its plan's
     * catalogue version's `autopay.charges` (`termCheckoutOf`).
     */
    autopayCharges: number;
}

export interface Term {
    payment: PaymentKind;
    endsAt: Date;
    /** Inside the renewal window: the same plan quotes as `RENEW`. */
    renewOpen: boolean;
    /** Monthly charges the autopay covers; 1 for a year paid once. */
    charges: number;
}

/** What to read of a checkout for {@link termCheckoutOf}. */
export const TERM_CHECKOUT_SELECT = {
    providerPlanId: true,
    cycle: true,
    startAt: true,
    completedAt: true,
    createdAt: true,
    plan: { select: { version: true } },
} as const;

type Db = Pick<Prisma.TransactionClient, "pricingCatalogVersion">;

/**
 * Monthly charges one autopay approval covers on a catalogue version
 * (DEC-161). A published version never changes, so the count a checkout
 * was made with is always its plan's version's. A plan from before the
 * catalogue, or a version that can't be read, is the 12 every autopay had
 * before the setting.
 */
export async function autopayChargesOfVersion(
    db: Db,
    version: number,
): Promise<number> {
    return autopayCharges(await catalogueOfVersion(db, version));
}

/** A checkout row read with {@link TERM_CHECKOUT_SELECT}, as the rule's. */
export async function termCheckoutOf<
    T extends Omit<TermCheckout, "autopayCharges"> & {
        plan: { version: number };
    },
>(db: Db, row: T | null): Promise<(T & TermCheckout) | null> {
    if (!row) return null;
    return {
        ...row,
        autopayCharges: await autopayChargesOfVersion(db, row.plan.version),
    };
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
        endsAt = addMonthsUtc(start, checkout.autopayCharges);
    }
    if (!endsAt) return null;
    const oneTime = isOneTime(checkout);
    return {
        payment: oneTime ? "ONE_TIME" : "AUTOPAY",
        endsAt,
        renewOpen: renewOpen(endsAt, now),
        charges: oneTime ? 1 : checkout.autopayCharges,
    };
}
