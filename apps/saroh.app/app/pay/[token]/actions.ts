"use server";

import type { AutopayStartResult } from "@saroh/site-blocks";

import { AUTOPAY_METHOD } from "@/lib/autopay-shape";
import type { StartResult } from "@/lib/invoice-pay";
import { startInvoiceAutopay, startInvoicePayment } from "@/lib/invoice-pay";

/**
 * The Pay button's submit, run on this server so the API is reached
 * server-to-server. It sends only the token and an idempotency key: the API
 * decides the amount from the invoice.
 */
export async function startPayment(
    token: string,
    idempotencyKey: string,
): Promise<StartResult> {
    return startInvoicePayment(token, idempotencyKey);
}

/** A key from the page: a short token, never anything else. */
const KEY = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * "Pay and turn on autopay" (D12), run on this server: only the token,
 * the method picked from the invoice's offer and a key travel on.
 */
export async function startAutopay(
    token: string,
    method: string,
    idempotencyKey: string,
): Promise<AutopayStartResult> {
    if (
        typeof method !== "string" ||
        !AUTOPAY_METHOD.test(method) ||
        typeof idempotencyKey !== "string" ||
        !KEY.test(idempotencyKey)
    ) {
        return { ok: false, message: "Pick how autopay should pay." };
    }
    return startInvoiceAutopay(token, method, idempotencyKey);
}
