import { createHmac, timingSafeEqual } from "node:crypto";

import type { CheckoutReturnInput, OrderPayment } from "./provider.port";

/**
 * Razorpay's side of confirming a payment without its webhook (P1).
 *
 * - **The signed return.** Checkout's `handler` gets `razorpay_order_id`,
 *   `razorpay_payment_id` and `razorpay_signature`: the lowercase hex
 *   HMAC-SHA256 of `order_id|payment_id`, keyed by the account's key secret
 *   (Razorpay's "verify payment signature"). It proves the pair came from
 *   this business's account; it says nothing of the amount, so the payment
 *   is then read from Razorpay itself.
 * - **The order's payments.** `GET /v1/orders/{order_id}/payments` lists
 *   every attempt on the order, with its `status` (`created`, `authorized`,
 *   `captured`, `refunded`, `failed`), `amount` in paise and `fee`.
 */

/** Constant-time check of a checkout's `razorpay_signature`. Never throws. */
export function verifyRazorpaySignature(input: CheckoutReturnInput): boolean {
    const { providerIntentId, providerPaymentRef, signature, credentials } =
        input;
    if (!providerIntentId || !providerPaymentRef || !signature) return false;
    const expected = createHmac("sha256", credentials.keySecret)
        .update(`${providerIntentId}|${providerPaymentRef}`)
        .digest("hex");
    const provided = signature.trim().toLowerCase();
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(
            Buffer.from(provided, "hex"),
            Buffer.from(expected, "hex"),
        );
    } catch {
        return false;
    }
}

/** One item of Razorpay's order payments, as far as Saroh reads it. */
export interface RazorpayPaymentEntity {
    id?: string;
    status?: string;
    amount?: number;
    currency?: string;
    fee?: number | null;
    method?: string;
    token_id?: string | null;
    customer_id?: string | null;
    invoice_id?: string | null;
}

const STATUS: Record<string, OrderPayment["status"]> = {
    captured: "CAPTURED",
    authorized: "AUTHORIZED",
    created: "PENDING",
    failed: "FAILED",
};

/** A Razorpay payment entity → an {@link OrderPayment}; null without an id. */
export function toOrderPayment(
    entity: RazorpayPaymentEntity,
): OrderPayment | null {
    const id = text(entity.id);
    if (!id) return null;
    const tokenId = text(entity.token_id);
    return {
        providerPaymentRef: id,
        status: STATUS[(entity.status ?? "").toLowerCase()] ?? "OTHER",
        amountCents: whole(entity.amount) ?? null,
        currency: text(entity.currency)?.toUpperCase() ?? null,
        feeCents: whole(entity.fee),
        ...(tokenId
            ? {
                  recurring: {
                      tokenId,
                      customerId: text(entity.customer_id),
                      method: text(entity.method),
                      invoiceId: text(entity.invoice_id),
                  },
              }
            : {}),
    };
}

function text(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== ""
        ? value.trim()
        : undefined;
}

function whole(value: unknown): number | undefined {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
}
