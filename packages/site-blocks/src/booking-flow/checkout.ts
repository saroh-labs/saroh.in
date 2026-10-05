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
 * window closed on a payment. Nothing on the page says "booked" until the
 * API does. The window's own return is posted to the API first (P1,
 * {@link postCheckoutReturn}) — Razorpay's signed `razorpay_payment_id`,
 * `razorpay_order_id` and `razorpay_signature`, or Cashfree's order — and
 * the API checks it with the provider and settles the payment then, so the
 * page's next read already says so. The provider's webhook stays the
 * backup: whichever reaches the API first settles it.
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

/** How long "Paid" waits for the API to check the return. */
export const RETURN_TIMEOUT_MS = 8_000;

/**
 * Post the window's return to the API (`POST /public/payments/return`),
 * which verifies it with the business's own key, asks the provider for the
 * payment and settles it. Resolves true when the API has it settled; false
 * on anything else — a refusal, a network error, a slow answer — and the
 * page then waits for the webhook as before. Never throws.
 */
export async function postCheckoutReturn(
    apiUrl: string,
    body: CheckoutReturn,
    timeoutMs = RETURN_TIMEOUT_MS,
): Promise<boolean> {
    const controller =
        typeof AbortController === "undefined" ? null : new AbortController();
    const timer = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;
    try {
        const res = await fetch(`${apiUrl}/public/payments/return`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            credentials: "omit",
            referrerPolicy: "no-referrer",
            ...(controller ? { signal: controller.signal } : {}),
        });
        if (!res.ok) return false;
        const answer = (await res.json()) as { confirmed?: unknown };
        return answer.confirmed === true;
    } catch {
        return false;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Razorpay Checkout's `handler` argument, as far as the page reads it. */
function razorpayReturn(response: unknown): CheckoutReturn | null {
    if (typeof response !== "object" || response === null) return null;
    const r = response as Record<string, unknown>;
    const order = text(r.razorpay_order_id);
    const payment = text(r.razorpay_payment_id);
    const signature = text(r.razorpay_signature);
    if (!order || !payment || !signature) return null;
    return {
        provider: "RAZORPAY",
        providerOrderId: order,
        providerPaymentId: payment,
        signature,
    };
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

/** The API's `recurring: true` (or Razorpay's own `"1"`). */
const isRecurring = (v: unknown): boolean => v === true || v === "1";

/** Only an https address is handed to the provider as a return page. */
function httpsUrl(v: unknown): string | null {
    const s = text(v);
    if (!s) return null;
    try {
        return new URL(s).protocol === "https:" ? s : null;
    } catch {
        return null;
    }
}

/** An answer from the window, with its return when it is a payment. */
type Settle = (
    outcome: CheckoutOutcome,
    returned?: CheckoutReturn | null,
) => void;

function openRazorpay(
    request: CheckoutRequest,
    settle: Settle,
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
                    // Autopay's authorisation order (D12): Checkout takes
                    // it as a recurring payment for the provider's customer.
                    // Where it must leave the page (a bank's eMandate page),
                    // it comes back to the business's own site.
                    ...(isRecurring(handoff.clientParams.recurring)
                        ? {
                              recurring: "1",
                              ...(text(handoff.clientParams.razorpayCustomerId)
                                  ? {
                                        customer_id: text(
                                            handoff.clientParams
                                                .razorpayCustomerId,
                                        ),
                                    }
                                  : {}),
                              ...(httpsUrl(handoff.clientParams.callbackUrl)
                                  ? {
                                        callback_url: httpsUrl(
                                            handoff.clientParams.callbackUrl,
                                        ),
                                    }
                                  : {}),
                          }
                        : {}),
                    // A refusal comes back to the page, which says so and
                    // offers another try on the same order.
                    retry: { enabled: false },
                    // Paid: Checkout hands back the payment, the order and
                    // their signature, which the API checks (P1).
                    handler: (response: unknown) =>
                        settle("paid", razorpayReturn(response)),
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

function openCashfree(request: CheckoutRequest, settle: Settle): void {
    const session = text(request.handoff.clientParams.paymentSessionId);
    // Cashfree's drop-in returns no signature: its order is the cue for the
    // API to ask Cashfree itself (P1).
    const order =
        text(request.handoff.clientParams.cashfreeOrderId) ??
        text(request.handoff.providerIntentId);
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
                // The drop-in opens where the API made the order: the API
                // sends its `CASHFREE_ENV` as `mode`, production when absent.
                Cashfree({
                    mode:
                        request.handoff.clientParams.mode === "sandbox"
                            ? "sandbox"
                            : "production",
                })
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
                            if (!result.paymentDetails) {
                                settle("closed");
                                return;
                            }
                            settle(
                                "paid",
                                order
                                    ? {
                                          provider: "CASHFREE",
                                          providerOrderId: order,
                                      }
                                    : null,
                            );
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
    const once: Settle = (value, returned) => {
        if (settled || closed) return;
        settled = true;
        // Paid: the return goes to the API before the page is told, so
        // what the page reads next is already settled (P1). A return the
        // API can't check leaves the page waiting for the webhook.
        if (value === "paid" && returned && request.apiUrl) {
            void postCheckoutReturn(request.apiUrl, returned).then(() => {
                if (!closed) settle(value);
            });
            return;
        }
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
