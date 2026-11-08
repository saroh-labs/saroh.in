import { createHash } from "node:crypto";

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
    FindOrCreateCustomerInput,
    FindOrCreateCustomerResult,
    FindOrderPaymentsInput,
    FindRefundInput,
    HostedCheckoutInput,
    MerchantProvider,
    OrderPayment,
    ProviderCredentials,
    RefundInput,
    RefundResult,
} from "./provider.port";
import { readRefundAnswer, RefundCallError } from "./provider.port";
import type {
    StripeCheckoutSession,
    StripePaymentIntent,
} from "./stripe-payments";
import {
    isCheckoutSessionId,
    isStripeSecretKey,
    STRIPE_API_VERSION,
    STRIPE_BASE_URL,
    STRIPE_INSTANT_METHODS,
    stripeForm,
    stripeOrderPayments,
    stripeTakesCurrency,
    text,
} from "./stripe-payments";

/**
 * Stripe adapter: the business's own account and its own restricted key
 * (`rk_…`), never Connect. A payment is a hosted Checkout Session (DEC-208,
 * amended 7 Nov): the customer pays on Stripe's page and comes back to the
 * business's site. Raw `fetch`, form-encoded bodies, `Stripe-Version`
 * pinned ({@link STRIPE_API_VERSION}); the facts and their sources are in
 * `STRIPE.md`. No mandates: autopay stays off.
 *
 * Errors keep only the HTTP status: never the key or the body. No client
 * secret is ever read or handed out.
 */
export class StripeProvider implements MerchantProvider {
    readonly name = "STRIPE";
    readonly rolloutFlag = FlagKey.STRIPE_PAYMENTS;
    private readonly logger = new Logger(StripeProvider.name);

    /**
     * The key, checked on connect (UX-012) with one read of each thing
     * Saroh needs: a PaymentIntent, a refund, a Checkout Session and a
     * customer. All 2xx accept; a 401 rejects; a 403 is a real key missing
     * a permission; anything else is unsure. A full secret key is refused
     * without a call. The account read is not part of it: whether a
     * restricted key may read it is unconfirmed (`STRIPE.md`).
     */
    async verifyCredentials(
        credentials: ProviderCredentials,
    ): Promise<CredentialCheck> {
        if (isStripeSecretKey(credentials.keySecret)) return "REJECTED";
        let statuses: number[];
        try {
            statuses = await Promise.all(
                [
                    "/payment_intents?limit=1",
                    "/refunds?limit=1",
                    "/checkout/sessions?limit=1",
                    "/customers?limit=1",
                ].map(
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
     * A hosted Checkout Session for the server's amount: one line item,
     * Saroh's intent id as `client_reference_id`, Saroh's references in the
     * session's and the PaymentIntent's metadata, and the description an
     * Indian account needs for a payment from abroad. The browser gets only
     * the session's URL and id. The PaymentIntent is made by Stripe once the
     * customer confirms, so the session id stands in for it until then.
     */
    async createOrderIntent(
        input: CreateOrderIntentInput,
    ): Promise<CreateOrderIntentResult> {
        const { currency, credentials, hosted } = input;
        if (!stripeTakesCurrency(currency)) {
            throw new Error(
                `Stripe order creation refused: ${currency} is not a currency Saroh charges through Stripe`,
            );
        }
        if (!hosted) {
            throw new Error(
                "Stripe order creation refused: no hosted checkout details",
            );
        }

        let res: Response;
        try {
            res = await fetch(`${STRIPE_BASE_URL}/checkout/sessions`, {
                method: "POST",
                headers: headers(credentials),
                body: stripeForm(checkoutSessionForm(input, hosted)),
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

        let body: StripeCheckoutSession;
        try {
            body = (await res.json()) as StripeCheckoutSession;
        } catch {
            throw new Error(
                "Stripe order creation failed: unreadable response",
            );
        }
        const url = text(body.url);
        if (!body.id || !isCheckoutSessionId(body.id) || !url) {
            throw new Error(
                "Stripe order creation failed: missing session id or URL",
            );
        }
        return {
            providerIntentId: body.id,
            providerCheckoutId: body.id,
            clientParams: { checkoutUrl: url, checkoutSessionId: body.id },
        };
    }

    /**
     * The payer as a Customer in the business's account: the newest one
     * whose email is the lower-cased, trimmed email (Stripe's filter is
     * case-sensitive and exact), else a new one, made under an
     * `Idempotency-Key` of the business and the email so a retry makes no
     * second. No email: none. A 403 says the key lacks Customers; any other
     * failure is null too. Never throws.
     */
    async findOrCreateCustomer(
        input: FindOrCreateCustomerInput,
    ): Promise<FindOrCreateCustomerResult> {
        const email = input.email?.trim().toLowerCase();
        if (!email) return { customerId: null };
        try {
            const list = await fetch(
                `${STRIPE_BASE_URL}/customers?email=${encodeURIComponent(email)}&limit=1`,
                {
                    headers: headers(input.credentials),
                    signal: providerCallSignal(),
                },
            );
            if (!list.ok) return this.noCustomer(list.status);
            const found = (await list.json()) as {
                data?: { id?: string }[];
            };
            const existing = text(found.data?.[0]?.id);
            if (existing) return { customerId: existing };

            const name = input.name?.trim();
            const made = await fetch(`${STRIPE_BASE_URL}/customers`, {
                method: "POST",
                headers: {
                    ...headers(input.credentials),
                    "Idempotency-Key": customerIdempotencyKey(
                        input.organizationId,
                        email,
                    ),
                },
                body: stripeForm({
                    email,
                    ...(name ? { name: name.slice(0, 256) } : {}),
                    ...(input.contactRef
                        ? { "metadata[saroh_contact]": input.contactRef }
                        : {}),
                }),
                signal: providerCallSignal(),
            });
            if (!made.ok) return this.noCustomer(made.status);
            const customer = (await made.json()) as { id?: string };
            return { customerId: text(customer.id) ?? null };
        } catch {
            this.logger.warn("Stripe customer call failed: network error");
            return { customerId: null };
        }
    }

    private noCustomer(status: number): FindOrCreateCustomerResult {
        this.logger.warn(`Stripe customer call failed with HTTP ${status}`);
        return status === 403
            ? { customerId: null, permissionMissing: true }
            : { customerId: null };
    }

    /**
     * The account's country (`GET /v1/account`), upper case, or null when
     * it could not be read: a restricted key may not be allowed to read the
     * account at all (unconfirmed, `STRIPE.md`). Never throws.
     */
    async accountCountry(
        credentials: ProviderCredentials,
    ): Promise<string | null> {
        try {
            const res = await fetch(`${STRIPE_BASE_URL}/account`, {
                headers: headers(credentials),
                signal: providerCallSignal(),
            });
            if (!res.ok) {
                this.logger.warn(
                    `Stripe account read failed with HTTP ${res.status}`,
                );
                return null;
            }
            const body = (await res.json()) as { country?: unknown };
            const country = text(body.country)?.toUpperCase();
            return country && /^[A-Z]{2}$/.test(country) ? country : null;
        } catch {
            this.logger.warn("Stripe account read failed: network error");
            return null;
        }
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

    /**
     * The intent's payment, as Stripe has it now (P1). A Checkout Session
     * (`cs_…`) is read with its PaymentIntent expanded: open, expired or
     * not yet confirmed (no PaymentIntent) is no payment; otherwise the
     * PaymentIntent's payment, naming the `pi_…` it is on. A PaymentIntent
     * (`pi_…`, from before hosted Checkout) is read as itself.
     */
    async findOrderPayments(
        input: FindOrderPaymentsInput,
    ): Promise<OrderPayment[]> {
        const session = isCheckoutSessionId(input.providerIntentId);
        const path = session
            ? `/checkout/sessions/${encodeURIComponent(input.providerIntentId)}?expand[]=payment_intent`
            : `/payment_intents/${encodeURIComponent(input.providerIntentId)}`;
        let res: Response;
        try {
            res = await fetch(`${STRIPE_BASE_URL}${path}`, {
                headers: headers(input.credentials),
                signal: providerCallSignal(),
            });
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
        let body: StripeCheckoutSession & StripePaymentIntent;
        try {
            body = (await res.json()) as typeof body;
        } catch {
            throw new Error(
                "Stripe payment lookup failed: unreadable response",
            );
        }
        return session ? sessionPayments(body) : stripeOrderPayments(body);
    }

    /**
     * Close an open intent. A Checkout Session is expired
     * (`POST /checkout/sessions/{id}/expire`; its PaymentIntent can't be
     * cancelled): Stripe refuses one that is not open (already expired or
     * complete) with a 400 whose code it doesn't document, so any 400 is
     * false. A PaymentIntent is cancelled as below.
     */
    async cancelIntent(input: CancelIntentInput): Promise<boolean> {
        if (!isCheckoutSessionId(input.providerIntentId)) {
            return this.cancelPaymentIntent(input);
        }
        let res: Response;
        try {
            res = await fetch(
                `${STRIPE_BASE_URL}/checkout/sessions/${encodeURIComponent(input.providerIntentId)}/expire`,
                {
                    method: "POST",
                    headers: headers(input.credentials),
                    signal: providerCallSignal(),
                },
            );
        } catch {
            throw new Error("Stripe session expire failed: network error");
        }
        if (res.ok) return true;
        if (res.status === 400) return false;
        this.logger.warn(
            `Stripe session expire failed with HTTP ${res.status}`,
        );
        throw new Error(`Stripe session expire failed (HTTP ${res.status})`);
    }

    /**
     * Cancel an open PaymentIntent (`POST /payment_intents/{id}/cancel`,
     * reason `abandoned`). Stripe's `payment_intent_unexpected_state` (400)
     * means it is past cancelling: false.
     */
    private async cancelPaymentIntent(
        input: CancelIntentInput,
    ): Promise<boolean> {
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

/**
 * The session's form (STRIPE.md): `mode=payment`, one line item for the
 * server's amount, Saroh's references on the session and its PaymentIntent,
 * and the hosted page's choices. A customer locks the email field; without
 * one the payer's email is prefilled.
 */
function checkoutSessionForm(
    input: CreateOrderIntentInput,
    hosted: HostedCheckoutInput,
): Record<string, string | number> {
    const intent = hosted.clientReference;
    const email = hosted.payerEmail?.trim().toLowerCase();
    return {
        mode: "payment",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": input.currency
            .trim()
            .toLowerCase(),
        "line_items[0][price_data][unit_amount]": input.amountCents,
        "line_items[0][price_data][product_data][name]": hosted.lineName,
        client_reference_id: intent,
        "metadata[saroh_ref]": input.orderId,
        "metadata[saroh_intent]": intent,
        "payment_intent_data[metadata][saroh_ref]": input.orderId,
        "payment_intent_data[metadata][saroh_intent]": intent,
        ...(input.description
            ? { "payment_intent_data[description]": input.description }
            : {}),
        success_url: hosted.successUrl,
        cancel_url: hosted.cancelUrl,
        submit_type: hosted.submitType,
        ...(hosted.expiresAt
            ? { expires_at: Math.floor(hosted.expiresAt.getTime() / 1000) }
            : {}),
        ...(hosted.billingAddressRequired
            ? { billing_address_collection: "required" }
            : {}),
        ...Object.fromEntries(
            (hosted.shippingCountries ?? []).map((c, i) => [
                `shipping_address_collection[allowed_countries][${i}]`,
                c,
            ]),
        ),
        ...(hosted.instantOnly
            ? Object.fromEntries(
                  STRIPE_INSTANT_METHODS.map((m, i) => [
                      `allowed_payment_method_types[${i}]`,
                      m,
                  ]),
              )
            : {}),
        ...(hosted.customerId
            ? { customer: hosted.customerId }
            : email
              ? { customer_email: email }
              : {}),
    };
}

/** One payer per business account: a retried create makes no second customer. */
function customerIdempotencyKey(organizationId: string, email: string): string {
    const digest = createHash("sha256")
        .update(`${organizationId}:${email}`)
        .digest("hex");
    return `saroh-customer-${digest}`;
}

/**
 * A session's payment: none while open, expired or with no PaymentIntent
 * yet; else its PaymentIntent's, naming the `pi_…`. A session Stripe calls
 * complete whose PaymentIntent didn't come back expanded can't be read.
 */
function sessionPayments(session: StripeCheckoutSession): OrderPayment[] {
    if (session.status !== "complete" || !session.payment_intent) return [];
    const pi = session.payment_intent;
    if (typeof pi === "string") {
        throw new Error(
            "Stripe payment lookup failed: payment intent not expanded",
        );
    }
    const intentId = text(pi.id);
    return stripeOrderPayments(pi).map((p) => ({
        ...p,
        ...(intentId ? { providerIntentId: intentId } : {}),
    }));
}
