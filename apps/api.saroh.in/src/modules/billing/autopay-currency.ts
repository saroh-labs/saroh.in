import type { CatalogTax } from "@saroh/pricing-catalog";

/**
 * Which currencies Saroh's billing provider renews on autopay for Saroh's
 * own account (stage 9, U1). Razorpay test mode refused a USD Plan on
 * 6 Nov 2026 ("Currency provided is not supported"), so a plan in any other
 * currency is paid one month at a time: an order each month, with DEC-210's
 * payment due between (`providers/RAZORPAY_USD.md`). A currency joins here
 * only once Razorpay confirms its Subscriptions for the account and a live
 * renewal is watched.
 */
export const AUTOPAY_CURRENCIES: ReadonlySet<string> = new Set(["INR"]);

/** Whether a plan in this currency renews on autopay. Unset is rupees. */
export function autopayTakes(currency: string | null | undefined): boolean {
    return AUTOPAY_CURRENCIES.has(currency ?? "INR");
}

/**
 * The smallest card payment the provider takes in a currency, in minor
 * units: Razorpay's USD 1.00 for an international card. Rupees keep the
 * rules they had (none asked here).
 */
const PROVIDER_MINIMUM_MINOR: Readonly<Record<string, number>> = { USD: 100 };

export function providerMinimumMinor(currency: string): number {
    return PROVIDER_MINIMUM_MINOR[currency] ?? 0;
}

/**
 * The tax a plan row in this currency carries, where only the row is at
 * hand (a checkout's pay-now): GST in rupees, none otherwise. The catalogue
 * refuses GST outside rupees, and every rupee catalogue is India's.
 */
export function planTaxOf(currency: string | null | undefined): CatalogTax {
    return (currency ?? "INR") === "INR" ? "gst" : "none";
}
