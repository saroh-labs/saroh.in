/**
 * What each payment provider is called where a merchant reads it. The API
 * sends the stored key ("RAZORPAY"); nothing on screen should shout it.
 *
 * Promoted from the storefronts screen when Order Detail became its third
 * reader (`components/invoices/pay-link.tsx` still keeps its own copy).
 */
const PROVIDER_NAME: Record<string, string> = {
    STRIPE: "Stripe",
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
    DODO: "Dodo Payments",
};

export function providerName(provider: string): string {
    return (
        PROVIDER_NAME[provider.toUpperCase()] ??
        provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase()
    );
}
