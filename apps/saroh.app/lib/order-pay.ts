import { serverApiUrl } from "./api-url";
import { isIntent } from "./checkout-shape";
import type { StartResult } from "./invoice-pay";
import { payOnlineOf, payUrlOf } from "./invoice-pay-shape";
import type { PayOrder } from "./order-pay-shape";
import { howToPayOf, isPayOrder } from "./order-pay-shape";

export type { PayOrder, PayOrderLine } from "./order-pay-shape";

/**
 * Server-side only. The order pay page (plan B, B11) reads and posts
 * server-to-server — the invoice pay page's pattern — so the link's token
 * goes from this server to the API and nowhere else.
 *
 *   GET  ${API_URL}/public/order-pay/:token
 *   POST ${API_URL}/public/order-pay/:token/payment-intent
 *
 * No amount is ever sent: the API charges what is due on the stored order.
 */
const API_URL = serverApiUrl();

export type OrderPayLookup =
    | { ok: true; order: PayOrder }
    | { ok: false; reason: "missing" | "busy" | "unavailable" };

export async function getPayOrder(token: string): Promise<OrderPayLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/order-pay/${encodeURIComponent(token)}`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (res.ok) {
        const body: unknown = await res.json().catch(() => null);
        return isPayOrder(body)
            ? {
                  ok: true,
                  order: {
                      ...body,
                      // Where the link lives (DEC-069, L6), checked.
                      payUrl: payUrlOf(body.payUrl),
                      // Only a real `false` turns Pay off (R33).
                      payOnline: payOnlineOf(body.payOnline),
                      howToPay: howToPayOf(body.howToPay),
                  },
              }
            : { ok: false, reason: "unavailable" };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (res.status === 429) return { ok: false, reason: "busy" };
    return { ok: false, reason: "unavailable" };
}

/**
 * Start paying. The page's own sentences, never the API's text — the API's
 * messages are written for the merchant.
 */
export async function startOrderPayment(
    token: string,
    idempotencyKey: string,
): Promise<StartResult> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/order-pay/${encodeURIComponent(token)}/payment-intent`,
            {
                method: "POST",
                cache: "no-store",
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                },
                body: JSON.stringify({ idempotencyKey }),
            },
        );
    } catch {
        return {
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        };
    }
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) {
        return isIntent(body)
            ? { ok: true, intent: body }
            : {
                  ok: false,
                  message: "We couldn't start the payment. Please try again.",
              };
    }
    switch (res.status) {
        case 404:
            return {
                ok: false,
                message: "This link no longer works.",
                settled: true,
            };
        case 409:
            return {
                ok: false,
                message:
                    "This order can't be paid online just now. Reload the page to see why.",
                settled: true,
            };
        case 429:
            return {
                ok: false,
                message:
                    "That's a lot of tries at once. Wait a minute and try again.",
            };
        default:
            return {
                ok: false,
                message:
                    "The business can't take payment online right now. Please try again later, or pay them another way.",
            };
    }
}
