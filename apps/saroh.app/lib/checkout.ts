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
    { ok: true; data: T } | { ok: false; error: string };

/**
 * The response bodies are narrowed rather than cast (#264): the receipt view
 * reads these fields during render, so a 200 in the wrong shape — or `null` —
 * would throw there and blank the page instead of showing its error state.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isReceipt(value: unknown): value is CheckoutReceipt {
    return (
        isRecord(value) &&
        typeof value.orderNumber === "string" &&
        typeof value.currency === "string" &&
        typeof value.total === "string" &&
        typeof value.paymentStatus === "string"
    );
}

function isIntent(value: unknown): value is CheckoutIntent {
    return (
        isRecord(value) &&
        typeof value.provider === "string" &&
        typeof value.providerIntentId === "string" &&
        typeof value.amountCents === "number" &&
        typeof value.currency === "string"
    );
}

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
