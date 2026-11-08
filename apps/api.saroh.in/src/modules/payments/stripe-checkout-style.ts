/**
 * Where a Stripe customer pays (owner, 8 Nov 2026, DEC-208): on Stripe's
 * hosted Checkout page (the default, as it handles every country's rules)
 * or in Saroh's own card window on the business's page. Kept per Stripe
 * connection (`MerchantPaymentProvider.checkoutStyle`); null reads as
 * hosted, and other providers have no choice.
 */
export const STRIPE_CHECKOUT_STYLES = ["HOSTED", "WINDOW"] as const;
export type StripeCheckoutStyle = (typeof STRIPE_CHECKOUT_STYLES)[number];

/** Whether a connection's customers pay in Saroh's card window. */
export function paysInWindow(row: {
    provider: string;
    checkoutStyle?: string | null;
}): boolean {
    return row.provider === "STRIPE" && row.checkoutStyle === "WINDOW";
}

/** A Stripe connection's choice as the workspace reads it; null for others. */
export function checkoutStyleOf(row: {
    provider: string;
    checkoutStyle?: string | null;
}): StripeCheckoutStyle | null {
    if (row.provider !== "STRIPE") return null;
    return paysInWindow(row) ? "WINDOW" : "HOSTED";
}
