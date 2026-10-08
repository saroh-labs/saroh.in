import type { AutopayDoneState, AutopayStartResult } from "@saroh/site-blocks";
import { payInstructionsOf } from "@saroh/site-blocks";

import { serverApiUrl } from "./api-url";
import { autopayDoneAnswer, autopayStartAnswer } from "./autopay-shape";
import type { CheckoutIntent } from "./checkout-shape";
import { isIntent } from "./checkout-shape";
import type { PayInvoice } from "./invoice-pay-shape";
import {
    isPayInvoice,
    payAutopayOf,
    payChargingOf,
    payContactOf,
    payOnlineOf,
    payUrlOf,
} from "./invoice-pay-shape";
import { withRelay } from "./relay-headers";

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
const API_URL = serverApiUrl();

export type PayLookup =
    | { ok: true; invoice: PayInvoice }
    | { ok: false; reason: "missing" | "busy" | "unavailable" };

export async function getPayInvoice(token: string): Promise<PayLookup> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/invoices/${encodeURIComponent(token)}`,
            {
                cache: "no-store",
                headers: await withRelay({ accept: "application/json" }),
            },
        );
    } catch {
        return { ok: false, reason: "unavailable" };
    }
    if (res.ok) {
        const body: unknown = await res.json().catch(() => null);
        return isPayInvoice(body)
            ? {
                  ok: true,
                  // Autopay (D12) checked field by field; strange is none.
                  invoice: {
                      ...body,
                      autopay: payAutopayOf(body.autopay),
                      // A charge under way (D13), checked the same way.
                      autopayCharging: payChargingOf(body.autopayCharging),
                      // When autopay next charges (D13B): the same shape.
                      autopayNextCharge: payChargingOf(body.autopayNextCharge),
                      // Where the link lives (DEC-069, L6).
                      payUrl: payUrlOf(body.payUrl),
                      // Whether Pay is offered at all (DEC-070).
                      payOnline: payOnlineOf(body.payOnline),
                      // How to pay offline (R32), checked field by field.
                      payInstructions: payInstructionsOf(body.payInstructions),
                      // A way to reach them when none is set (UX-007).
                      businessContact: payContactOf(body.businessContact),
                  },
              }
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
                headers: await withRelay({
                    accept: "application/json",
                    "content-type": "application/json",
                }),
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

/**
 * "Pay and turn on autopay" (D12): start autopay on the invoice's plan with
 * the method picked. Only the method and a key travel on; the API takes
 * the amount from the invoice and the limit from the plan.
 *
 *   POST ${API_URL}/public/invoices/:token/autopay
 */
export async function startInvoiceAutopay(
    token: string,
    method: string,
    idempotencyKey: string,
): Promise<AutopayStartResult> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/invoices/${encodeURIComponent(token)}/autopay`,
            {
                method: "POST",
                cache: "no-store",
                headers: await withRelay({
                    accept: "application/json",
                    "content-type": "application/json",
                }),
                body: JSON.stringify({ method, idempotencyKey }),
            },
        );
    } catch {
        return {
            ok: false,
            message: "We couldn't reach the business. Try again in a moment.",
        };
    }
    return autopayStartAnswer(res.status, await res.json().catch(() => null));
}

/**
 * How autopay stands after the pay link's set-up (D12), for the page on the
 * business's site, with the pay link to try again from.
 *
 *   GET ${API_URL}/public/invoices/:token/autopay
 */
export async function getInvoiceAutopay(
    token: string,
): Promise<{ state: AutopayDoneState; payUrl: string | null }> {
    let res: Response;
    try {
        res = await fetch(
            `${API_URL}/public/invoices/${encodeURIComponent(token)}/autopay`,
            {
                cache: "no-store",
                headers: await withRelay({ accept: "application/json" }),
            },
        );
    } catch {
        return { state: { kind: "error" }, payUrl: null };
    }
    const body: unknown = await res.json().catch(() => null);
    const payUrl = (body as { payUrl?: unknown } | null)?.payUrl;
    return {
        state: autopayDoneAnswer(res.status, body),
        payUrl: typeof payUrl === "string" ? payUrl : null,
    };
}
