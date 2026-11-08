import { CHECKOUT_CLOSED_REASON } from "@saroh/site-blocks";

/**
 * The API's 409 `checkout-closed` (plan 2026-11-07-002, KTD-13): the
 * Stripe checkout an idempotency key started was cancelled, ran out, or
 * was made before hosted Checkout. The page starts again under a new key.
 */
export function checkoutClosed(status: number, body: unknown): boolean {
    if (status !== 409 || typeof body !== "object" || body === null) {
        return false;
    }
    const b = body as {
        details?: { reason?: unknown };
        error?: { details?: { reason?: unknown } };
    };
    return (
        (b.error?.details?.reason ?? b.details?.reason) ===
        CHECKOUT_CLOSED_REASON
    );
}
