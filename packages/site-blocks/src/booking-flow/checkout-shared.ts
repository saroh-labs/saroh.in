import type { PaymentHandoff } from "./api";

/**
 * What every provider window shares (`checkout.ts` and Saroh's Stripe card
 * window, `stripe-window.ts`): the request, its outcome, and loading an
 * SDK once. Its own module, so both import it without a cycle.
 */

/** What the provider's window ended with. */
export type CheckoutOutcome =
    /** The window closed on a payment; its return has been posted. */
    | "paid"
    /** The provider refused the payment. The hold is kept. */
    | "failed"
    /** The booker closed the window without paying. */
    | "closed"
    /** The window could not open: no SDK, or a handoff it can't use. */
    | "unavailable";

export interface CheckoutRequest {
    handoff: PaymentHandoff;
    /** Shown at the top of the provider's window. */
    business: string;
    /** What is being paid for: the service and when. */
    description: string;
    booker: { name: string; email: string; phone?: string };
    /**
     * The public API the window's return is posted to (P1). Every
     * merchant-site checkout passes it; without one the page waits for the
     * webhook alone, as before.
     */
    apiUrl?: string;
}

/** What the provider's window handed back on a payment (P1). */
export interface CheckoutReturn {
    provider: string;
    providerOrderId: string;
    providerPaymentId?: string;
    signature?: string;
}

/** An answer from the window, with its return when it is a payment. */
export type Settle = (
    outcome: CheckoutOutcome,
    returned?: CheckoutReturn | null,
) => void;

const loading = new Map<string, Promise<void>>();

/**
 * Load a provider SDK once per page; a failed load may be tried again. One
 * the page already has (its global is set) is used as it is.
 */
export function loadScript(
    src: string,
    global: "Razorpay" | "Cashfree" | "Stripe",
): Promise<void> {
    if ((window as unknown as Record<string, unknown>)[global]) {
        return Promise.resolve();
    }
    const known = loading.get(src);
    if (known) return known;
    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
            loading.delete(src);
            script.remove();
            reject(new Error(`could not load ${src}`));
        };
        document.head.appendChild(script);
    });
    loading.set(src, promise);
    return promise;
}

export const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
