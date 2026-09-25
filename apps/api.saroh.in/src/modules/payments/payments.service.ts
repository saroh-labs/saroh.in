import {
    BadGatewayException,
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { MerchantPaymentProvider } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { creditNoteForRefund } from "../invoices/order-invoicing";
import type {
    LineRefundRequest,
    PlannedLineRefund,
    RefundableLine,
} from "../orders/order-refunds";
import {
    allocateAcrossPayments,
    apportionLines,
    planLineRefund,
    planRemainingLines,
} from "../orders/order-refunds";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { authorize } from "../organizations/organization-policy";
import { decryptSecret, encryptSecret } from "./crypto";
import type {
    ProviderCredentials,
    ProviderFactory,
    RefundResult,
} from "./providers/provider.port";
import {
    isSupportedProvider,
    PROVIDER_FACTORY,
    RefundCallError,
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

/** What a merchant asks to refund (U6). Never an amount. */
export interface RefundRequest {
    reason?: string;
    /** Lines and how many of each; none means everything left. */
    lines?: LineRefundRequest[];
    /** A retry with the same key returns the first refund. */
    idempotencyKey?: string;
}

/**
 * The client-safe result of initiating a refund — NO secret, ever.
 *
 * The top-level fields describe the first refund row (the shape before
 * U6); `amountCents` is the whole refund. A refund that had to come back
 * from two payments lists both in `refunds`.
 */
export interface InitiateRefundResult {
    refundId: string;
    paymentIntentId: string;
    provider: string;
    providerRefundId: string | null;
    amountCents: number;
    currency: string;
    status: string;
    /**
     * The provider has not said yet whether a part of this refund was made
     * (its call timed out, or answered unsure). The money stays reserved
     * until the refund webhook — or a try-again — settles it.
     */
    beingConfirmed: boolean;
    refunds: {
        id: string;
        paymentIntentId: string;
        amountCents: number;
        status: string;
        providerRefundId: string | null;
        beingConfirmed: boolean;
    }[];
    /** The lines this refund covers, with the amount worked out for each. */
    lines: { itemId: string; quantity: number; amountCents: number }[];
}

interface RefundRow {
    id: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
    status: string;
    providerRefundId: string | null;
    paymentIntent: { provider: string };
    lines: { orderItemId: string; quantity: number; amountCents: number }[];
}

/** PENDING with no provider refund id: the provider's answer was lost. */
function beingConfirmed(row: {
    status: string;
    providerRefundId: string | null;
}): boolean {
    return row.status === "PENDING" && !row.providerRefundId;
}

const REFUND_ROW_INCLUDE = {
    paymentIntent: { select: { provider: true } },
    lines: {
        select: { orderItemId: true, quantity: true, amountCents: true },
    },
} as const;

function refundResult(rows: RefundRow[]): InitiateRefundResult {
    const [first] = rows;
    return {
        refundId: first.id,
        paymentIntentId: first.paymentIntentId,
        provider: first.paymentIntent.provider,
        providerRefundId: first.providerRefundId,
        amountCents: rows.reduce((s, r) => s + r.amountCents, 0),
        currency: first.currency,
        status: first.status,
        beingConfirmed: rows.some(beingConfirmed),
        refunds: rows.map((r) => ({
            id: r.id,
            paymentIntentId: r.paymentIntentId,
            amountCents: r.amountCents,
            status: r.status,
            providerRefundId: r.providerRefundId,
            beingConfirmed: beingConfirmed(r),
        })),
        lines: rows.flatMap((r) =>
            r.lines.map((l) => ({
                itemId: l.orderItemId,
                quantity: l.quantity,
                amountCents: l.amountCents,
            })),
        ),
    };
}

/**
 * What one provider call made of a reserved refund row. `ACCEPTED` says
 * whether this call attached the provider's refund id — the refund webhook
 * may have matched the row by Saroh's reference and settled it first, and
 * then it wrote the REFUND step, not this call.
 */
type RefundOutcome =
    | { kind: "ACCEPTED"; row: RefundRow; attached: boolean }
    | { kind: "UNKNOWN"; row: RefundRow }
    | { kind: "REFUSED"; row: RefundRow; error: Error };

/**
 * A refund the provider refused, as the merchant hears it. Anything that is
 * not the provider's refusal (a missing provider, say) passes through.
 */
function refusal(error: Error): Error {
    return error instanceof RefundCallError
        ? new BadGatewayException(
              "The payment provider refused the refund. Nothing was sent back.",
          )
        : error;
}

/**
 * An order's lines with what has already been refunded of each — pending or
 * settled, never failed. Read inside the refund's transaction, under the
 * order's row lock.
 */
async function refundableLines(
    tx: Prisma.TransactionClient,
    orderId: string,
): Promise<RefundableLine[]> {
    const items = await tx.orderItem.findMany({
        where: { orderId },
        orderBy: { id: "asc" },
        select: {
            id: true,
            quantity: true,
            price: true,
            refundLines: {
                where: { paymentRefund: { status: { not: "FAILED" } } },
                select: { quantity: true, amountCents: true },
            },
        },
    });
    return items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        unitCents: totalToCents(i.price),
        refundedQuantity: i.refundLines.reduce((s, r) => s + r.quantity, 0),
        refundedCents: i.refundLines.reduce((s, r) => s + r.amountCents, 0),
    }));
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
    /**
     * Where the order was placed, as the storefront describes itself to
     * customers (Sell → Storefronts). Public by nature: it is what the shop
     * puts on its own door.
     */
    storefront: {
        name: string;
        kind: string;
        address: string | null;
        openingHours: unknown;
        /** Paused storefronts take no payments until they are turned back on. */
        acceptingPayments: boolean;
    };
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
    private readonly logger = new Logger(PaymentsService.name);

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
     * Refund an Order's money, by line or in full (S5-003; ADR-008, U6).
     * `payment:manage` — a Member never refunds.
     *
     * - The Order must belong to `ctx.organizationId` (else 404) and have a
     *   SUCCEEDED payment (else 400) — only money actually collected goes
     *   back.
     * - The amount is worked out HERE: with `lines`, what each chosen line
     *   paid for the chosen quantity, capped at what is left of the line;
     *   with none, everything still refundable. Never from client input.
     * - Two phases. Under the order's row lock the refund is RESERVED — the
     *   PaymentRefund rows (PENDING, with the lines they cover) and the
     *   timeline step are written — so two racing requests cannot both see
     *   the same money left. The provider is called after that commits,
     *   with each row's id as Saroh's reference; a definite refusal marks
     *   the row FAILED, which frees its lines again, and an answer that
     *   never came keeps it PENDING with its money held (see
     *   {@link retryRefund}).
     * - Idempotent by `idempotencyKey`: a retry with the same key returns
     *   the refund the first one made, even while it is in flight.
     * - Order.paymentStatus is NOT moved here. The refund webhook settles it,
     *   and moves the order to REFUNDED only when every rupee taken has gone
     *   back; until then the order reads "partly refunded" (derived).
     */
    async initiateRefund(
        ctx: OrganizationContext,
        orderId: string,
        input: RefundRequest = {},
    ): Promise<InitiateRefundResult> {
        authorize(ctx, "payment:manage");
        const order = await this.requireOwnedOrder(ctx, orderId);
        const lines = input.lines;
        return this.refundOrder(ctx, order, {
            idempotencyKey: input.idempotencyKey,
            reason: input.reason ?? null,
            forEdit: false,
            plan: async (tx) => {
                const refundable = await refundableLines(tx, order.id);
                const discountCents = totalToCents(order.discount);
                if (lines && lines.length > 0) {
                    const planned = planLineRefund(
                        refundable,
                        discountCents,
                        lines,
                    );
                    return {
                        amountCents: planned.reduce(
                            (s, l) => s + l.amountCents,
                            0,
                        ),
                        lines: planned,
                    };
                }
                // In full: whatever is left of the payments, recorded
                // against whatever is left of the lines.
                return {
                    amountCents: "REMAINING",
                    lines: planRemainingLines(refundable, discountCents),
                };
            },
        });
    }

    /**
     * Hand back a fixed amount because the order was edited down before
     * anyone started on it (U6). `payment:manage`; the caller has already
     * lowered the order total. No lines: nothing that was bought is being
     * refunded — the order simply costs less now.
     */
    async refundOrderDifference(
        ctx: OrganizationContext,
        orderId: string,
        amountCents: number,
        idempotencyKey: string,
    ): Promise<InitiateRefundResult> {
        authorize(ctx, "payment:manage");
        const order = await this.requireOwnedOrder(ctx, orderId);
        return this.refundOrder(ctx, order, {
            idempotencyKey,
            reason: "Order changed before preparing",
            forEdit: true,
            plan: () => Promise.resolve({ amountCents, lines: [] }),
        });
    }

    /**
     * Take the difference when an order is edited up after it was paid (U6):
     * a new payment on the ORDER for exactly that amount — the order stays
     * the ledger for its own payments. `payment:manage`. Idempotent by key.
     */
    async createDifferenceIntent(
        ctx: OrganizationContext,
        orderId: string,
        amountCents: number,
        idempotencyKey: string,
    ): Promise<CreateIntentResult> {
        authorize(ctx, "payment:manage");
        const order = await this.requireOwnedOrder(ctx, orderId);
        if (amountCents <= 0) {
            throw new BadRequestException("Nothing more to take on this order");
        }
        return this.createIntentFor(
            ctx.organizationId,
            {
                kind: "order",
                id: order.id,
                amountCents,
                currency: order.currency,
            },
            idempotencyKey,
            async () => {
                const settings = await prisma.storeSettings.findUnique({
                    where: { storeId: order.storeId },
                    select: { checkoutProvider: true },
                });
                return this.resolveConnectedProvider(
                    ctx.organizationId,
                    settings?.checkoutProvider ?? undefined,
                );
            },
        );
    }

    /**
     * Try again a refund whose provider answer was lost (#508, U1).
     * `payment:manage`; the refund must be a PENDING row of an order of the
     * caller's organization (else 404).
     *
     * It looks before it sends: the provider is asked for the refund made
     * under this row's reference, and the row is settled from that answer.
     * Only when the provider has none is it sent again — the same reference
     * and amount, so Razorpay's idempotency key and Cashfree's `refund_id`
     * still hold. It never reserves new money, and never goes through the
     * key replay of {@link initiateRefund}, which answers a duplicate
     * request, not a retry.
     */
    async retryRefund(
        ctx: OrganizationContext,
        orderId: string,
        refundId: string,
    ): Promise<InitiateRefundResult> {
        authorize(ctx, "payment:manage");
        const order = await this.requireOwnedOrder(ctx, orderId);
        const row = await prisma.paymentRefund.findFirst({
            where: {
                id: refundId,
                organizationId: ctx.organizationId,
                paymentIntent: { orderId: order.id },
            },
            include: {
                ...REFUND_ROW_INCLUDE,
                paymentIntent: {
                    select: {
                        id: true,
                        provider: true,
                        providerIntentId: true,
                        currency: true,
                    },
                },
            },
        });
        if (!row) throw new NotFoundException("Refund not found");
        if (row.status !== "PENDING") {
            throw new ConflictException("This refund has already settled.");
        }
        // The provider took it; its webhook settles it. Nothing to retry.
        if (row.providerRefundId) return refundResult([row]);

        const call = await this.refundCall(
            ctx.organizationId,
            row.paymentIntent,
        );
        let found: RefundResult | null;
        try {
            found = await this.factory.get(call.provider).findRefund({
                reference: row.id,
                providerIntentId: row.paymentIntent.providerIntentId ?? "",
                providerPaymentRef: call.providerPaymentRef,
                credentials: call.credentials,
            });
        } catch {
            throw new ServiceUnavailableException(
                "We couldn't reach the payment provider. Try again in a minute.",
            );
        }

        const outcome = found
            ? await this.settleFromProvider(row.id, found)
            : await this.sendRefund(ctx.organizationId, row, row.paymentIntent);
        if (outcome.kind === "ACCEPTED") {
            await this.recordRefundTaken(ctx, order.id, row.reason, [outcome]);
        }
        if (outcome.kind === "REFUSED") throw refusal(outcome.error);
        return refundResult([outcome.row]);
    }

    /** The shared two-phase refund core — see {@link initiateRefund}. */
    private async refundOrder(
        ctx: OrganizationContext,
        order: { id: string },
        opts: {
            idempotencyKey?: string;
            reason: string | null;
            forEdit: boolean;
            plan: (tx: Prisma.TransactionClient) => Promise<{
                amountCents: number | "REMAINING";
                lines: PlannedLineRefund[];
            }>;
        },
    ): Promise<InitiateRefundResult> {
        const rawKey = opts.idempotencyKey?.trim();
        const key = rawKey && rawKey.length > 0 ? rawKey : null;
        const findByKey = (client: Prisma.TransactionClient, k: string) =>
            client.paymentRefund.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    idempotencyKey: k,
                    paymentIntent: { orderId: order.id },
                },
                include: REFUND_ROW_INCLUDE,
                orderBy: { createdAt: "asc" },
            });

        if (key) {
            const replay = await findByKey(prisma, key);
            if (replay.length > 0) return refundResult(replay);
        }

        const reserved = await prisma.$transaction(async (tx) => {
            // The order's row lock: every refund of this order queues here,
            // so the money left is read by one request at a time.
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
            if (key) {
                // The racing twin of this request may have reserved while we
                // waited for the lock.
                const replay = await findByKey(tx, key);
                if (replay.length > 0) return { replay, done: true as const };
            }

            const payments = await tx.paymentIntent.findMany({
                where: {
                    orderId: order.id,
                    organizationId: ctx.organizationId,
                    status: "SUCCEEDED",
                },
                orderBy: { createdAt: "asc" },
                include: {
                    refunds: {
                        where: { status: { not: "FAILED" } },
                        select: { amountCents: true },
                    },
                },
            });
            const refundable = payments
                .filter((p) => p.providerIntentId)
                .map((p) => ({
                    id: p.id,
                    intent: p,
                    leftCents:
                        p.amountCents -
                        p.refunds.reduce((s, r) => s + r.amountCents, 0),
                }));
            if (refundable.length === 0) {
                throw new BadRequestException(
                    "Order has no successful payment to refund",
                );
            }

            const plan = await opts.plan(tx);
            const amountCents =
                plan.amountCents === "REMAINING"
                    ? refundable.reduce(
                          (s, p) => s + Math.max(0, p.leftCents),
                          0,
                      )
                    : plan.amountCents;
            if (amountCents <= 0) {
                throw new BadRequestException(
                    "Nothing is left to refund on this order",
                );
            }
            // The order-level cap: never more than was taken and not yet
            // handed back, whatever the lines add up to.
            const split = allocateAcrossPayments(refundable, amountCents);
            // Each line rides on the part its money comes back from, so a
            // part the provider refuses frees only its own lines.
            const partLines = apportionLines(
                split.map((p) => p.amountCents),
                plan.lines,
            );

            const rows = [];
            for (const [i, part] of split.entries()) {
                rows.push(
                    await tx.paymentRefund.create({
                        data: {
                            organizationId: ctx.organizationId,
                            paymentIntentId: part.payment.id,
                            amountCents: part.amountCents,
                            currency: part.payment.intent.currency,
                            status: "PENDING",
                            reason: opts.reason,
                            idempotencyKey: key,
                            forEdit: opts.forEdit,
                            ...(partLines[i].length > 0
                                ? {
                                      lines: {
                                          create: partLines[i].map((l) => ({
                                              organizationId:
                                                  ctx.organizationId,
                                              orderItemId: l.itemId,
                                              quantity: l.quantity,
                                              amountCents: l.amountCents,
                                          })),
                                      },
                                  }
                                : {}),
                        },
                        include: REFUND_ROW_INCLUDE,
                    }),
                );
            }
            return { rows, split, done: false as const };
        });

        if (reserved.done) return refundResult(reserved.replay);

        // Phase two: the provider, outside the lock — every part, even
        // after one is refused, so no part is left reserved and never sent.
        const outcomes = [];
        for (const [i, part] of reserved.split.entries()) {
            outcomes.push(
                await this.sendRefund(
                    ctx.organizationId,
                    reserved.rows[i],
                    part.payment.intent,
                ),
            );
        }
        const taken = outcomes.flatMap((o) =>
            o.kind === "ACCEPTED" ? [o] : [],
        );
        if (taken.length > 0) {
            await this.recordRefundTaken(ctx, order.id, opts.reason, taken);
        }
        // Nothing went back and nothing may have: say so. Anything else is
        // an answer — some of it taken, some of it still being confirmed.
        const refused = outcomes.flatMap((o) =>
            o.kind === "REFUSED" ? [o.error] : [],
        );
        if (refused.length === outcomes.length) throw refusal(refused[0]);
        return refundResult(outcomes.map((o) => o.row));
    }

    /**
     * Send one reserved refund row to the provider, under the row's id as
     * Saroh's reference, and record what the provider said:
     *
     * - `ACCEPTED` — the provider took it; its refund id is stored and the
     *   row stays PENDING until the refund webhook settles it.
     * - `REFUSED` — the provider definitely made no refund (or the call
     *   never left Saroh): the row is FAILED, freeing its money and lines.
     * - `UNKNOWN` — the provider may have made one: the row stays PENDING
     *   with its money held. A second real refund cannot be undone; an
     *   over-held reservation can — by the webhook, or a try-again.
     */
    private async sendRefund(
        organizationId: string,
        row: { id: string; amountCents: number },
        intent: {
            id: string;
            provider: string;
            providerIntentId: string | null;
            currency: string;
        },
    ): Promise<RefundOutcome> {
        let result: RefundResult;
        try {
            const call = await this.refundCall(organizationId, intent);
            result = await this.factory.get(call.provider).refund({
                reference: row.id,
                providerIntentId: intent.providerIntentId ?? "",
                providerPaymentRef: call.providerPaymentRef,
                amountCents: row.amountCents,
                currency: intent.currency,
                credentials: call.credentials,
            });
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            if (err instanceof RefundCallError && err.outcome === "UNKNOWN") {
                this.logger.warn(
                    `Refund ${row.id}: the provider's answer is unknown (${error.message}); held until it says`,
                );
                return { kind: "UNKNOWN", row: await this.refundRow(row.id) };
            }
            return {
                kind: "REFUSED",
                row: await this.failRefund(row.id),
                error,
            };
        }
        return this.settleFromProvider(row.id, result);
    }

    /** Record a refund the provider has answered for (sent, or looked up). */
    private async settleFromProvider(
        refundId: string,
        result: RefundResult,
    ): Promise<RefundOutcome> {
        if (result.failed) {
            return {
                kind: "REFUSED",
                row: await this.failRefund(refundId),
                error: new RefundCallError(
                    `The provider refused refund ${refundId} (${result.status})`,
                    "REFUSED",
                ),
            };
        }
        // Only a row still PENDING with no provider id: the webhook may have
        // matched it by Saroh's reference and settled it first, under the
        // row's lock — then it wrote the REFUND step, and this call must not.
        const { count } = await prisma.paymentRefund.updateMany({
            where: { id: refundId, status: "PENDING", providerRefundId: null },
            data: { providerRefundId: result.providerRefundId },
        });
        return {
            kind: "ACCEPTED",
            row: await this.refundRow(refundId),
            attached: count === 1,
        };
    }

    /**
     * The provider took these refund rows: a REFUND step on the timeline
     * for the money, and a credit note per row against the order's invoice
     * (ADR-008) — one per row, keyed on it, so the refund webhook finding it
     * already made makes no second. An edit's difference is skipped: the
     * edit wrote its own. A failure here never undoes a refund the provider
     * took — the webhook's reconciliation makes the note instead.
     *
     * The REFUND step counts only the rows this call attached: a row the
     * webhook settled first had its step written there (DEC-026).
     */
    private async recordRefundTaken(
        ctx: OrganizationContext,
        orderId: string,
        reason: string | null,
        taken: { row: RefundRow; attached: boolean }[],
    ): Promise<void> {
        const attached = taken.filter((t) => t.attached);
        if (attached.length > 0) {
            await prisma.orderEvent.create({
                data: {
                    organizationId: ctx.organizationId,
                    orderId,
                    kind: "REFUND",
                    actorUserId: ctx.userId,
                    note: reason,
                    amountCents: attached.reduce(
                        (s, t) => s + t.row.amountCents,
                        0,
                    ),
                },
            });
        }
        for (const { row } of taken) {
            try {
                await prisma.$transaction((tx) =>
                    creditNoteForRefund(tx, row.id),
                );
            } catch (err) {
                this.logger.warn(
                    `Refund ${row.id} taken; its credit note waits for the webhook: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                );
            }
        }
    }

    /**
     * What a refund call needs: the connected provider, its decrypted
     * credentials, and the provider payment id captured from the success
     * webhook (Razorpay books the refund against it). Null-safe: some
     * providers refund against the order id alone.
     */
    private async refundCall(
        organizationId: string,
        intent: { id: string; provider: string },
    ): Promise<{
        provider: string;
        credentials: ProviderCredentials;
        providerPaymentRef: string | null;
    }> {
        const providerRow = await this.requireOwnedProvider(
            organizationId,
            intent.provider,
        );
        const attempt = await prisma.paymentAttempt.findFirst({
            where: { paymentIntentId: intent.id, providerRef: { not: null } },
            orderBy: { createdAt: "desc" },
        });
        return {
            provider: providerRow.provider,
            credentials: this.openCredentials(providerRow),
            providerPaymentRef: attempt?.providerRef ?? null,
        };
    }

    /** Nothing went back: free the money and the lines again. */
    private async failRefund(refundId: string): Promise<RefundRow> {
        // Only a row still PENDING — a settled refund is never un-made.
        await prisma.paymentRefund.updateMany({
            where: { id: refundId, status: "PENDING" },
            data: { status: "FAILED" },
        });
        return this.refundRow(refundId);
    }

    private async refundRow(refundId: string): Promise<RefundRow> {
        return prisma.paymentRefund.findUniqueOrThrow({
            where: { id: refundId },
            include: REFUND_ROW_INCLUDE,
        });
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
        await assertOrganizationOpen(order.organizationId);
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
            storeId: string;
            total: Prisma.Decimal | string | number;
            currency: string;
        },
        options: { idempotencyKey?: string; provider?: string },
    ): Promise<CreateIntentResult> {
        // Resolve the provider row: the one the caller pinned, else the one
        // the order's storefront chose (Sell → Storefronts), else the single
        // CONNECTED one. A business with two providers connected could not be
        // paid at all before a storefront could say which it uses. Looked up
        // lazily, after the idempotent replay, as it always was.
        const resolveProvider = async () => {
            const storefrontProvider = options.provider
                ? undefined
                : ((
                      await prisma.storeSettings.findUnique({
                          where: { storeId: order.storeId },
                          select: { checkoutProvider: true },
                      })
                  )?.checkoutProvider ?? undefined);
            return this.resolveConnectedProvider(
                organizationId,
                options.provider ?? storefrontProvider,
            );
        };
        // Server-authoritative money: derived ONLY from the Order.
        return this.createIntentFor(
            organizationId,
            {
                kind: "order",
                id: order.id,
                amountCents: totalToCents(order.total),
                currency: order.currency,
            },
            options.idempotencyKey,
            resolveProvider,
        );
    }

    /**
     * PUBLIC pay-link create-intent (ADR-007, U13) — the write behind
     * `POST /public/invoices/:token/payment-intent`. The caller has already
     * found the invoice by its token and checked it is ISSUED; the owning
     * organization comes from that row, never from the request.
     *
     * SECURITY: the amount and currency are the stored invoice's — the
     * request carries only a provider and an idempotency key — and the
     * provider must be one the business itself connected.
     */
    async createIntentForInvoicePublic(
        invoice: {
            id: string;
            organizationId: string;
            total: Prisma.Decimal | string;
            currency: string;
        },
        options: { idempotencyKey?: string; provider?: string } = {},
    ): Promise<CreateIntentResult> {
        return this.createIntentFor(
            invoice.organizationId,
            {
                kind: "invoice",
                id: invoice.id,
                amountCents: totalToCents(invoice.total),
                currency: invoice.currency,
            },
            options.idempotencyKey,
            // A pinned provider must be connected; otherwise the business's
            // first connected one. An invoice has no storefront to say which,
            // and two connected providers must not leave it unpayable.
            () =>
                this.resolveConnectedProvider(
                    invoice.organizationId,
                    options.provider,
                    { firstWhenSeveral: true },
                ),
        );
    }

    /**
     * The shared server-authoritative core behind every intent, for an Order
     * or an Invoice. The target's id is the merchant reference handed to the
     * provider (and echoed back by its webhooks); the amount was derived by
     * the caller from the stored row.
     */
    private async createIntentFor(
        organizationId: string,
        target: {
            kind: "order" | "invoice";
            id: string;
            amountCents: number;
            currency: string;
        },
        rawIdempotencyKey: string | undefined,
        resolveProvider: () => Promise<MerchantPaymentProvider>,
    ): Promise<CreateIntentResult> {
        const { amountCents, currency } = target;
        const link =
            target.kind === "order"
                ? { orderId: target.id }
                : { invoiceId: target.id };
        const findByKey = (idempotencyKey: string) =>
            prisma.paymentIntent.findUnique({
                where:
                    target.kind === "order"
                        ? {
                              orderId_idempotencyKey: {
                                  orderId: target.id,
                                  idempotencyKey,
                              },
                          }
                        : {
                              invoiceId_idempotencyKey: {
                                  invoiceId: target.id,
                                  idempotencyKey,
                              },
                          },
            });

        // Idempotency: a prior create with the same key returns the first intent.
        // Treat an empty/blank key as "no key" (no idempotency dedupe).
        const rawKey = rawIdempotencyKey?.trim();
        const idempotencyKey = rawKey && rawKey.length > 0 ? rawKey : undefined;
        if (idempotencyKey) {
            const existing = await findByKey(idempotencyKey);
            if (existing) {
                return this.replay(organizationId, existing);
            }
        }

        const providerRow = await resolveProvider();

        // Decrypt in-memory ONLY here, at the moment of the provider call.
        const credentials = this.openCredentials(providerRow);
        const provider = this.factory.get(providerRow.provider);
        const intent = await provider.createOrderIntent({
            amountCents,
            currency,
            orderId: target.id,
            credentials,
        });

        // Persist intent + first attempt atomically. rawResponse holds only the
        // non-secret client params — never any credential.
        try {
            const created = await prisma.$transaction(async (tx) => {
                const paymentIntent = await tx.paymentIntent.create({
                    data: {
                        organizationId,
                        ...link,
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
            // Lost an idempotency race (unique [orderId|invoiceId,
            // idempotencyKey]) — the other request created it first; return
            // that one.
            if (idempotencyKey && (err as { code?: string }).code === "P2002") {
                const winner = await findByKey(idempotencyKey);
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
                store: {
                    select: {
                        name: true,
                        settings: {
                            select: {
                                kind: true,
                                address: true,
                                openingHours: true,
                                pausedAt: true,
                            },
                        },
                    },
                },
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
            storefront: {
                name: order.store.name,
                kind: order.store.settings?.kind ?? "ONLINE",
                // An online store has no door, so no address or hours
                // are shown for it even if some were once saved.
                address:
                    order.store.settings?.kind === "SHOP"
                        ? order.store.settings.address
                        : null,
                openingHours:
                    order.store.settings?.kind === "SHOP"
                        ? (order.store.settings.openingHours ?? null)
                        : null,
                acceptingPayments: !order.store.settings?.pausedAt,
            },
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
        { firstWhenSeveral = false }: { firstWhenSeveral?: boolean } = {},
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
        if (connected.length > 1 && !firstWhenSeveral) {
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
        storeId: string;
        organizationId: string;
        total: Prisma.Decimal;
        currency: string;
    }> {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                storeId: true,
                organizationId: true,
                total: true,
                currency: true,
                store: { select: { settings: { select: { pausedAt: true } } } },
            },
        });
        if (!order?.organizationId) {
            throw new NotFoundException("Order not found");
        }
        // A paused storefront takes no payments (Sell → Storefronts → Closing
        // up). Refused here, on the buyer's path, so no intent is ever
        // created — a checkout page that merely hid its button would still
        // accept a payment posted straight at this endpoint.
        if (order.store.settings?.pausedAt) {
            throw new ConflictException(
                "This storefront is paused and is not taking payments.",
            );
        }
        const { store: _store, ...payable } = order;
        return { ...payable, organizationId: order.organizationId };
    }
}
