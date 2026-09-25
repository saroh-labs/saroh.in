import { Logger } from "@nestjs/common";

import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindRefundInput,
    MerchantProvider,
    ProviderCredentials,
    RefundInput,
    RefundResult,
} from "./provider.port";
import { RefundCallError } from "./provider.port";

/**
 * Razorpay adapter (S5-002).
 *
 * Creates an order via the Razorpay Orders API
 * (`POST https://api.razorpay.com/v1/orders`) authenticated with HTTP Basic
 * `key_id:key_secret`. Razorpay amounts are in the minor unit (paise), which is
 * exactly what `amountCents` already is, so no conversion. On any non-2xx the
 * error is SANITIZED: only the HTTP status is surfaced, never the auth header,
 * the key secret, or the raw provider body.
 */
export class RazorpayProvider implements MerchantProvider {
    readonly name = "RAZORPAY";
    private readonly logger = new Logger(RazorpayProvider.name);
    private readonly baseUrl = "https://api.razorpay.com/v1";

    async createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        const { amountCents, currency, orderId, credentials } = input;

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/orders`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${basicAuth(credentials)}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amountCents,
                    currency,
                    receipt: orderId,
                }),
            });
        } catch {
            // Network failure — never echo the request (it carries the secret).
            throw new Error("Razorpay order creation failed: network error");
        }

        if (!res.ok) {
            // Log only the status; the body/headers can leak secret material.
            this.logger.warn(
                `Razorpay order creation failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Razorpay order creation failed (HTTP ${res.status})`,
            );
        }

        const body = (await res.json()) as { id?: string; status?: string };
        if (!body.id) {
            throw new Error(
                "Razorpay order creation failed: missing order id in response",
            );
        }

        return {
            providerIntentId: body.id,
            clientParams: {
                razorpayOrderId: body.id,
                amount: amountCents,
                currency,
            },
        };
    }

    /**
     * Refund a captured payment via `POST /payments/{payment_id}/refund`
     * (Razorpay amounts are in paise = `amountCents`). Requires the provider
     * payment id (captured from the payment webhook).
     *
     * Idempotent: Saroh's reference goes as `X-Refund-Idempotency`, so a
     * retry with the same reference and body answers with the first refund
     * instead of making a second; it also rides in `receipt` and `notes` so
     * the refund can be found again, and the webhook can name it. A 409
     * ("still processing that key"), a 429, a 5xx or a network error may
     * have made a refund — `UNKNOWN`; any other 4xx made none — `REFUSED`.
     * Errors are SANITIZED to the HTTP status only — never the auth header,
     * key secret, or raw body.
     */
    async refund(input: RefundInput): Promise<RefundResult> {
        const { reference, providerPaymentRef, amountCents, credentials } =
            input;
        if (!providerPaymentRef) {
            throw new RefundCallError(
                "Razorpay refund failed: missing payment id (payment not captured yet)",
                "REFUSED",
            );
        }

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/payments/${providerPaymentRef}/refund`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Basic ${basicAuth(credentials)}`,
                        "Content-Type": "application/json",
                        "X-Refund-Idempotency": reference,
                    },
                    body: JSON.stringify({
                        amount: amountCents,
                        receipt: reference,
                        notes: { saroh_refund_id: reference },
                    }),
                },
            );
        } catch {
            throw new RefundCallError(
                "Razorpay refund failed: network error",
                "UNKNOWN",
            );
        }

        if (!res.ok) {
            this.logger.warn(`Razorpay refund failed with HTTP ${res.status}`);
            throw new RefundCallError(
                `Razorpay refund failed (HTTP ${res.status})`,
                mayHaveRefunded(res.status) ? "UNKNOWN" : "REFUSED",
            );
        }

        const body = (await res.json()) as RazorpayRefund;
        if (!body.id) {
            // It answered yes without saying to what: it may have refunded.
            throw new RefundCallError(
                "Razorpay refund failed: missing refund id in response",
                "UNKNOWN",
            );
        }
        return toResult(body);
    }

    /**
     * Find the refund made under `reference` among the payment's refunds
     * (`GET /payments/{payment_id}/refunds`), matched on `receipt` or the
     * note Saroh sends — never on the amount. No payment id means no refund
     * could have been made.
     */
    async findRefund(input: FindRefundInput): Promise<RefundResult | null> {
        const { reference, providerPaymentRef, credentials } = input;
        if (!providerPaymentRef) return null;

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/payments/${providerPaymentRef}/refunds?count=100`,
                {
                    headers: {
                        Authorization: `Basic ${basicAuth(credentials)}`,
                    },
                },
            );
        } catch {
            throw new RefundCallError(
                "Razorpay refund lookup failed: network error",
                "UNKNOWN",
            );
        }
        if (!res.ok) {
            this.logger.warn(
                `Razorpay refund lookup failed with HTTP ${res.status}`,
            );
            throw new RefundCallError(
                `Razorpay refund lookup failed (HTTP ${res.status})`,
                "UNKNOWN",
            );
        }

        const body = (await res.json()) as { items?: RazorpayRefund[] };
        const found = (body.items ?? []).find(
            (r) =>
                r.id && (r.receipt === reference || noteRef(r) === reference),
        );
        return found ? toResult(found) : null;
    }
}

interface RazorpayRefund {
    id?: string;
    status?: string;
    receipt?: string | null;
    notes?: Record<string, string | undefined> | unknown[] | null;
}

/** Razorpay sends `notes` as `[]` when there are none. */
function noteRef(refund: RazorpayRefund): string | undefined {
    const notes = refund.notes;
    if (!notes || Array.isArray(notes)) return undefined;
    return notes.saroh_refund_id;
}

function basicAuth(credentials: ProviderCredentials): string {
    return Buffer.from(
        `${credentials.keyId}:${credentials.keySecret}`,
    ).toString("base64");
}

/** 409: a request with this key is still being processed; 429 and 5xx: unsure. */
function mayHaveRefunded(status: number): boolean {
    return status === 409 || status === 429 || status >= 500;
}

function toResult(refund: RazorpayRefund): RefundResult {
    const status = refund.status ?? "PENDING";
    return {
        providerRefundId: refund.id ?? "",
        status,
        failed: status.toLowerCase() === "failed",
    };
}
