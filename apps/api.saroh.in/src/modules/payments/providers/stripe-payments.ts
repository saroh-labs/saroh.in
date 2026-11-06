import type { OrderPayment } from "./provider.port";

/**
 * Stripe facts the adapter and its checks share. Each is from Stripe's own
 * docs, with the page, in `STRIPE.md` beside this file.
 */

export const STRIPE_BASE_URL = "https://api.stripe.com/v1";

/** Sent as `Stripe-Version` on every call; the merchant's webhook endpoint is made on it too. */
export const STRIPE_API_VERSION = "2026-10-28.endive";

/**
 * The currencies Saroh charges through Stripe: two-decimal ones only, so
 * `amountCents` is Stripe's smallest unit as is. A zero- or three-decimal
 * currency would be sent in the wrong unit, so any other is refused before
 * a call.
 */
export const STRIPE_TWO_DECIMAL: ReadonlySet<string> = new Set([
    "USD",
    "EUR",
    "GBP",
    "CAD",
    "AUD",
    "NZD",
    "SGD",
    "AED",
    "ZAR",
    "INR",
]);

export function stripeTakesCurrency(currency: string): boolean {
    return STRIPE_TWO_DECIMAL.has(currency.trim().toUpperCase());
}

/**
 * The least Stripe charges, in minor units, by settlement currency
 * (docs.stripe.com/currencies#minimum-and-maximum-charge-amounts). A charge
 * Stripe converts must meet its settlement currency's minimum after
 * conversion, so this is a floor to check against, not a promise.
 */
export const STRIPE_MINIMUM_CENTS: Readonly<Record<string, number>> = {
    USD: 50,
    EUR: 50,
    GBP: 30,
    CAD: 50,
    AUD: 50,
    NZD: 50,
    SGD: 50,
    AED: 200,
    ZAR: 50,
    INR: 50,
};

/** A full secret key (`sk_live_…`, `sk_test_…`): Saroh takes only a restricted `rk_` key. */
export function isStripeSecretKey(key: string): boolean {
    return /^sk_(live|test)_/.test(key.trim());
}

/** What a business is told when it pastes its full secret key. */
export const STRIPE_SECRET_KEY_REFUSED =
    "That's your Stripe secret key, which can do anything in your account. Make a restricted key instead (it starts rk_live_ or rk_test_) with Payment Intents: Write and Refunds: Write, in Stripe › Developers › API keys.";

/** Stripe's form body: `key=value` pairs, nested keys already in brackets. */
export function stripeForm(fields: Record<string, string | number>): string {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        body.append(key, String(value));
    }
    return body.toString();
}

/** A PaymentIntent, as far as Saroh reads it. */
export interface StripePaymentIntent {
    id?: string;
    status?: string;
    amount_received?: number;
    currency?: string;
    latest_charge?: string | null;
}

const STATUS: Record<string, OrderPayment["status"]> = {
    succeeded: "CAPTURED",
    requires_capture: "AUTHORIZED",
    processing: "PENDING",
    requires_action: "PENDING",
    requires_confirmation: "PENDING",
    canceled: "FAILED",
};

/**
 * A PaymentIntent → its payment (P1). One intent is one payment at Stripe;
 * an intent still waiting for a card, with no attempt (`latest_charge`
 * null), has none yet. A tried and declined card leaves it
 * `requires_payment_method` with a charge: FAILED, though the customer may
 * try again on it. The payment is named by its charge, as the webhook
 * names it, or the intent's id when there is no charge.
 */
export function stripeOrderPayments(pi: StripePaymentIntent): OrderPayment[] {
    if (!pi.id) return [];
    const status = (pi.status ?? "").toLowerCase();
    const charge = text(pi.latest_charge);
    if (status === "requires_payment_method" && !charge) return [];
    return [
        {
            providerPaymentRef: charge ?? pi.id,
            status:
                status === "requires_payment_method"
                    ? "FAILED"
                    : (STATUS[status] ?? "OTHER"),
            amountCents: whole(pi.amount_received) ?? null,
            currency: text(pi.currency)?.toUpperCase() ?? null,
        },
    ];
}

export function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

export function whole(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
}
