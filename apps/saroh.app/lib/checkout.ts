import { env } from "@/env";

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

export type ReceiptPaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";

/** The buyer-safe receipt returned by the public receipt endpoint. */
export interface CheckoutReceipt {
    orderNumber: string;
    currency: string;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    total: string;
    paymentStatus: ReceiptPaymentStatus;
    fulfilmentStatus: string;
    latestPayment: {
        provider: string;
        status: string;
        amountCents: number;
        currency: string;
    } | null;
}

/** The non-secret handoff returned by the public create-intent endpoint. */
export interface CheckoutIntent {
    paymentIntentId: string;
    provider: string;
    providerIntentId: string;
    amountCents: number;
    currency: string;
    publicKey: string | null;
    clientParams: Record<string, unknown>;
}

/** Discriminated result so the UI can surface a message inline. */
export type CheckoutResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

async function readError(res: Response, fallback: string): Promise<string> {
    const body = (await res.json().catch(() => null)) as {
        message?: string;
    } | null;
    return body?.message ?? fallback;
}

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
            return { ok: true, data: (await res.json()) as CheckoutReceipt };
        }
        if (res.status === 404) {
            return { ok: false, error: "We couldn't find this order." };
        }
        return {
            ok: false,
            error: await readError(res, "Couldn't load this order."),
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
            return { ok: true, data: (await res.json()) as CheckoutIntent };
        }
        return {
            ok: false,
            error: await readError(
                res,
                "We couldn't start the payment — please try again.",
            ),
        };
    } catch {
        return {
            ok: false,
            error: "We couldn't reach the server — check your connection and try again.",
        };
    }
}
