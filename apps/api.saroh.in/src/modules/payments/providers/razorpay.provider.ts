import { Logger } from "@nestjs/common";

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import {
    ProviderKeysRefusedError,
    refusesKeys,
} from "../../../common/providers/provider-attention";
import { providerCallSignal } from "./provider-call";
import type {
    CheckoutReturnInput,
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindOrderPaymentsInput,
    FindRefundInput,
    MandateCapability,
    MerchantProvider,
    OrderPayment,
    ProviderCredentials,
    RefundInput,
    RefundResult,
} from "./provider.port";
import { readRefundAnswer, RefundCallError } from "./provider.port";
import { RazorpayMandates } from "./razorpay-mandates";
import type { RazorpayPaymentEntity } from "./razorpay-order-payments";
import {
    toOrderPayment,
    verifyRazorpaySignature,
} from "./razorpay-order-payments";

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
    /**
     * Autopay through recurring tokens (round-2 D19). Offered to a business
     * only while its `RAZORPAY_AUTOPAY` rollout flag is on
     * (`MandateCapability.rolloutFlag`); see `razorpay-mandates.ts`.
     */
    readonly mandates: MandateCapability = new RazorpayMandates();
    private readonly logger = new Logger(RazorpayProvider.name);
    private readonly baseUrl = "https://api.razorpay.com/v1";

    /**
     * The keys, checked on connect (UX-012) with the cheapest authenticated
     * read Razorpay has: `GET /payments?count=1`. 2xx accepts, 401/403
     * rejects, anything else is unsure. Only the status is ever logged.
     */
    async verifyCredentials(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/payments?count=1`, {
                headers: { Authorization: `Basic ${basicAuth(credentials)}` },
                signal: providerCallSignal(),
            });
        } catch {
            return "UNSURE";
        }
        if (res.ok) return "ACCEPTED";
        if (refusesKeys(res.status)) return "REJECTED";
        this.logger.warn(`Razorpay key check answered HTTP ${res.status}`);
        return "UNSURE";
    }

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
            const message = `Razorpay order creation failed (HTTP ${res.status})`;
            // The keys themselves were refused: the connection needs
            // attention, not a retry (UX-012).
            if (refusesKeys(res.status)) {
                throw new ProviderKeysRefusedError(message, res.status);
            }
            throw new Error(message);
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

        const body = await readRefundAnswer<RazorpayRefund>(
            res,
            "Razorpay refund failed",
        );
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

        const body = await readRefundAnswer<{ items?: RazorpayRefund[] }>(
            res,
            "Razorpay refund lookup failed",
        );
        const found = (body.items ?? []).find(
            (r) =>
                r.id && (r.receipt === reference || noteRef(r) === reference),
        );
        return found ? toResult(found) : null;
    }

    /**
     * The payments on an order (`GET /orders/{order_id}/payments`, P1).
     * Errors keep only the HTTP status — never the auth header or the body.
     */
    async findOrderPayments(
        input: FindOrderPaymentsInput,
    ): Promise<OrderPayment[]> {
        const { providerIntentId, credentials } = input;
        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/orders/${encodeURIComponent(providerIntentId)}/payments`,
                {
                    headers: {
                        Authorization: `Basic ${basicAuth(credentials)}`,
                    },
                    signal: providerCallSignal(),
                },
            );
        } catch {
            // A dropped connection, or no answer in time.
            throw new Error("Razorpay payment lookup failed: network error");
        }
        if (!res.ok) {
            this.logger.warn(
                `Razorpay payment lookup failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Razorpay payment lookup failed (HTTP ${res.status})`,
            );
        }
        let body: { items?: RazorpayPaymentEntity[] };
        try {
            body = (await res.json()) as { items?: RazorpayPaymentEntity[] };
        } catch {
            throw new Error(
                "Razorpay payment lookup failed: unreadable response",
            );
        }
        return (body.items ?? [])
            .map(toOrderPayment)
            .filter((p): p is OrderPayment => p !== null);
    }

    /** Checkout's `razorpay_signature` over `order_id|payment_id` (P1). */
    verifyCheckoutReturn(input: CheckoutReturnInput): boolean {
        return verifyRazorpaySignature(input);
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
