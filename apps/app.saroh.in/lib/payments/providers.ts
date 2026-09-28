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

/** A payment connection as the providers list answers it. */
export interface ProviderConnection {
    provider?: string;
    status: string;
    publicKey?: string | null;
}

/**
 * A connection a customer's checkout window can open with (DEC-054): a
 * Razorpay one needs its public key id, so one still missing it counts as
 * none wherever a pay link is offered — the link could only fail on the
 * customer's phone. The API refuses the same (`OPENS_CHECKOUT`).
 */
export function opensCheckout(row: ProviderConnection): boolean {
    if (row.status !== "CONNECTED") return false;
    if ((row.provider ?? "").toUpperCase() !== "RAZORPAY") return true;
    return Boolean(row.publicKey?.trim());
}
