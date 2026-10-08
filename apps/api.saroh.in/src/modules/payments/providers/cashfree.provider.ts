import { Logger } from "@nestjs/common";

import {
    cashfreeBaseUrl,
    cashfreeMode,
} from "../../../common/providers/cashfree-env";
import type { CredentialCheck } from "../../../common/providers/provider-attention";
import {
    ProviderKeysRefusedError,
    refusesKeys,
} from "../../../common/providers/provider-attention";
import { providerCallSignal } from "./provider-call";
import type {
    CreateOrderIntentInput,
    CreateOrderIntentResult,
    FindOrderPaymentsInput,
    FindRefundInput,
    MerchantProvider,
    OrderPayment,
    ProviderCredentials,
    RefundInput,
    RefundResult,
} from "./provider.port";
import { readRefundAnswer, RefundCallError } from "./provider.port";

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
    /** Live or sandbox, per `CASHFREE_ENV` (read per call). */
    private get baseUrl(): string {
        return cashfreeBaseUrl();
    }
    private readonly apiVersion = "2023-08-01";

    /**
     * The keys, checked on connect (UX-012) by looking up an order that
     * doesn't exist (`GET /orders/{id}`): Cashfree answers 404 to keys it
     * knows and 401 to keys it doesn't. 2xx or 404 accepts, 401/403
     * rejects, anything else is unsure. Only the status is ever logged.
     */
    async verifyCredentials(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck> {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/orders/saroh-key-check`, {
                headers: this.headers(credentials),
                signal: providerCallSignal(),
            });
        } catch {
            return "UNSURE";
        }
        if (res.ok || res.status === 404) return "ACCEPTED";
        if (refusesKeys(res.status)) return "REJECTED";
        this.logger.warn(`Cashfree key check answered HTTP ${res.status}`);
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
            const message = `Cashfree order creation failed (HTTP ${res.status})`;
            if (refusesKeys(res.status)) {
                throw new ProviderKeysRefusedError(message, res.status);
            }
            throw new Error(message);
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
                // Where the drop-in must open: where this order was made.
                mode: cashfreeMode(),
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

        return toResult(
            await readRefundAnswer<CashfreeRefund>(
                res,
                "Cashfree refund failed",
            ),
            reference,
        );
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
        return toResult(
            await readRefundAnswer<CashfreeRefund>(
                res,
                "Cashfree refund lookup failed",
            ),
            reference,
        );
    }

    /**
     * The payments on an order (`GET /orders/{order_id}/payments`, P1),
     * looked up by the merchant order id Saroh made it under (the Order's
     * or Invoice's id — what `createOrderIntent` sent as `order_id`).
     * Cashfree's drop-in returns no signature, so this read is all its
     * return is checked by. Amounts are rupees, read as decimal text.
     */
    async findOrderPayments(
        input: FindOrderPaymentsInput,
    ): Promise<OrderPayment[]> {
        const { merchantRef, credentials } = input;
        if (!merchantRef) return [];
        let res: Response;
        try {
            res = await fetch(
                `${this.baseUrl}/orders/${encodeURIComponent(merchantRef)}/payments`,
                {
                    headers: this.headers(credentials),
                    signal: providerCallSignal(),
                },
            );
        } catch {
            // A dropped connection, or no answer in time.
            throw new Error("Cashfree payment lookup failed: network error");
        }
        if (res.status === 404) return [];
        if (!res.ok) {
            this.logger.warn(
                `Cashfree payment lookup failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Cashfree payment lookup failed (HTTP ${res.status})`,
            );
        }
        let body: unknown;
        try {
            body = await res.json();
        } catch {
            throw new Error(
                "Cashfree payment lookup failed: unreadable response",
            );
        }
        return (Array.isArray(body) ? (body as CashfreePayment[]) : [])
            .map(toOrderPayment)
            .filter((p): p is OrderPayment => p !== null);
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
        // As the refund webhook reads them (cashfree.webhook.ts `outcomeFor`).
        failed:
            status === "CANCELLED" ||
            status === "FAILED" ||
            status === "REJECTED",
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

/** One of Cashfree's order payments, as far as Saroh reads it. */
interface CashfreePayment {
    cf_payment_id?: string | number;
    payment_status?: string;
    payment_amount?: number | string;
    payment_currency?: string;
}

const PAYMENT_STATUS: Record<string, OrderPayment["status"]> = {
    SUCCESS: "CAPTURED",
    PENDING: "PENDING",
    NOT_ATTEMPTED: "PENDING",
    FAILED: "FAILED",
    USER_DROPPED: "FAILED",
    CANCELLED: "FAILED",
    VOID: "FAILED",
};

function toOrderPayment(payment: CashfreePayment): OrderPayment | null {
    if (payment.cf_payment_id == null) return null;
    return {
        providerPaymentRef: String(payment.cf_payment_id),
        status:
            PAYMENT_STATUS[(payment.payment_status ?? "").toUpperCase()] ??
            "OTHER",
        amountCents: rupeesToPaise(payment.payment_amount),
        currency: nonBlank(payment.payment_currency?.trim().toUpperCase()),
    };
}

/** Rupees as a number or text ("400.50") → paise, never through a float product. */
function rupeesToPaise(amount: number | string | undefined): number | null {
    if (amount == null) return null;
    const text = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) return null;
    const [, whole, fraction = ""] = match;
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function nonBlank(value: string | undefined): string | null {
    if (!value) return null;
    return value;
}
