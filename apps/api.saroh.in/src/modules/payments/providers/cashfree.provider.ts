import { Logger } from "@nestjs/common";

import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    MerchantProvider,
    RefundInput,
    RefundResult,
} from "./provider.port";

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
     * is the order id the intent was created against. Errors are SANITIZED to
     * the HTTP status — never the credentials or raw body.
     */
    async refund(input: RefundInput): Promise<RefundResult> {
        const { providerIntentId, amountCents, credentials } = input;
        // A deterministic, provider-unique refund id (Cashfree requires the
        // merchant to supply `refund_id`); echoed back by the refund webhook.
        const refundId = `rf_${providerIntentId}_${amountCents}`;

        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/orders/${providerIntentId}/refunds`,
                {
                    method: "POST",
                    headers: {
                        "x-client-id": credentials.keyId,
                        "x-client-secret": credentials.keySecret,
                        "x-api-version": this.apiVersion,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        refund_amount: Number((amountCents / 100).toFixed(2)),
                        refund_id: refundId,
                    }),
                },
            );
        } catch {
            throw new Error("Cashfree refund failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(`Cashfree refund failed with HTTP ${res.status}`);
            throw new Error(`Cashfree refund failed (HTTP ${res.status})`);
        }

        const body = (await res.json()) as {
            cf_refund_id?: string | number;
            refund_id?: string;
            refund_status?: string;
        };
        const providerRefundId =
            body.cf_refund_id != null
                ? String(body.cf_refund_id)
                : (body.refund_id ?? refundId);
        return {
            providerRefundId,
            status: body.refund_status ?? "PENDING",
        };
    }
}
