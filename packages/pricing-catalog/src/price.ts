import type { Catalog, CatalogTax, Plan } from "./schema";

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

/**
 * The tax on one line in a catalogue's tax mode (stage 9, KTD2): GST on
 * India's, none on an export catalogue. Minor units in, minor units out.
 */
export function taxPaise(tax: CatalogTax, lineMinor: number): number {
    assertPaise(lineMinor);
    return tax === "gst" ? gstPaise(lineMinor) : 0;
}

/** One line with its tax added, in a catalogue's tax mode. */
export function withTaxPaise(tax: CatalogTax, lineMinor: number): number {
    return lineMinor + taxPaise(tax, lineMinor);
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

type YearlyPlan = Pick<Plan, "pricePaise"> & { yearlyOfferPaise?: number };

/** A plan's regular yearly price before GST: "pay for N months, get 12". */
export function regularYearlyPaise(
    catalog: Pick<Catalog, "yearly">,
    plan: YearlyPlan,
): number {
    return yearlyPaise(plan.pricePaise, catalog.yearly.paid);
}

/**
 * What a yearly buyer is charged before GST: the plan's yearly offer when
 * it has one (DEC-239), else the regular yearly price.
 */
export function chargedYearlyPaise(
    catalog: Pick<Catalog, "yearly">,
    plan: YearlyPlan,
): number {
    return plan.yearlyOfferPaise ?? regularYearlyPaise(catalog, plan);
}

/**
 * Said near the yearly price on the pricing page and at checkout (DEC-239),
 * in step with the Terms: Saroh refunds nothing but a double charge.
 */
export const NO_REFUNDS_LINE =
    "We don't refund payments, including a yearly plan cancelled early. If you're ever charged twice, the extra charge is refunded on its own.";

/**
 * The most a yearly offer saves across the plans still offered, against 12
 * months at the regular monthly price, rounded down to a whole percent
 * (DEC-239). Null when no paid plan has a yearly offer.
 */
export function yearlySavePercent(
    catalog: Pick<Catalog, "yearly" | "plans">,
): number | null {
    let best: number | null = null;
    for (const p of catalog.plans) {
        if (p.retired || p.pricePaise <= 0) continue;
        if (p.yearlyOfferPaise === undefined) continue;
        const months = 12 * p.pricePaise;
        const save = Math.floor(
            (100 * (months - chargedYearlyPaise(catalog, p))) / months,
        );
        best = Math.max(best ?? 0, save);
    }
    return best;
}

/**
 * The Monthly/Yearly switch's yearly side: the best saving while a plan
 * has a yearly offer (DEC-239), else the months the regular rule gives free.
 */
export function yearlySwitchLabel(
    catalog: Pick<Catalog, "yearly" | "plans">,
): string {
    const save = yearlySavePercent(catalog);
    return save !== null
        ? `Yearly · save up to ${save}%`
        : `Yearly · ${Math.max(0, 12 - catalog.yearly.paid)} months free`;
}

/** A plan's charged price before GST for a billing cycle. */
export function planPricePaise(
    catalog: Pick<Catalog, "yearly">,
    plan: YearlyPlan,
    cycle: BillingCycle,
): number {
    return cycle === "year"
        ? chargedYearlyPaise(catalog, plan)
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

/**
 * Money in a catalogue's currency for people (KTD6c: Saroh's plan money is
 * in the catalogue's currency, never the business's own): rupees as
 * {@link formatInr}; other currencies with `en-US` grouping, whole units
 * without decimals and two only when there are cents.
 */
export function formatMinor(amountMinor: number, currency: string): string {
    if (currency === "INR") return formatInr(amountMinor);
    if (!Number.isSafeInteger(amountMinor)) {
        throw new RangeError(`Expected whole minor units, got ${amountMinor}`);
    }
    const cents = amountMinor % 100 !== 0;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: cents ? 2 : 0,
        maximumFractionDigits: cents ? 2 : 0,
    }).format(amountMinor / 100);
}

/** A count for people, `en-IN` grouping. */
export function formatCount(n: number): string {
    return n.toLocaleString("en-IN");
}
