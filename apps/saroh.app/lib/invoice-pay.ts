import { env } from "@/env";

import type { CheckoutIntent } from "./checkout-shape";
import { isIntent } from "./checkout-shape";
import type { PayInvoice } from "./invoice-pay-shape";
import { isPayInvoice } from "./invoice-pay-shape";

export type { PayInvoice, PayInvoiceLine } from "./invoice-pay-shape";

/**
 * Server-side only. The pay page reads and posts server-to-server — the
 * review page's pattern — so the link's token goes from this server to the
 * API and nowhere else, and a browser needs no CORS to reach it.
 *
 *   GET  ${API_URL}/public/invoices/:token
 *   POST ${API_URL}/public/invoices/:token/payment-intent
 *
 * No amount is ever sent: the API charges the stored invoice's total.
 */
const API_URL =
    env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";

export type PayLookup =
    | { ok: true; invoice: PayInvoice }
    | { ok: false; reason: "missing" | "busy" | "unavailable" };

export async function getPayInvoice(token: string): Promise<PayLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/invoices/${encodeURIComponent(token)}`,
            { cache: "no-store", headers: { accept: "application/json" } },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (res.ok) {
        const body: unknown = await res.json().catch(() => null);
        return isPayInvoice(body)
            ? { ok: true, invoice: body }
            : { ok: false, reason: "unavailable" };
    }
    if (res.status === 404) return { ok: false, reason: "missing" };
    if (res.status === 429) return { ok: false, reason: "busy" };
    return { ok: false, reason: "unavailable" };
}

export type StartResult =
    | { ok: true; intent: CheckoutIntent }
    | { ok: false; message: string; settled?: boolean };

/**
 * Start paying. The page's own sentences, never the API's text — the API's
 * messages are written for the merchant (checkout's rule).
 */
export async function startInvoicePayment(
    token: string,
    idempotencyKey: string,
): Promise<StartResult> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/invoices/${encodeURIComponent(token)}/payment-intent`,
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
                    "This invoice can't be paid online any more. Reload the page to see why.",
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
