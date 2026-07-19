import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { MerchantPaymentProvider } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { decryptSecret, encryptSecret } from "./crypto";
import type {
    ProviderCredentials,
    ProviderFactory,
} from "./providers/provider.port";
import {
    isSupportedProvider,
    PROVIDER_FACTORY,
} from "./providers/provider.port";

/** Validated input for {@link PaymentsService.connectProvider}. */
export interface ConnectProviderInput {
    provider: string;
    publicKey?: string;
    keyId: string;
    keySecret: string;
    /** Optional webhook signing secret (S5-003) — sealed, never echoed. */
    webhookSecret?: string;
}

/** The client-safe result of initiating a refund — NO secret, ever. */
export interface InitiateRefundResult {
    refundId: string;
    paymentIntentId: string;
    provider: string;
    providerRefundId: string | null;
    amountCents: number;
    currency: string;
    status: string;
}

/** A REDACTED provider view — safe to return; never carries secret material. */
export interface RedactedProvider {
    id: string;
    provider: string;
    status: string;
    publicKey: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** The client-safe result of creating an intent — NO secret, ever. */
export interface CreateIntentResult {
    paymentIntentId: string;
    provider: string;
    providerIntentId: string;
    amountCents: number;
    currency: string;
    publicKey: string | null;
    clientParams: Record<string, unknown>;
}

/**
 * A BUYER-safe receipt view (S5-004). Everything here is safe to show an
 * anonymous buyer: the store-facing order number, the line totals, the currency,
 * the reconciled `paymentStatus`, and the latest intent's status. It carries NO
 * secrets and NO internal ids (no intent id, no provider intent id, no org id).
 */
export interface PublicReceiptResult {
    orderNumber: string;
    currency: string;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    total: string;
    paymentStatus: string;
    fulfilmentStatus: string;
    latestPayment: {
        provider: string;
        status: string;
        amountCents: number;
        currency: string;
    } | null;
}

/** One PaymentIntent (+ its attempts and refunds) in the owner summary. */
export interface OrderPaymentIntentView {
    id: string;
    provider: string;
    providerIntentId: string | null;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: Date;
    attempts: {
        id: string;
        provider: string;
        providerRef: string | null;
        status: string;
        createdAt: Date;
    }[];
    refunds: {
        id: string;
        status: string;
        amountCents: number;
        currency: string;
        providerRefundId: string | null;
        reason: string | null;
        createdAt: Date;
    }[];
}

/** Owner-facing payments summary for one Order (`payment:read`). */
export interface OrderPaymentsSummary {
    orderId: string;
    paymentStatus: string;
    total: string;
    currency: string;
    intents: OrderPaymentIntentView[];
}

/** Convert a Decimal-ish order total (string | number | Decimal) to minor units. */
function totalToCents(total: Prisma.Decimal | string | number): number {
    return Math.round(Number(total) * 100);
}

/** Strip every secret/encrypted field — only the safe columns survive. */
function redact(row: MerchantPaymentProvider): RedactedProvider {
    return {
        id: row.id,
        provider: row.provider,
        status: row.status,
        publicKey: row.publicKey ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/**
 * Org merchant-payments service (S5-002).
 *
 * Two responsibilities, both tenant-scoped by `ctx.organizationId` (proven by
 * the guards, never client-supplied):
 *
 *  1. Connect a provider — the merchant's API secret is AES-256-GCM encrypted
 *     before it ever touches the DB; only ciphertext/iv/authTag (+ the public
 *     key) are stored, and responses are REDACTED so the secret is never echoed
 *     or logged.
 *  2. Create a payment intent for an Order — the charged `amountCents` and
 *     `currency` are computed SERVER-SIDE from the Order and can never come from
 *     client input. Credentials are decrypted in-memory only at the instant of
 *     the provider call.
 */
@Injectable()
export class PaymentsService {
    constructor(
        @Inject(PROVIDER_FACTORY) private readonly factory: ProviderFactory,
    ) {}

    /**
     * Connect (or re-connect) a provider for the org. `payment:manage`. The
     * secret is sealed with {@link encryptSecret} and upserted (unique per
     * org+provider); only the encrypted blob + public key are persisted.
     * Returns a redacted view.
     */
    async connectProvider(
        ctx: OrganizationContext,
        input: ConnectProviderInput,
    ): Promise<RedactedProvider> {
        authorize(ctx, "payment:manage");

        const provider = input.provider.toUpperCase();
        if (!isSupportedProvider(provider)) {
            throw new BadRequestException(
                `Unsupported payment provider "${input.provider}"`,
            );
        }

        // Seal { keyId, keySecret, webhookSecret? } as one blob. Plaintext
        // (incl. the webhook secret) is NEVER persisted or logged.
        const sealed = encryptSecret(
            JSON.stringify({
                keyId: input.keyId,
                keySecret: input.keySecret,
                ...(input.webhookSecret
                    ? { webhookSecret: input.webhookSecret }
                    : {}),
            }),
        );

        const row = await prisma.merchantPaymentProvider.upsert({
            where: {
                organizationId_provider: {
                    organizationId: ctx.organizationId,
                    provider,
                },
            },
            create: {
                organizationId: ctx.organizationId,
                provider,
                status: "CONNECTED",
                publicKey: input.publicKey ?? null,
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            },
            update: {
                status: "CONNECTED",
                publicKey: input.publicKey ?? null,
                encryptedCredentials: sealed.ciphertext,
                credentialsIv: sealed.iv,
                credentialsAuthTag: sealed.authTag,
            },
        });

        return redact(row);
    }

    /** List the org's connected providers, redacted. `payment:read`. */
    async listProviders(ctx: OrganizationContext): Promise<RedactedProvider[]> {
        authorize(ctx, "payment:read");
        const rows = await prisma.merchantPaymentProvider.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
        });
        return rows.map(redact);
    }

    /** Get one of the org's providers, redacted. `payment:read`. 404 if absent. */
    async getProvider(
        ctx: OrganizationContext,
        provider: string,
    ): Promise<RedactedProvider> {
        authorize(ctx, "payment:read");
        const row = await this.requireOwnedProvider(
            ctx.organizationId,
            provider,
        );
        return redact(row);
    }

    /**
     * Disconnect a provider (set DISABLED). `payment:manage`. Cross-tenant or
     * missing → 404. The encrypted credentials are left in place but the row is
     * no longer CONNECTED, so it can't back a new intent.
     */
    async disconnectProvider(
        ctx: OrganizationContext,
        provider: string,
    ): Promise<RedactedProvider> {
        authorize(ctx, "payment:manage");
        const row = await this.requireOwnedProvider(
            ctx.organizationId,
            provider,
        );
        const updated = await prisma.merchantPaymentProvider.update({
            where: { id: row.id },
            data: { status: "DISABLED" },
        });
        return redact(updated);
    }

    /**
     * Fetch + decrypt the org's webhook signing secret for a provider (S5-003).
     *
     * SECURITY: this is deliberately AUTHZ-FREE — it takes a raw
     * `(organizationId, provider)` (both come from the trusted webhook URL, not
     * from a session) and is only ever called by the webhook verifier to check
     * an inbound HMAC. The plaintext secret is returned to the SERVER only and
     * never to any client, echoed, or logged. Returns `null` when the provider
     * is not connected or has no webhook secret configured (the verifier then
     * rejects the delivery with 401). The provider status is ignored so a
     * webhook can still be verified after a `DISABLED` disconnect.
     */
    async getWebhookSecret(
        organizationId: string,
        provider: string,
    ): Promise<string | null> {
        const name = provider.toUpperCase();
        const row = await prisma.merchantPaymentProvider.findUnique({
            where: {
                organizationId_provider: { organizationId, provider: name },
            },
        });
        if (!row) return null;
        const json = decryptSecret({
            ciphertext: row.encryptedCredentials,
            iv: row.credentialsIv,
            authTag: row.credentialsAuthTag,
        });
        const parsed = JSON.parse(json) as { webhookSecret?: string };
        return parsed.webhookSecret ?? null;
    }

    /**
     * Initiate a refund against an Order's SUCCEEDED payment (S5-003).
     * `payment:manage`.
     *
     * - The Order must belong to `ctx.organizationId` (else 404).
     * - The Order must have a SUCCEEDED PaymentIntent (else 400) — you can only
     *   refund money that was actually collected.
     * - `amountCents` is taken from the intent (server-authoritative) — never
     *   from client input.
     * - Calls the provider refund API and records a PENDING {@link PaymentRefund}.
     *   The Order.paymentStatus is NOT moved here; it flips to REFUNDED only when
     *   the provider's refund webhook is reconciled (via the state machine).
     */
    async initiateRefund(
        ctx: OrganizationContext,
        orderId: string,
        reason?: string,
    ): Promise<InitiateRefundResult> {
        authorize(ctx, "payment:manage");

        const order = await this.requireOwnedOrder(ctx, orderId);

        const intent = await prisma.paymentIntent.findFirst({
            where: {
                orderId: order.id,
                organizationId: ctx.organizationId,
                status: "SUCCEEDED",
            },
            orderBy: { createdAt: "desc" },
        });
        if (!intent?.providerIntentId) {
            throw new BadRequestException(
                "Order has no successful payment to refund",
            );
        }

        const providerRow = await this.requireOwnedProvider(
            ctx.organizationId,
            intent.provider,
        );

        // The provider payment id captured from the success webhook (needed by
        // e.g. Razorpay to book the refund). Null-safe: some providers refund
        // against the order id alone.
        const attempt = await prisma.paymentAttempt.findFirst({
            where: {
                paymentIntentId: intent.id,
                providerRef: { not: null },
            },
            orderBy: { createdAt: "desc" },
        });

        const credentials = this.openCredentials(providerRow);
        const provider = this.factory.get(providerRow.provider);
        const result = await provider.refund({
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: attempt?.providerRef ?? null,
            amountCents: intent.amountCents,
            currency: intent.currency,
            credentials,
        });

        const refund = await prisma.paymentRefund.create({
            data: {
                organizationId: ctx.organizationId,
                paymentIntentId: intent.id,
                amountCents: intent.amountCents,
                currency: intent.currency,
                status: "PENDING",
                providerRefundId: result.providerRefundId,
                reason: reason ?? null,
            },
        });

        return {
            refundId: refund.id,
            paymentIntentId: intent.id,
            provider: providerRow.provider,
            providerRefundId: refund.providerRefundId,
            amountCents: refund.amountCents,
            currency: refund.currency,
            status: refund.status,
        };
    }

    /**
     * Create a payment intent for one of the org's Orders. `payment:manage`.
     *
     * - The Order must belong to `ctx.organizationId` (else 404).
     * - `amountCents` is computed from `order.total` and `currency` from the
     *   Order — NEVER from client input.
     * - Idempotent: a prior `(orderId, idempotencyKey)` returns the first intent.
     * - Uses the org's CONNECTED provider (or the pinned one, which must be
     *   CONNECTED). Credentials are decrypted in-memory only for the provider
     *   call. The PaymentIntent (+ a CREATED PaymentAttempt with a sanitized raw
     *   response) are written in one transaction.
     */
    async createIntentForOrder(
        ctx: OrganizationContext,
        orderId: string,
        options: { idempotencyKey?: string; provider?: string } = {},
    ): Promise<CreateIntentResult> {
        authorize(ctx, "payment:manage");
        const order = await this.requireOwnedOrder(ctx, orderId);
        return this.createIntentInternal(ctx.organizationId, order, options);
    }

    /**
     * PUBLIC checkout create-intent (S5-004) — the write behind
     * `POST /public/orders/:orderId/payment-intent`. There is NO session and NO
     * client-supplied org: the owning organization is resolved ENTIRELY from the
     * Order row, and `amountCents` is derived from `order.total` server-side.
     *
     * SECURITY: no amount ever enters this path — a buyer targets an Order by id
     * and the charged amount is fixed by that Order, so a tampered client cannot
     * influence how much is charged (price-tampering protection). Idempotent via
     * the shared `(orderId, idempotencyKey)` unique constraint.
     */
    async createIntentForOrderPublic(
        orderId: string,
        options: { idempotencyKey?: string; provider?: string } = {},
    ): Promise<CreateIntentResult> {
        const order = await this.requirePayableOrder(orderId);
        return this.createIntentInternal(order.organizationId, order, options);
    }

    /**
     * The shared server-authoritative create-intent core. `organizationId` is
     * ALWAYS resolved by the caller from a trusted source (the proven
     * OrganizationContext for the owner path, or the Order row for the public
     * path) — never from client input. `amountCents`/`currency` are derived from
     * the Order here so no caller can inject an amount.
     */
    private async createIntentInternal(
        organizationId: string,
        order: {
            id: string;
            total: Prisma.Decimal | string | number;
            currency: string;
        },
        options: { idempotencyKey?: string; provider?: string },
    ): Promise<CreateIntentResult> {
        const orderId = order.id;

        // Server-authoritative money: derived ONLY from the Order.
        const amountCents = totalToCents(order.total);
        const currency = order.currency;

        // Idempotency: a prior create with the same key returns the first intent.
        // Treat an empty/blank key as "no key" (no idempotency dedupe).
        const rawKey = options.idempotencyKey?.trim();
        const idempotencyKey = rawKey && rawKey.length > 0 ? rawKey : undefined;
        if (idempotencyKey) {
            const existing = await prisma.paymentIntent.findUnique({
                where: { orderId_idempotencyKey: { orderId, idempotencyKey } },
            });
            if (existing) {
                return this.replay(organizationId, existing);
            }
        }

        // Resolve the provider row: the pinned one, or the single CONNECTED one.
        const providerRow = await this.resolveConnectedProvider(
            organizationId,
            options.provider,
        );

        // Decrypt in-memory ONLY here, at the moment of the provider call.
        const credentials = this.openCredentials(providerRow);
        const provider = this.factory.get(providerRow.provider);
        const intent = await provider.createOrderIntent({
            amountCents,
            currency,
            orderId,
            credentials,
        });

        // Persist intent + first attempt atomically. rawResponse holds only the
        // non-secret client params — never any credential.
        try {
            const created = await prisma.$transaction(async (tx) => {
                const paymentIntent = await tx.paymentIntent.create({
                    data: {
                        organizationId,
                        orderId,
                        provider: providerRow.provider,
                        providerIntentId: intent.providerIntentId,
                        amountCents,
                        currency,
                        status: "REQUIRES_PAYMENT",
                        idempotencyKey: idempotencyKey ?? null,
                    },
                });
                await tx.paymentAttempt.create({
                    data: {
                        organizationId,
                        paymentIntentId: paymentIntent.id,
                        provider: providerRow.provider,
                        providerRef: intent.providerIntentId,
                        status: "CREATED",
                        rawResponse: {
                            providerIntentId: intent.providerIntentId,
                            clientParams: intent.clientParams,
                        } as Prisma.InputJsonValue,
                    },
                });
                return paymentIntent;
            });

            return {
                paymentIntentId: created.id,
                provider: providerRow.provider,
                providerIntentId: intent.providerIntentId,
                amountCents,
                currency,
                publicKey: providerRow.publicKey ?? null,
                clientParams: intent.clientParams,
            };
        } catch (err) {
            // Lost an idempotency race (unique [orderId, idempotencyKey]) — the
            // other request created it first; return that one.
            if (idempotencyKey && (err as { code?: string }).code === "P2002") {
                const winner = await prisma.paymentIntent.findUnique({
                    where: {
                        orderId_idempotencyKey: { orderId, idempotencyKey },
                    },
                });
                if (winner) return this.replay(organizationId, winner);
            }
            throw err;
        }
    }

    /**
     * PUBLIC buyer receipt (S5-004) — the read behind
     * `GET /public/orders/:orderId/receipt`. Returns a BUYER-safe view: the
     * order number, line totals, currency, the reconciled `paymentStatus`, and
     * the latest intent's status. NO secrets, NO internal ids. Anonymous (no
     * session): a buyer polls this after paying to see PAID/UNPAID/FAILED/
     * REFUNDED once the webhook reconciler (S5-003) moves the order.
     */
    async getReceipt(orderId: string): Promise<PublicReceiptResult> {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                orderId: true,
                subtotal: true,
                tax: true,
                shipping: true,
                discount: true,
                total: true,
                currency: true,
                paymentStatus: true,
                status: true,
            },
        });
        if (!order) {
            throw new NotFoundException("Order not found");
        }

        const intent = await prisma.paymentIntent.findFirst({
            where: { orderId },
            orderBy: { createdAt: "desc" },
            select: {
                provider: true,
                status: true,
                amountCents: true,
                currency: true,
            },
        });

        return {
            orderNumber: order.orderId,
            currency: order.currency,
            subtotal: String(order.subtotal),
            tax: String(order.tax),
            shipping: String(order.shipping),
            discount: String(order.discount),
            total: String(order.total),
            paymentStatus: order.paymentStatus,
            fulfilmentStatus: order.status,
            latestPayment: intent
                ? {
                      provider: intent.provider,
                      status: intent.status,
                      amountCents: intent.amountCents,
                      currency: intent.currency,
                  }
                : null,
        };
    }

    /**
     * Owner-facing payments summary for an Order (S5-004). `payment:read`. The
     * Order must belong to `ctx.organizationId` (else 404). Returns every
     * PaymentIntent with its attempts + refunds so the dashboard can show the
     * full money trail. This is an authenticated owner view, so internal ids are
     * fine — but still NO secret material (credentials never live on these rows).
     */
    async listOrderPayments(
        ctx: OrganizationContext,
        orderId: string,
    ): Promise<OrderPaymentsSummary> {
        authorize(ctx, "payment:read");
        const order = await this.requireOwnedOrder(ctx, orderId);

        const intents = await prisma.paymentIntent.findMany({
            where: { orderId: order.id, organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            include: {
                attempts: { orderBy: { createdAt: "asc" } },
                refunds: { orderBy: { createdAt: "asc" } },
            },
        });

        return {
            orderId: order.id,
            paymentStatus: order.paymentStatus,
            total: String(order.total),
            currency: order.currency,
            intents: intents.map((intent) => ({
                id: intent.id,
                provider: intent.provider,
                providerIntentId: intent.providerIntentId,
                status: intent.status,
                amountCents: intent.amountCents,
                currency: intent.currency,
                createdAt: intent.createdAt,
                attempts: intent.attempts.map((a) => ({
                    id: a.id,
                    provider: a.provider,
                    providerRef: a.providerRef,
                    status: a.status,
                    createdAt: a.createdAt,
                })),
                refunds: intent.refunds.map((r) => ({
                    id: r.id,
                    status: r.status,
                    amountCents: r.amountCents,
                    currency: r.currency,
                    providerRefundId: r.providerRefundId,
                    reason: r.reason,
                    createdAt: r.createdAt,
                })),
            })),
        };
    }

    /**
     * Rebuild a {@link CreateIntentResult} for an already-existing intent
     * (idempotent replay). clientParams are recovered from the first attempt's
     * sanitized rawResponse; publicKey from the provider row (if still present).
     */
    private async replay(
        organizationId: string,
        intent: {
            id: string;
            provider: string;
            providerIntentId: string | null;
            amountCents: number;
            currency: string;
        },
    ): Promise<CreateIntentResult> {
        const attempt = await prisma.paymentAttempt.findFirst({
            where: { paymentIntentId: intent.id },
            orderBy: { createdAt: "asc" },
        });
        const raw = (attempt?.rawResponse ?? {}) as {
            clientParams?: Record<string, unknown>;
        };
        const providerRow = await prisma.merchantPaymentProvider.findUnique({
            where: {
                organizationId_provider: {
                    organizationId,
                    provider: intent.provider,
                },
            },
        });

        return {
            paymentIntentId: intent.id,
            provider: intent.provider,
            providerIntentId: intent.providerIntentId ?? "",
            amountCents: intent.amountCents,
            currency: intent.currency,
            publicKey: providerRow?.publicKey ?? null,
            clientParams: raw.clientParams ?? {},
        };
    }

    /** Decrypt + parse the sealed `{ keyId, keySecret }`. In-memory only. */
    private openCredentials(row: MerchantPaymentProvider): ProviderCredentials {
        const json = decryptSecret({
            ciphertext: row.encryptedCredentials,
            iv: row.credentialsIv,
            authTag: row.credentialsAuthTag,
        });
        const parsed = JSON.parse(json) as Partial<ProviderCredentials>;
        if (!parsed.keyId || !parsed.keySecret) {
            throw new BadRequestException(
                "Stored provider credentials are malformed",
            );
        }
        return { keyId: parsed.keyId, keySecret: parsed.keySecret };
    }

    /**
     * Resolve which CONNECTED provider backs an intent. If a name is pinned it
     * must exist and be CONNECTED (409 if DISABLED, 400 if never connected).
     * Otherwise there must be exactly one CONNECTED provider (400 if none, 409
     * if the choice is ambiguous).
     */
    private async resolveConnectedProvider(
        organizationId: string,
        pinned?: string,
    ): Promise<MerchantPaymentProvider> {
        if (pinned) {
            const name = pinned.toUpperCase();
            const row = await prisma.merchantPaymentProvider.findUnique({
                where: {
                    organizationId_provider: {
                        organizationId,
                        provider: name,
                    },
                },
            });
            if (!row) {
                throw new BadRequestException(
                    `Provider "${name}" is not connected for this organization`,
                );
            }
            if (row.status !== "CONNECTED") {
                throw new ConflictException(
                    `Provider "${name}" is not connected (status: ${row.status})`,
                );
            }
            return row;
        }

        const connected = await prisma.merchantPaymentProvider.findMany({
            where: { organizationId, status: "CONNECTED" },
            orderBy: { createdAt: "asc" },
        });
        if (connected.length === 0) {
            throw new BadRequestException(
                "No connected payment provider for this organization",
            );
        }
        if (connected.length > 1) {
            throw new ConflictException(
                "Multiple providers connected — specify which provider to use",
            );
        }
        return connected[0];
    }

    /**
     * Load the org's provider row (404 for missing OR cross-tenant). Uses the
     * unique [organizationId, provider] so tenant scoping is inherent.
     */
    private async requireOwnedProvider(
        organizationId: string,
        provider: string,
    ): Promise<MerchantPaymentProvider> {
        const name = provider.toUpperCase();
        const row = await prisma.merchantPaymentProvider.findUnique({
            where: {
                organizationId_provider: {
                    organizationId,
                    provider: name,
                },
            },
        });
        if (!row) {
            throw new NotFoundException("Payment provider not found");
        }
        return row;
    }

    /**
     * Load an Order and assert it belongs to `ctx.organizationId`. 404 for a
     * missing OR cross-tenant id (never reveals another org's orders).
     */
    private async requireOwnedOrder(ctx: OrganizationContext, orderId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
        });
        if (order?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Order not found");
        }
        return order;
    }

    /**
     * Load an Order for the PUBLIC checkout path and resolve its owning org from
     * the row itself (never from a client). 404 for a missing order OR one with
     * no `organizationId` (an org-less order cannot be charged) — the buyer is
     * never told which case it was. Returns the order narrowed to a non-null
     * `organizationId`.
     */
    private async requirePayableOrder(orderId: string): Promise<{
        id: string;
        organizationId: string;
        total: Prisma.Decimal;
        currency: string;
    }> {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                organizationId: true,
                total: true,
                currency: true,
            },
        });
        if (!order?.organizationId) {
            throw new NotFoundException("Order not found");
        }
        return { ...order, organizationId: order.organizationId };
    }
}
