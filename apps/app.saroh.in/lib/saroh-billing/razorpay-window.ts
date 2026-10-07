import type { CheckoutHandoff } from "./plan-view";

/**
 * Razorpay's own checkout window, opened over Settings › Plan and billing
 * to pay Saroh (DEC-093, UX-003): the business never leaves the page, its
 * details come pre-filled, and paying returns straight to the page, which
 * then confirms with the API. Browser-only.
 *
 * - `paid`: Razorpay says the payment (or the mandate) went through.
 * - `closed`: the window was closed without paying.
 * - `unavailable`: the window couldn't be opened (script blocked, offline).
 */
export type WindowOutcome = "paid" | "closed" | "unavailable";

const SDK = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayWindow {
    open(): void;
}
type RazorpayConstructor = new (
    options: Record<string, unknown>,
) => RazorpayWindow;
type SdkWindow = Window & { Razorpay?: RazorpayConstructor };

let loading: Promise<boolean> | null = null;

/** Load the SDK once; a failed load may be tried again. */
function loadSdk(): Promise<boolean> {
    if ((window as SdkWindow).Razorpay) return Promise.resolve(true);
    if (loading) return loading;
    loading = new Promise<boolean>((resolve) => {
        const script = document.createElement("script");
        script.src = SDK;
        script.async = true;
        script.onload = () => resolve(Boolean((window as SdkWindow).Razorpay));
        script.onerror = () => {
            loading = null;
            script.remove();
            resolve(false);
        };
        document.head.appendChild(script);
    });
    return loading;
}

/** Only what Razorpay's options take, with nothing empty sent. */
function prefillOf(h: CheckoutHandoff): Record<string, string> {
    const out: Record<string, string> = {};
    if (h.prefill.name) out.name = h.prefill.name;
    if (h.prefill.email) out.email = h.prefill.email;
    if (h.prefill.contact) out.contact = h.prefill.contact;
    return out;
}

/** Open the window for one subscription or order; settles once. */
export async function openRazorpayWindow(
    handoff: CheckoutHandoff,
    description: string,
): Promise<WindowOutcome> {
    if (!(await loadSdk())) return "unavailable";
    const Razorpay = (window as SdkWindow).Razorpay;
    if (!Razorpay) return "unavailable";
    return new Promise<WindowOutcome>((resolve) => {
        let settled = false;
        const settle = (o: WindowOutcome) => {
            if (settled) return;
            settled = true;
            resolve(o);
        };
        try {
            const rzp = new Razorpay({
                key: handoff.keyId,
                ...(handoff.subscriptionId
                    ? { subscription_id: handoff.subscriptionId }
                    : {
                          order_id: handoff.orderId,
                          amount: handoff.amountPaise ?? undefined,
                          currency: handoff.currency,
                      }),
                name: "Saroh",
                description,
                prefill: prefillOf(handoff),
                // Razorpay keeps the window open after a failed attempt so
                // it can be tried again; only success or closing settles.
                handler: () => settle("paid"),
                modal: { ondismiss: () => settle("closed") },
            });
            rzp.open();
        } catch {
            // The SDK refused the options: the page link is the way.
            settle("unavailable");
        }
    });
}
