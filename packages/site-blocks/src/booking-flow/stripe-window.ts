/**
 * Parked (owner, 8 Nov 2026): Saroh's own Stripe card window (Payment
 * Element), replaced as the live path by Stripe's hosted Checkout
 * (DEC-208). Kept compiling and tested so it can be offered again. To use
 * it: in checkout.ts openProviderCheckout, call openStripeWindow for STRIPE
 * (see the commented line there), and have the API return a PaymentIntent
 * client secret instead of a Checkout session for that payment.
 */

import { formatAmount } from "../lib/money";
import type {
    CheckoutOutcome,
    CheckoutRequest,
    CheckoutReturn,
    Settle,
} from "./checkout";
import { loadScript, text } from "./checkout";

/**
 * Stripe.js on the release the API is pinned to (`2026-10-28.endive`): a
 * named Stripe.js always speaks its own release's API version.
 * https://docs.stripe.com/sdks/stripejs-versioning
 */
export const STRIPE_SDK = "https://js.stripe.com/endive/stripe.js";

// Stripe.js, checked against Stripe's docs on 6 Nov 2026:
// - Script from js.stripe.com only, never bundled; versioned URL above.
//   https://docs.stripe.com/js/including
// - `Stripe(publishableKey)`: https://docs.stripe.com/js/initializing
// - `stripe.elements({ clientSecret, appearance })`, then
//   `elements.create("payment", { defaultValues: { billingDetails: { name,
//   email } } })` and `.mount(el)`:
//   https://docs.stripe.com/js/elements_object/create_payment_element
//   https://docs.stripe.com/payments/accept-a-payment?payment-ui=elements&api-integration=paymentintents
// - `stripe.confirmPayment({ elements, redirect: "if_required" })` resolves
//   `{ error }`, or `{ paymentIntent }` for a method that needs no redirect
//   (cards): https://docs.stripe.com/js/payment_intents/confirm_payment
// - Appearance `variables`: colorPrimary, colorBackground, colorText,
//   fontFamily, borderRadius. The colour variables take neither `rgba()` nor
//   `var(--x)`, so the site's tokens are resolved to hex first.
//   https://docs.stripe.com/elements/appearance-api?api-integration=paymentintents
interface StripeConfirmResult {
    error?: { type?: string; message?: string };
    paymentIntent?: { id?: string; status?: string };
}
interface StripeInstance {
    elements(options: {
        clientSecret: string;
        appearance?: Record<string, unknown>;
    }): {
        create(
            type: "payment",
            options: Record<string, unknown>,
        ): {
            mount(el: HTMLElement): void;
            on?(event: "ready", handler: () => void): void;
            focus?(): void;
        };
    };
    confirmPayment(options: {
        elements: unknown;
        redirect: "if_required";
    }): Promise<StripeConfirmResult>;
}
type StripeFactory = (publishableKey: string) => StripeInstance;

type SdkWindow = Window & { Stripe?: StripeFactory };

/** A computed `rgb(r, g, b)` as hex, which Stripe's colours take; else null. */
function hexOf(css: string): string | null {
    const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(css.trim());
    if (!m) return null;
    return `#${m
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("")}`;
}

/** The site's own tokens as Stripe's appearance variables, where they resolve. */
function stripeAppearance(
    dialog: HTMLElement,
    pay: HTMLElement,
): Record<string, unknown> {
    const box = getComputedStyle(dialog);
    const button = getComputedStyle(pay);
    const variables: Record<string, string> = {};
    const put = (name: string, value: string | null) => {
        if (value) variables[name] = value;
    };
    put("colorPrimary", hexOf(button.backgroundColor));
    put("colorBackground", hexOf(box.backgroundColor));
    put("colorText", hexOf(box.color));
    // shortcut: the frame can't see the site's web fonts (no `fonts` option),
    // so it falls back down the stack; pass `fonts` with a cssSrc if a merchant
    // font must show inside the card fields.
    put("fontFamily", box.fontFamily || null);
    put("borderRadius", cappedRadius(button.borderTopLeftRadius));
    return { variables };
}

/**
 * A field's corners, at most 10px: a template whose buttons are pills
 * (`--site-radius` 999px) would turn Stripe's card fields into ovals.
 */
export function cappedRadius(css: string | null | undefined): string | null {
    const px = Number.parseFloat(css ?? "");
    if (!Number.isFinite(px)) return null;
    return `${Math.min(px, 10)}px`;
}

/**
 * The payment window's backdrop, once per page: a plain dim over the site,
 * so the window reads as above it (a `<dialog>`'s backdrop can only be set
 * from a stylesheet).
 */
function ensurePayStyles(): void {
    if (document.getElementById("site-pay-styles")) return;
    const style = document.createElement("style");
    style.id = "site-pay-styles";
    style.textContent =
        "dialog[data-site-pay]::backdrop{background:rgb(0 0 0 / 0.55);}" +
        "dialog[data-site-pay] button:focus-visible{outline:2px solid hsl(var(--site-fg));outline-offset:2px;}";
    document.head.appendChild(style);
}

// The payment window looks the same on every look (owner, 7 Nov 2026):
// Classic's window, with corners that never grow into pills or circles.
const BUTTON =
    "min-height:44px;min-width:44px;padding:0 1rem;font:inherit;cursor:pointer;border-radius:min(var(--site-radius, 0.625rem), 0.625rem);";

let stripeWindows = 0;

/**
 * Stripe's Payment Element in a window of the site's own: Stripe has no
 * ready-made window for a PaymentIntent, so the site draws one, from its
 * `--site-*` tokens only, never Saroh's. Returns what removes it.
 */
export function openStripeWindow(
    request: CheckoutRequest,
    settle: Settle,
    /** Takes the window's remover, or false when the page has closed meanwhile. */
    onOpen: (remove: () => void) => boolean,
): void {
    const { handoff } = request;
    const key = text(handoff.publicKey);
    // The client secret can complete the charge: it goes to Stripe.js and
    // nowhere else, never into a log or a URL.
    const clientSecret = text(handoff.clientParams.clientSecret);
    const intentId =
        text(handoff.clientParams.stripePaymentIntentId) ??
        text(handoff.providerIntentId);
    if (!key || !clientSecret || !intentId) {
        settle("unavailable");
        return;
    }
    loadScript(STRIPE_SDK, "Stripe").then(
        () => {
            const Stripe = (window as SdkWindow).Stripe;
            if (!Stripe) {
                settle("unavailable");
                return;
            }
            ensurePayStyles();
            const dialog = document.createElement("dialog");
            const titleId = `site-stripe-title-${++stripeWindows}`;
            dialog.setAttribute("data-site-pay", "");
            dialog.setAttribute("aria-labelledby", titleId);
            dialog.setAttribute("aria-describedby", `${titleId}-about`);
            dialog.tabIndex = -1;
            dialog.style.cssText =
                "width:min(28rem,calc(100vw - 2rem));max-height:calc(100dvh - 2rem);overflow:auto;box-sizing:border-box;padding:1.25rem;" +
                // A window, never a pill: the site's radius, at most 0.75rem.
                "border:1px solid hsl(var(--site-border));border-radius:min(var(--site-radius, 0.75rem), 0.75rem);margin:auto;" +
                "background:hsl(var(--site-surface));color:hsl(var(--site-fg));font-family:var(--site-font-body);";

            const title = document.createElement("h2");
            title.id = titleId;
            title.textContent = request.business;
            title.style.cssText =
                "margin:0;font-family:var(--site-font-heading);font-size:1.25rem;";
            const about = document.createElement("p");
            about.id = `${titleId}-about`;
            about.textContent = request.description;
            about.style.cssText =
                "margin:0.25rem 0 1rem;color:hsl(var(--site-body));";
            const fields = document.createElement("div");
            const error = document.createElement("p");
            error.setAttribute("role", "alert");
            error.style.cssText = "margin:0.75rem 0 0;min-height:1lh;";
            const actions = document.createElement("div");
            actions.style.cssText =
                "display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:flex-end;margin-top:1rem;";
            const close = document.createElement("button");
            close.type = "button";
            close.textContent = "Close";
            close.style.cssText = `${BUTTON}background:transparent;color:hsl(var(--site-fg));border:1px solid hsl(var(--site-border));`;
            const amount = formatAmount(
                (handoff.amountCents / 100).toFixed(2),
                handoff.currency,
            );
            const pay = document.createElement("button");
            pay.type = "button";
            pay.textContent = `Pay ${amount}`;
            pay.style.cssText = `${BUTTON}flex:1 1 auto;border:0;background:hsl(var(--site-accent));color:hsl(var(--site-accent-fg));`;
            actions.append(close, pay);
            dialog.append(title, about, fields, error, actions);

            const before =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
            let busy = false;
            let gone = false;
            const remove = () => {
                if (gone) return;
                gone = true;
                try {
                    dialog.close();
                } catch {
                    // Never shown, or a browser without <dialog>.
                }
                dialog.remove();
                if (before?.isConnected) before.focus();
            };
            const end = (
                outcome: CheckoutOutcome,
                returned?: CheckoutReturn | null,
            ) => {
                settle(outcome, returned);
                remove();
            };

            // shortcut: on <body>, so the tokens must be set on :root (as
            // saroh.app does); a scoped preview would show the fallbacks.
            if (!onOpen(remove)) return;
            document.body.appendChild(dialog);
            try {
                const stripe = Stripe(key);
                const elements = stripe.elements({
                    clientSecret,
                    appearance: stripeAppearance(dialog, pay),
                });
                const element = elements.create("payment", {
                    defaultValues: {
                        billingDetails: {
                            name: request.booker.name,
                            email: request.booker.email,
                        },
                    },
                    business: { name: request.business },
                });
                element.mount(fields);
                element.on?.("ready", () => element.focus?.());

                // Escape and Close: no payment, unless one is under way.
                dialog.addEventListener("cancel", (e) => {
                    e.preventDefault();
                    if (!busy) end("closed");
                });
                close.addEventListener("click", () => {
                    if (!busy) end("closed");
                });
                pay.addEventListener("click", () => {
                    if (busy) return;
                    busy = true;
                    pay.disabled = true;
                    close.disabled = true;
                    dialog.setAttribute("aria-busy", "true");
                    error.textContent = "";
                    const done = (message?: string) => {
                        busy = false;
                        pay.disabled = false;
                        close.disabled = false;
                        dialog.removeAttribute("aria-busy");
                        error.textContent =
                            message ??
                            "That didn't go through. Check the details and try again.";
                    };
                    stripe
                        .confirmPayment({ elements, redirect: "if_required" })
                        .then(
                            ({ error: refused, paymentIntent }) => {
                                if (refused) {
                                    // A decline ends the window, as Razorpay's
                                    // does; the page offers another try. A
                                    // field to fix stays here.
                                    if (refused.type === "card_error") {
                                        end("failed");
                                    } else {
                                        done(refused.message);
                                    }
                                    return;
                                }
                                const status = paymentIntent?.status;
                                if (
                                    status === "succeeded" ||
                                    status === "processing"
                                ) {
                                    // The API asks Stripe for the intent (P1).
                                    end("paid", {
                                        provider: "STRIPE",
                                        providerOrderId:
                                            text(paymentIntent?.id) ?? intentId,
                                    });
                                } else if (
                                    status === "requires_payment_method"
                                ) {
                                    end("failed");
                                } else {
                                    done();
                                }
                            },
                            () => done(),
                        );
                });

                if (typeof dialog.showModal === "function") {
                    dialog.showModal();
                } else {
                    dialog.setAttribute("open", "");
                }
                dialog.focus();
            } catch {
                end("unavailable");
            }
        },
        () => settle("unavailable"),
    );
}
