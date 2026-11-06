import { Logger } from "@nestjs/common";

import type { CredentialCheck } from "../../../common/providers/provider-attention";
import {
    ProviderKeysRefusedError,
    refusesKeys,
} from "../../../common/providers/provider-attention";
import { FlagKey } from "../../feature-flags/flags";
import { providerCallSignal } from "./provider-call";
import type {
    CancelIntentInput,
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
import type { StripePaymentIntent } from "./stripe-payments";
import {
    isStripeSecretKey,
    STRIPE_API_VERSION,
    STRIPE_BASE_URL,
    stripeForm,
    stripeOrderPayments,
    stripeTakesCurrency,
} from "./stripe-payments";

/**
 * Stripe adapter: the business's own account and its own restricted key
 * (`rk_…`), never Connect, cards only (a recorded exception to DEC-059).
 * Raw `fetch`, form-encoded bodies, `Stripe-Version` pinned
 * ({@link STRIPE_API_VERSION}); the facts and their sources are in
 * `STRIPE.md`. No mandates: autopay stays off.
 *
 * Errors keep only the HTTP status: never the key, the body, or a
 * PaymentIntent's client secret, which only the customer's page gets.
 */
export class StripeProvider implements MerchantProvider {
    readonly name = "STRIPE";
    readonly rolloutFlag = FlagKey.STRIPE_PAYMENTS;
    private readonly logger = new Logger(StripeProvider.name);

    /**
     * The key, checked on connect (UX-012) with one read of each thing
     * Saroh needs: a PaymentIntent and a refund. Both 2xx accept; a 401
     * rejects; a 403 is a real key missing a permission; anything else is
     * unsure. A full secret key is refused without a call.
     */
    async verifyCredentials(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck> {
        if (isStripeSecretKey(credentials.keySecret)) return "REJECTED";
        let statuses: number[];
        try {
            statuses = await Promise.all(
                ["/payment_intents?limit=1", "/refunds?limit=1"].map(
                    async (path) =>
                        (
                            await fetch(`${STRIPE_BASE_URL}${path}`, {
                                headers: headers(credentials),
                                signal: providerCallSignal(),
                            })
                        ).status,
                ),
            );
        } catch {
            return "UNSURE";
        }
        if (statuses.every((s) => s >= 200 && s < 300)) return "ACCEPTED";
        if (statuses.includes(401)) return "REJECTED";
        if (statuses.includes(403)) return "PERMISSION_MISSING";
        this.logger.warn(
            `Stripe key check answered HTTP ${statuses.join("/")}`,
        );
        return "UNSURE";
    }

    /**
     * A PaymentIntent for the amount, cards only, with Saroh's reference in
     * `metadata[saroh_ref]`. The customer's page confirms it with the
     * client secret; the webhook settles it.
     */
    async createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        const { amountCents, currency, orderId, credentials } = input;
        if (!stripeTakesCurrency(currency)) {
            throw new Error(
                `Stripe order creation refused: ${currency} is not a currency Saroh charges through Stripe`,
            );
        }

        let res: Response;
        try {
            res = await fetch(`${STRIPE_BASE_URL}/payment_intents`, {
                method: "POST",
                headers: headers(credentials),
                body: stripeForm({
                    amount: amountCents,
                    currency: currency.trim().toLowerCase(),
                    // `payment_method_types` is refused on this version.
                    "allowed_payment_method_types[]": "card",
                    "metadata[saroh_ref]": orderId,
                }),
                signal: providerCallSignal(),
            });
        } catch {
            throw new Error("Stripe order creation failed: network error");
        }

        if (!res.ok) {
            this.logger.warn(
                `Stripe order creation failed with HTTP ${res.status}`,
            );
            const message = `Stripe order creation failed (HTTP ${res.status})`;
            if (refusesKeys(res.status)) {
                throw new ProviderKeysRefusedError(message, res.status);
            }
            throw new Error(message);
        }

        let body: { id?: string; client_secret?: string };
        try {
            body = (await res.json()) as typeof body;
        } catch {
            throw new Error(
                "Stripe order creation failed: unreadable response",
            );
        }
        if (!body.id || !body.client_secret) {
            throw new Error(
                "Stripe order creation failed: missing intent id or client secret",
            );
        }
        return {
            providerIntentId: body.id,
            clientParams: {
                stripePaymentIntentId: body.id,
                clientSecret: body.client_secret,
            },
        };
    }

    /**
     * A refund against the PaymentIntent (`POST /refunds`), Saroh's
     * reference as the `Idempotency-Key` and as `metadata[saroh_refund_id]`.
     *
     * Stripe replays a key's first answer for at least 24 hours, a 500
     * included, so an unsure refund is settled by {@link findRefund} or the
     * webhook, never by sending it again. A 409 (a request with the key
     * still running), a 429, a 5xx, a network error, or a 400
     * `idempotency_error` (the key was used before, so a refund may exist)
     * are `UNKNOWN`; any other 4xx made none, `REFUSED`.
     */
    async refund(input: RefundInput): Promise<RefundResult> {
        const { reference, providerIntentId, amountCents, currency } = input;
        if (!stripeTakesCurrency(currency)) {
            throw new RefundCallError(
                `Stripe refund refused: ${currency} is not a currency Saroh charges through Stripe`,
                "REFUSED",
            );
        }

        let res: Response;
        try {
            res = await fetch(`${STRIPE_BASE_URL}/refunds`, {
                method: "POST",
                headers: {
                    ...headers(input.credentials),
                    "Idempotency-Key": reference,
                },
                body: stripeForm({
                    payment_intent: providerIntentId,
                    amount: amountCents,
                    "metadata[saroh_refund_id]": reference,
                }),
                signal: providerCallSignal(),
            });
        } catch {
            throw new RefundCallError(
                "Stripe refund failed: network error",
                "UNKNOWN",
            );
        }

        if (!res.ok) {
            this.logger.warn(`Stripe refund failed with HTTP ${res.status}`);
            const unknown =
                res.status === 409 ||
                res.status === 429 ||
                res.status >= 500 ||
                (await errorType(res)) === "idempotency_error";
            throw new RefundCallError(
                `Stripe refund failed (HTTP ${res.status})`,
                unknown ? "UNKNOWN" : "REFUSED",
            );
        }

        const body = await readRefundAnswer<StripeRefund>(
            res,
            "Stripe refund failed",
        );
        if (!body.id) {
            throw new RefundCallError(
                "Stripe refund failed: missing refund id in response",
                "UNKNOWN",
            );
        }
        return toResult(body);
    }

    /**
     * The refund made under `reference` among the intent's refunds
     * (`GET /refunds?payment_intent=…`), matched on
     * `metadata[saroh_refund_id]`, never on the amount.
     */
    async findRefund(input: FindRefundInput): Promise<RefundResult | null> {
        const { reference, providerIntentId } = input;
        let res: Response;
        try {
            res = await fetch(
                `${STRIPE_BASE_URL}/refunds?payment_intent=${encodeURIComponent(providerIntentId)}&limit=100`,
                {
                    headers: headers(input.credentials),
                    signal: providerCallSignal(),
                },
            );
        } catch {
            throw new RefundCallError(
                "Stripe refund lookup failed: network error",
                "UNKNOWN",
            );
        }
        if (!res.ok) {
            this.logger.warn(
                `Stripe refund lookup failed with HTTP ${res.status}`,
            );
            throw new RefundCallError(
                `Stripe refund lookup failed (HTTP ${res.status})`,
                "UNKNOWN",
            );
        }
        const body = await readRefundAnswer<{ data?: StripeRefund[] }>(
            res,
            "Stripe refund lookup failed",
        );
        // shortcut: reads the newest 100 refunds only; a payment refunded in
        // more than 100 parts would need `starting_after` paging.
        const found = (body.data ?? []).find(
            (r) => r.id && r.metadata?.saroh_refund_id === reference,
        );
        return found ? toResult(found) : null;
    }

    /** The intent's payment, as Stripe has it now (`GET /payment_intents/{id}`, P1). */
    async findOrderPayments(
        input: FindOrderPaymentsInput,
    ): Promise<OrderPayment[]> {
        let res: Response;
        try {
            res = await fetch(
                `${STRIPE_BASE_URL}/payment_intents/${encodeURIComponent(input.providerIntentId)}`,
                {
                    headers: headers(input.credentials),
                    signal: providerCallSignal(),
                },
            );
        } catch {
            throw new Error("Stripe payment lookup failed: network error");
        }
        if (!res.ok) {
            this.logger.warn(
                `Stripe payment lookup failed with HTTP ${res.status}`,
            );
            throw new Error(
                `Stripe payment lookup failed (HTTP ${res.status})`,
            );
        }
        let body: StripePaymentIntent;
        try {
            body = (await res.json()) as StripePaymentIntent;
        } catch {
            throw new Error(
                "Stripe payment lookup failed: unreadable response",
            );
        }
        return stripeOrderPayments(body);
    }

    /**
     * Cancel an open PaymentIntent (`POST /payment_intents/{id}/cancel`,
     * reason `abandoned`). Stripe's `payment_intent_unexpected_state` (400)
     * means it is past cancelling: false.
     */
    async cancelIntent(input: CancelIntentInput): Promise<boolean> {
        let res: Response;
        try {
            res = await fetch(
                `${STRIPE_BASE_URL}/payment_intents/${encodeURIComponent(input.providerIntentId)}/cancel`,
                {
                    method: "POST",
                    headers: headers(input.credentials),
                    body: stripeForm({ cancellation_reason: "abandoned" }),
                    signal: providerCallSignal(),
                },
            );
        } catch {
            throw new Error("Stripe intent cancel failed: network error");
        }
        if (res.ok) return true;
        if (
            res.status === 400 &&
            (await errorCode(res)) === "payment_intent_unexpected_state"
        ) {
            return false;
        }
        this.logger.warn(`Stripe intent cancel failed with HTTP ${res.status}`);
        throw new Error(`Stripe intent cancel failed (HTTP ${res.status})`);
    }
}

interface StripeRefund {
    id?: string;
    status?: string | null;
    metadata?: Record<string, string | undefined> | null;
}

/**
 * Every call's headers. A full secret key is never sent: the throw lands in
 * the caller's network-error path, which assumes nothing either way.
 */
function headers(credentials: ProviderCredentials): Record<string, string> {
    if (isStripeSecretKey(credentials.keySecret)) {
        throw new Error("Stripe: a full secret key is never sent");
    }
    return {
        Authorization: `Bearer ${credentials.keySecret}`,
        "Stripe-Version": STRIPE_API_VERSION,
        "Content-Type": "application/x-www-form-urlencoded",
    };
}

/** Stripe's `error` object, read for its type and code only, never logged. */
async function stripeError(
    res: Response,
): Promise<{ type?: string; code?: string }> {
    try {
        const body = (await res.json()) as {
            error?: { type?: string; code?: string };
        };
        return body.error ?? {};
    } catch {
        return {};
    }
}

const errorType = async (res: Response) => (await stripeError(res)).type;
const errorCode = async (res: Response) => (await stripeError(res)).code;

function toResult(refund: StripeRefund): RefundResult {
    const status = refund.status ?? "pending";
    return {
        providerRefundId: refund.id ?? "",
        status,
        // As the refund webhook reads them (stripe.webhook.ts).
        failed: status === "failed" || status === "canceled",
    };
}
