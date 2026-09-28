import type { PaymentHandoff } from "./api";

/**
 * The business's own provider checkout, opened in the booker's browser (E11).
 *
 * The API has already made the provider's order for the hold's invoice and
 * answered with its non-secret handoff (`POST /public/invoices/:token/
 * payment-intent`): the amount is the invoice's, never the page's. This opens
 * that order in the provider's own window — Razorpay's Checkout, or
 * Cashfree's drop-in. Saroh never chooses or restricts the payment methods
 * (DEC-059): each window shows what the business's own account has switched
 * on, so neither the checkout nor the order sets any.
 *
 * What the window says is only ever a hint. "Paid" here means the provider's
 * window closed on a payment; the booking is confirmed by the provider's
 * webhook, which the page keeps polling the hold for. Nothing on the page
 * says "booked" until the API does.
 */

/** What the provider's window ended with. */
export type CheckoutOutcome =
    /** The window closed on a payment; the webhook confirms it. */
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
}

export interface CheckoutSession {
    /** Settles once, with the first thing the window says. */
    outcome: Promise<CheckoutOutcome>;
    /**
     * Close the window: the hold ran out, or the page moved on. Razorpay's
     * closes; Cashfree's drop-in has no close, so its answer is ignored.
     */
    close: () => void;
}

export type OpenCheckout = (request: CheckoutRequest) => CheckoutSession;

export const RAZORPAY_SDK = "https://checkout.razorpay.com/v1/checkout.js";
export const CASHFREE_SDK = "https://sdk.cashfree.com/js/v3/cashfree.js";

// ── The providers' browser SDKs, as far as this page uses them ────────────

interface RazorpayCheckout {
    open(): void;
    close(): void;
    on(event: "payment.failed", handler: (response: unknown) => void): void;
}
type RazorpayConstructor = new (
    options: Record<string, unknown>,
) => RazorpayCheckout;

interface CashfreeResult {
    error?: { message?: string; code?: string };
    paymentDetails?: unknown;
    redirect?: boolean;
}
type CashfreeFactory = (options: { mode: "production" | "sandbox" }) => {
    checkout(options: {
        paymentSessionId: string;
        redirectTarget: "_modal";
    }): Promise<CashfreeResult>;
};

type SdkWindow = Window & {
    Razorpay?: RazorpayConstructor;
    Cashfree?: CashfreeFactory;
};

const loading = new Map<string, Promise<void>>();

/**
 * Load a provider SDK once per page; a failed load may be tried again. One
 * the page already has (its global is set) is used as it is.
 */
function loadScript(
    src: string,
    global: "Razorpay" | "Cashfree",
): Promise<void> {
    if ((window as SdkWindow)[global]) return Promise.resolve();
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

const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

function openRazorpay(
    request: CheckoutRequest,
    settle: (outcome: CheckoutOutcome) => void,
    /** Takes the checkout, or false when the page has closed it meanwhile. */
    onOpen: (checkout: RazorpayCheckout) => boolean,
): void {
    const { handoff } = request;
    // The checkout's key is the connection's public key — for Razorpay, its
    // key id, which setup stores beside the sealed pair (DEC-054). The API
    // makes no order for a Razorpay connection without it, so a missing one
    // here is a handoff it can't use.
    const key = text(handoff.publicKey);
    const orderId =
        text(handoff.clientParams.razorpayOrderId) ??
        text(handoff.providerIntentId);
    if (!key || !orderId) {
        settle("unavailable");
        return;
    }
    loadScript(RAZORPAY_SDK, "Razorpay").then(
        () => {
            const Razorpay = (window as SdkWindow).Razorpay;
            if (!Razorpay) {
                settle("unavailable");
                return;
            }
            try {
                const checkout = new Razorpay({
                    key,
                    order_id: orderId,
                    amount: handoff.amountCents,
                    currency: handoff.currency,
                    name: request.business,
                    description: request.description,
                    prefill: {
                        name: request.booker.name,
                        email: request.booker.email,
                        ...(request.booker.phone
                            ? { contact: request.booker.phone }
                            : {}),
                    },
                    // A refusal comes back to the page, which says so and
                    // offers another try on the same order.
                    retry: { enabled: false },
                    handler: () => settle("paid"),
                    modal: { ondismiss: () => settle("closed") },
                });
                checkout.on("payment.failed", () => {
                    settle("failed");
                    checkout.close();
                });
                if (onOpen(checkout)) checkout.open();
            } catch {
                settle("unavailable");
            }
        },
        () => settle("unavailable"),
    );
}

/** Cashfree says "closed" and "failed" through one `error`; its words tell. */
const CLOSED_WORDS = /clos|abort|cancel|dismiss|dropped/i;

function openCashfree(
    request: CheckoutRequest,
    settle: (outcome: CheckoutOutcome) => void,
): void {
    const session = text(request.handoff.clientParams.paymentSessionId);
    if (!session) {
        settle("unavailable");
        return;
    }
    loadScript(CASHFREE_SDK, "Cashfree").then(
        () => {
            const Cashfree = (window as SdkWindow).Cashfree;
            if (!Cashfree) {
                settle("unavailable");
                return;
            }
            try {
                // The API makes orders on Cashfree's production host, so the
                // drop-in opens there too.
                Cashfree({ mode: "production" })
                    .checkout({
                        paymentSessionId: session,
                        redirectTarget: "_modal",
                    })
                    .then(
                        (result) => {
                            if (result.error) {
                                const words = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
                                settle(
                                    CLOSED_WORDS.test(words)
                                        ? "closed"
                                        : "failed",
                                );
                                return;
                            }
                            settle(result.paymentDetails ? "paid" : "closed");
                        },
                        () => settle("failed"),
                    );
            } catch {
                settle("unavailable");
            }
        },
        () => settle("unavailable"),
    );
}

/** Open the provider's window for a handoff. */
export const openProviderCheckout: OpenCheckout = (request) => {
    let settle: (outcome: CheckoutOutcome) => void = () => undefined;
    const outcome = new Promise<CheckoutOutcome>((resolve) => {
        settle = resolve;
    });
    let razorpay: RazorpayCheckout | null = null;
    let closed = false;
    // The first answer stands; a close from the page answers nothing.
    let settled = false;
    const once = (value: CheckoutOutcome) => {
        if (settled || closed) return;
        settled = true;
        settle(value);
    };

    if (typeof window === "undefined" || typeof document === "undefined") {
        once("unavailable");
    } else if (request.handoff.provider === "RAZORPAY") {
        openRazorpay(request, once, (checkout) => {
            // Closed before the SDK had loaded: never open it.
            if (closed) return false;
            razorpay = checkout;
            return true;
        });
    } else if (request.handoff.provider === "CASHFREE") {
        openCashfree(request, once);
    } else {
        once("unavailable");
    }

    return {
        outcome,
        close: () => {
            if (closed) return;
            closed = true;
            try {
                razorpay?.close();
            } catch {
                // Already gone.
            }
        },
    };
};
