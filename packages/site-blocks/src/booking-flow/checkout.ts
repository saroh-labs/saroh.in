import type {
    CheckoutOutcome,
    CheckoutRequest,
    CheckoutReturn,
    Settle,
} from "./checkout-shared";
import { loadScript, text } from "./checkout-shared";
import { openStripeWindow } from "./stripe-window";

export { loadScript, text } from "./checkout-shared";
export type {
    CheckoutOutcome,
    CheckoutRequest,
    CheckoutReturn,
    Settle,
} from "./checkout-shared";

/**
 * The business's own provider checkout, opened in the booker's browser (E11).
 *
 * The API has already made the provider's order for the hold's invoice and
 * answered with its non-secret handoff (`POST /public/invoices/:token/
 * payment-intent`): the amount is the invoice's, never the page's. This opens
 * that order in the provider's own window: Razorpay's Checkout or
 * Cashfree's drop-in. A Stripe payment opens Saroh's own card window when
 * the business chose it (the handoff carries a client secret), else leaves
 * the page for Stripe's hosted Checkout, which comes back to the
 * business's `/paid` page (DEC-208, 8 Nov).
 * Saroh never chooses or restricts the payment methods (DEC-059): each
 * window shows what the business's own account has switched on, so neither
 * the checkout nor the order sets any.
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
     * closes; Cashfree's drop-in has no close, so its answer is ignored. A
     * Stripe redirect is already under way: its answer is ignored.
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

/** Stripe's hosted Checkout page: the only place a Stripe handoff may send the customer. */
const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";

/**
 * Stripe's hosted Checkout (DEC-208, 7 Nov amendment; KTD-12): no window
 * of the site's own. The API made the session on the business's own
 * Stripe account and handed back its address; the page goes there, and
 * Stripe sends the customer back to the business's `/paid` page. Only an
 * https address on Stripe's Checkout host is followed; anything else is a
 * handoff the page can't use. The outcome never settles on a redirect:
 * the page is leaving. Come back to with the browser's Back (the page
 * restored as it was), it says "closed", so the caller offers Pay again.
 */
function openStripeCheckout(request: CheckoutRequest, settle: Settle): void {
    const url = httpsUrl(request.handoff.clientParams.checkoutUrl);
    // `httpsUrl` has parsed it already.
    if (!url || new URL(url).hostname !== STRIPE_CHECKOUT_HOST) {
        settle("unavailable");
        return;
    }
    const back = (event: PageTransitionEvent) => {
        if (!event.persisted) return;
        window.removeEventListener("pageshow", back);
        settle("closed");
    };
    window.addEventListener("pageshow", back);
    window.location.assign(url);
}

/** Open the provider's window for a handoff. */
export const openProviderCheckout: OpenCheckout = (request) => {
    let settle: (outcome: CheckoutOutcome) => void = () => undefined;
    const outcome = new Promise<CheckoutOutcome>((resolve) => {
        settle = resolve;
    });
    let razorpay: RazorpayCheckout | null = null;
    let removeStripe: (() => void) | null = null;
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
    } else if (request.handoff.provider === "STRIPE") {
        // The business's choice (DEC-208, 8 Nov): a client secret is Saroh's
        // card window, a Checkout address is Stripe's hosted page.
        if (text(request.handoff.clientParams.clientSecret)) {
            openStripeWindow(request, once, (remove) => {
                // Closed before Stripe.js had loaded: never open it.
                if (closed) return false;
                removeStripe = remove;
                return true;
            });
        } else {
            openStripeCheckout(request, once);
        }
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
                removeStripe?.();
            } catch {
                // Already gone.
            }
        },
    };
};
