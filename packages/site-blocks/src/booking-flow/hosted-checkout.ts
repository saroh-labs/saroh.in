/**
 * The few words and helpers every paying surface shares for Stripe's
 * hosted Checkout (plan 2026-11-07-002, U8), kept apart from the provider
 * windows in `checkout.ts`, which tests replace whole.
 */

/**
 * Whether a handoff leaves the page for the provider's own (Stripe's hosted
 * Checkout), rather than opening a window. A Stripe handoff with a client
 * secret opens Saroh's card window instead (DEC-208, 8 Nov).
 */
export function leavesForProvider(
    handoff:
        | { provider: string; clientParams?: Record<string, unknown> }
        | null
        | undefined,
): boolean {
    return (
        handoff?.provider === "STRIPE" &&
        typeof handoff.clientParams?.clientSecret !== "string"
    );
}

/** Said while the page leaves for the provider's page (Stripe's hosted Checkout): never the provider's name (customer-words.test.tsx). */
export const TO_PAYMENT_PAGE_WORDS = "Taking you to the secure payment page…";

/**
 * Where the customer is now, as the create-intent request's `returnPath`:
 * the page a hosted checkout (Stripe) sends them back to after a cancel,
 * or after paying. Undefined off the browser. The API keeps it only when
 * it is a same-site path.
 */
export function returnPathHere(): string | undefined {
    if (typeof window === "undefined") return undefined;
    const path = `${window.location.pathname}${window.location.search}`;
    return path.startsWith("/") && path.length <= 512 ? path : undefined;
}

/**
 * The API's answer that a Stripe checkout can't be paid any more (KTD-13):
 * cancelled, expired, or made before hosted Checkout. Start again.
 */
export const CHECKOUT_CLOSED_REASON = "checkout-closed";
