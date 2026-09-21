import { env } from "@/env";

import type { CheckoutIntent, CheckoutReceipt } from "./checkout-shape";
import { isIntent, isReceipt } from "./checkout-shape";

// Re-exported for the checkout view. Imported first so the names are bound
// here too: `export type { X } from` alone would not bind them locally.
export type {
    CheckoutIntent,
    CheckoutReceipt,
    CheckoutStorefront,
    ReceiptPaymentStatus,
} from "./checkout-shape";

/**
 * PUBLIC checkout client helpers (S5-004). These hit the guardless checkout
 * surface on api.saroh.in from the buyer's browser:
 *
 *   POST ${NEXT_PUBLIC_API_URL}/public/orders/:orderId/payment-intent
 *   GET  ${NEXT_PUBLIC_API_URL}/public/orders/:orderId/receipt
 *
 * The API derives the owning organization from the Order and the charged amount
 * from `order.total` — there is deliberately NO amount field anywhere in these
 * requests, so this client can never influence how much is charged. The receipt
 * carries no secrets and no internal ids; the intent response carries only the
 * non-secret provider handoff (`publicKey`, `clientParams`).
 *
 * Client-safe: only `NEXT_PUBLIC_*` is read here (this module is bundled into a
 * "use client" component).
 */

const API_URL = env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

/** Discriminated result so the UI can surface a message inline. */
export type CheckoutResult<T> =
    { ok: true; data: T } | { ok: false; error: string };

/*
 * No API error text reaches the buyer, on purpose. The public checkout
 * endpoints' messages are written for the MERCHANT and can describe their
 * setup ("Stored provider credentials are malformed", "Multiple providers
 * connected — specify which provider to use"). A `readError` here used to
 * try to show them and only failed because it read `body.message` while the
 * API sends `{ error: { message } }` (review of #322). Reading the right
 * field would have leaked those lines to buyers, so each failure gets the
 * page's own sentence instead.
 */

/** Fetch the buyer-safe receipt for `orderId`. */
export async function fetchReceipt(
    orderId: string,
): Promise<CheckoutResult<CheckoutReceipt>> {
    try {
        const res = await fetch(
            `${API_URL}/public/orders/${encodeURIComponent(orderId)}/receipt`,
            { headers: { "content-type": "application/json" } },
        );
        if (res.ok) {
            const body: unknown = await res.json().catch(() => null);
            return isReceipt(body)
                ? { ok: true, data: body }
                : { ok: false, error: "Couldn't load this order." };
        }
        if (res.status === 404) {
            return { ok: false, error: "We couldn't find this order." };
        }
        return {
            ok: false,
            error: "Couldn't load this order.",
        };
    } catch {
        return {
            ok: false,
            error: "We couldn't reach the server — check your connection and try again.",
        };
    }
}

/**
 * Create (or idempotently replay) a payment intent for `orderId`. `idempotencyKey`
 * should be stable per checkout attempt so a double-click can't create two
 * intents. NO amount is ever sent — the API fixes it from the Order.
 */
export async function createPaymentIntent(
    orderId: string,
    options: { idempotencyKey: string; provider?: string },
): Promise<CheckoutResult<CheckoutIntent>> {
    try {
        const res = await fetch(
            `${API_URL}/public/orders/${encodeURIComponent(orderId)}/payment-intent`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    idempotencyKey: options.idempotencyKey,
                    ...(options.provider ? { provider: options.provider } : {}),
                }),
            },
        );
        if (res.ok) {
            const body: unknown = await res.json().catch(() => null);
            return isIntent(body)
                ? { ok: true, data: body }
                : {
                      ok: false,
                      error: "We couldn't start the payment — please try again.",
                  };
        }
        return {
            ok: false,
            error: "We couldn't start the payment — please try again.",
        };
    } catch {
        return {
            ok: false,
            error: "We couldn't reach the server — check your connection and try again.",
        };
    }
}
