import type { Catalog, Plan } from "./schema";

/**
 * Money for the catalogue: integer paise in, integer paise out (KTD-18).
 * GST is computed once per line and rounded half-up to the paisa.
 */

/** India's GST rate on Saroh's service, in percent. */
export const GST_PERCENT = 18;

export type BillingCycle = "month" | "year";
export const BILLING_CYCLES: readonly BillingCycle[] = ["month", "year"];

function assertPaise(n: number): void {
    if (!Number.isSafeInteger(n) || n < 0) {
        throw new RangeError(
            `Expected a non-negative whole number of paise, got ${n}`,
        );
    }
}

/** a / b rounded half-up, for non-negative integers. */
function divHalfUp(a: number, b: number): number {
    return Math.floor((2 * a + b) / (2 * b));
}

/** The GST on one line, rounded half-up to the paisa. */
export function gstPaise(linePaise: number): number {
    assertPaise(linePaise);
    return divHalfUp(linePaise * GST_PERCENT, 100);
}

/** One line with its GST added. */
export function withGstPaise(linePaise: number): number {
    return linePaise + gstPaise(linePaise);
}

/** A yearly charge: "pay for N months, get 12". */
export function yearlyPaise(monthlyPaise: number, paidMonths: number): number {
    assertPaise(monthlyPaise);
    return monthlyPaise * paidMonths;
}

/** What a yearly charge comes to a month (the "about X a month" line), half-up. */
export function monthlyEquivalentPaise(yearPaise: number): number {
    assertPaise(yearPaise);
    return divHalfUp(yearPaise, 12);
}

/** A plan's price before GST for a billing cycle. */
export function planPricePaise(
    catalog: Pick<Catalog, "yearly">,
    plan: Pick<Plan, "pricePaise">,
    cycle: BillingCycle,
): number {
    return cycle === "year"
        ? yearlyPaise(plan.pricePaise, catalog.yearly.paid)
        : plan.pricePaise;
}

const whole = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/**
 * Rupees for people, `en-IN` grouping: whole rupees without decimals, and two
 * decimals only when there are paise. Formatting never rounds a charge; it
 * only shows one.
 */
export function formatInr(amountPaise: number): string {
    if (!Number.isSafeInteger(amountPaise)) {
        throw new RangeError(`Expected whole paise, got ${amountPaise}`);
    }
    return amountPaise % 100 === 0
        ? whole.format(amountPaise / 100)
        : exact.format(amountPaise / 100);
}

/** A count for people, `en-IN` grouping. */
export function formatCount(n: number): string {
    return n.toLocaleString("en-IN");
}
