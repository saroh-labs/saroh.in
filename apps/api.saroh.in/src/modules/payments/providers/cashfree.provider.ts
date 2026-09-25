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
 * Cashfree adapter (S5-002).
 *
 * Creates an order via the Cashfree PG Orders API
 * (`POST https://api.cashfree.com/pg/orders`) authenticated with the
 * `x-client-id` / `x-client-secret` headers and a pinned `x-api-version`.
 * Cashfree's `order_amount` is in MAJOR units (e.g. rupees), so `amountCents`
 * is divided by 100. On any non-2xx the error is SANITIZED: only the HTTP
 * status is surfaced, never the credentials or the raw provider body.
 */
export class CashfreeProvider implements MerchantProvider {
    readonly name = "CASHFREE";
    private readonly logger = new Logger(CashfreeProvider.name);
    private readonly baseUrl = "https://api.cashfree.com/pg";
    private readonly apiVersion = "2023-08-01";

    async createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        const { amountCents, currency, orderId, credentials } = input;

        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/orders`, {
                method: "POST",
                headers: {
                    "x-client-id": credentials.keyId,
                    "x-client-secret": credentials.keySecret,
                    "x-api-version": this.apiVersion,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    order_id: orderId,
                    // Cashfree expects major units with 2 decimals.
                    order_amount: Number((amountCents / 100).toFixed(2)),
                    order_currency: currency,
                    customer_details: {
                        // Placeholder linkage; a real integration passes the
                        // buyer's details. Kept non-secret and deterministic.
                        customer_id: `order_${orderId}`,
                    },
                }),
            });
        } catch {
            throw new Error("Cashfree order creation failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(
                `Cashfree order creation failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Cashfree order creation failed (HTTP ${res.status})`,
            );
        }

        const body = (await res.json()) as {
            cf_order_id?: string | number;
            order_id?: string;
            payment_session_id?: string;
        };

        const providerIntentId =
            body.cf_order_id != null ? String(body.cf_order_id) : body.order_id;
        if (!providerIntentId) {
            throw new Error(
                "Cashfree order creation failed: missing order id in response",
            );
        }

        return {
            providerIntentId,
            clientParams: {
                cashfreeOrderId: providerIntentId,
                paymentSessionId: body.payment_session_id ?? null,
                amount: Number((amountCents / 100).toFixed(2)),
                currency,
            },
        };
    }

    /**
     * Refund via `POST /orders/{order_id}/refunds` (Cashfree's `refund_amount`
     * is in MAJOR units, so `amountCents` is divided by 100). `providerIntentId`
     * is the order id the intent was created against.
     *
     * Saroh's reference is the merchant `refund_id` Cashfree requires: unique
     * per refund, echoed by the refund webhook. Cashfree has no idempotent
     * replay — sending a `refund_id` again is refused as a duplicate — so a
     * duplicate means an earlier call made this refund, and is `UNKNOWN`
     * (never `REFUSED`), as are a 409, a 429, a 5xx and a network error.
     * Errors are SANITIZED to the HTTP status — never the credentials or raw
     * body.
     */
    async refund(input: RefundInput): Promise<RefundResult> {
        const { reference, providerIntentId, amountCents, credentials } = input;

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/orders/${providerIntentId}/refunds`,
                {
                    method: "POST",
                    headers: this.headers(credentials),
                    body: JSON.stringify({
                        refund_amount: Number((amountCents / 100).toFixed(2)),
                        refund_id: reference,
                    }),
                },
            );
        } catch {
            throw new RefundCallError(
                "Cashfree refund failed: network error",
                "UNKNOWN",
            );
        }

        if (!res.ok) {
            this.logger.warn(`Cashfree refund failed with HTTP ${res.status}`);
            const unknown =
                res.status === 409 ||
                res.status === 429 ||
                res.status >= 500 ||
                (await isDuplicateRefund(res));
            throw new RefundCallError(
                `Cashfree refund failed (HTTP ${res.status})`,
                unknown ? "UNKNOWN" : "REFUSED",
            );
        }

        return toResult((await res.json()) as CashfreeRefund, reference);
    }

    /**
     * The refund made under `reference` —
     * `GET /orders/{order_id}/refunds/{refund_id}`. A 404 means Cashfree has
     * none; anything else that is not an answer is `UNKNOWN`.
     */
    async findRefund(input: FindRefundInput): Promise<RefundResult | null> {
        const { reference, providerIntentId, credentials } = input;

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/orders/${providerIntentId}/refunds/${reference}`,
                { headers: this.headers(credentials) },
            );
        } catch {
            throw new RefundCallError(
                "Cashfree refund lookup failed: network error",
                "UNKNOWN",
            );
        }
        if (res.status === 404) return null;
        if (!res.ok) {
            this.logger.warn(
                `Cashfree refund lookup failed with HTTP ${res.status}`,
            );
            throw new RefundCallError(
                `Cashfree refund lookup failed (HTTP ${res.status})`,
                "UNKNOWN",
            );
        }
        return toResult((await res.json()) as CashfreeRefund, reference);
    }

    private headers(credentials: ProviderCredentials): Record<string, string> {
        return {
            "x-client-id": credentials.keyId,
            "x-client-secret": credentials.keySecret,
            "x-api-version": this.apiVersion,
            "Content-Type": "application/json",
        };
    }
}

interface CashfreeRefund {
    cf_refund_id?: string | number;
    refund_id?: string;
    refund_status?: string;
}

function toResult(body: CashfreeRefund, reference: string): RefundResult {
    const status = body.refund_status ?? "PENDING";
    return {
        providerRefundId:
            body.cf_refund_id != null
                ? String(body.cf_refund_id)
                : (body.refund_id ?? reference),
        status,
        failed: status === "CANCELLED" || status === "FAILED",
    };
}

/**
 * Whether Cashfree refused because this `refund_id` was used before. Read
 * for its message only — the body is never logged or passed on.
 */
async function isDuplicateRefund(res: Response): Promise<boolean> {
    try {
        const body = (await res.json()) as { message?: string; code?: string };
        return /already (exists|been used)|duplicate/i.test(
            `${body.code ?? ""} ${body.message ?? ""}`,
        );
    } catch {
        return false;
    }
}
