import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { PaymentStatus } from "../orders/dto";
import { assertPaymentTransition } from "../orders/order-state";
import { PaymentsService } from "../payments/payments.service";
import type {
    NormalizedWebhookEvent,
    WebhookHeaders,
    WebhookProviderFactory,
} from "./providers/webhook-provider.port";
import { WEBHOOK_PROVIDER_FACTORY } from "./providers/webhook-provider.port";

/** A Prisma transaction client (the `$transaction(async (tx) => …)` argument). */
type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** The outcome of handling one inbound webhook. Never carries secret material. */
export interface WebhookResult {
    /**
     * - `processed` — verified, first delivery, reconciled.
     * - `duplicate` — a re-delivery (same `(provider, providerEventId)`); no-op.
     * - `ignored`   — verified but not a money event / no matching intent.
     * - `failed`    — verified but reconciliation errored (recorded for replay).
     */
    status: "processed" | "duplicate" | "ignored" | "failed";
    /** Whether this call changed any payment/refund/order state. */
    changed: boolean;
}

/** A row loaded from `paymentIntent` for reconciliation (narrow select). */
interface IntentRow {
    id: string;
    organizationId: string;
    provider: string;
    orderId: string;
    status: string;
    amountCents: number;
    currency: string;
}

/**
 * Signed webhook inbox + exactly-once reconciliation (S5-003).
 *
 * The heart of the money-safety contract:
 *
 *  1. VERIFY FIRST — the org's decrypted webhook secret is loaded from the URL's
 *     `organizationId` and the RAW request bytes are HMAC-checked BEFORE the body
 *     is parsed or trusted. A missing secret or bad signature is a 401 and
 *     records/changes NOTHING (a forged event never touches state).
 *  2. IDEMPOTENT INBOX — the verified event is written to `WebhookEvent` whose
 *     `(provider, providerEventId)` is UNIQUE. A duplicate delivery hits P2002
 *     and returns a 200 no-op — this is the exactly-once guarantee.
 *  3. RECONCILE — inside a `$transaction`, the event is mapped to a PaymentIntent
 *     and applied: SUCCEEDED→PAID, FAILED, refund→REFUNDED. Every Order
 *     paymentStatus move goes through {@link assertPaymentTransition}, and a
 *     same→same target is a guard-free no-op, so money state moves at most once
 *     even if the same event somehow reaches reconcile twice.
 *
 * ERROR POLICY (documented, deliberate): a reconciliation error marks the
 * durably-stored event `FAILED` (+ `error`) and returns **200**, NOT a 5xx. The
 * event is retained for inspection/replay by an internal job; returning 5xx
 * would invite the provider to hammer a poison event into an endless retry loop,
 * which is the more dangerous failure mode. Transient infra failures (e.g. the
 * inbox write itself throwing something other than P2002) still propagate as
 * 5xx so the provider retries a delivery we never durably accepted.
 */
@Injectable()
export class WebhooksService {
    private readonly logger = new Logger(WebhooksService.name);

    constructor(
        @Inject(WEBHOOK_PROVIDER_FACTORY)
        private readonly factory: WebhookProviderFactory,
        private readonly payments: PaymentsService,
    ) {}

    async handle(
        providerName: string,
        organizationId: string,
        rawBody: Buffer,
        headers: WebhookHeaders,
    ): Promise<WebhookResult> {
        // Unknown provider → 404 (nothing to verify against). Resolved before we
        // ever touch the org's secret or the body.
        const provider = this.factory.get(providerName);
        const name = provider.name;

        // Load the org's webhook secret from the trusted URL org BEFORE trusting
        // anything in the request. No secret → cannot verify → reject.
        const secret = await this.payments.getWebhookSecret(
            organizationId,
            name,
        );
        if (!secret) {
            throw new UnauthorizedException(
                "Webhook signature verification failed",
            );
        }

        // Constant-time HMAC over the RAW bytes. A forged/altered body is
        // rejected here and NEVER recorded or processed.
        if (!provider.verifySignature({ rawBody, headers, secret })) {
            throw new UnauthorizedException(
                "Webhook signature verification failed",
            );
        }

        // Only now is the body trusted enough to parse.
        let payload: unknown;
        try {
            payload = JSON.parse(rawBody.toString("utf8"));
        } catch {
            throw new BadRequestException("Malformed webhook body");
        }

        const event = provider.parseEvent({ payload, headers });

        // Idempotent inbox. A duplicate `(provider, providerEventId)` → P2002 →
        // 200 no-op: the exactly-once guarantee. Any OTHER error propagates.
        let inboxId: string;
        try {
            const row = await prisma.webhookEvent.create({
                data: {
                    organizationId,
                    provider: name,
                    providerEventId: event.providerEventId,
                    eventType: event.eventType,
                    payload: payload as Prisma.InputJsonValue,
                    signature: provider.signatureHeader(headers) ?? null,
                    status: "RECEIVED",
                },
            });
            inboxId = row.id;
        } catch (err) {
            if (isUniqueViolation(err)) {
                return { status: "duplicate", changed: false };
            }
            throw err;
        }

        // Reconcile. On error, record FAILED and return 200 (see class docs).
        try {
            const { applied } = await prisma.$transaction((tx) =>
                this.reconcile(tx, name, organizationId, event),
            );
            await prisma.webhookEvent.update({
                where: { id: inboxId },
                data: {
                    status: applied ? "PROCESSED" : "IGNORED",
                    processedAt: new Date(),
                },
            });
            return {
                status: applied ? "processed" : "ignored",
                changed: applied,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await prisma.webhookEvent.update({
                where: { id: inboxId },
                data: {
                    status: "FAILED",
                    error: message,
                    processedAt: new Date(),
                },
            });
            this.logger.warn(
                `Webhook ${name}/${event.providerEventId} reconcile failed: ${message}`,
            );
            return { status: "failed", changed: false };
        }
    }

    /**
     * Map a verified event to a PaymentIntent and apply its money effect. Pure
     * of HTTP/secret concerns. Returns `{ applied }` — whether any state moved.
     */
    private async reconcile(
        tx: Tx,
        provider: string,
        organizationId: string,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        if (event.outcome === "IGNORED") return { applied: false };

        const intent = await this.findIntent(
            tx,
            provider,
            organizationId,
            event,
        );
        if (!intent) return { applied: false };

        switch (event.outcome) {
            case "SUCCEEDED":
                return this.applySuccess(tx, intent, event);
            case "FAILED":
                return this.applyFailure(tx, intent);
            case "REFUNDED":
                return this.applyRefund(tx, intent, event);
            default:
                return { applied: false };
        }
    }

    /** Resolve the PaymentIntent by provider intent id, else by merchant order id. */
    private async findIntent(
        tx: Tx,
        provider: string,
        organizationId: string,
        event: NormalizedWebhookEvent,
    ): Promise<IntentRow | null> {
        if (event.providerIntentId) {
            const byIntent = (await tx.paymentIntent.findFirst({
                where: {
                    organizationId,
                    provider,
                    providerIntentId: event.providerIntentId,
                },
            })) as IntentRow | null;
            if (byIntent) return byIntent;
        }
        if (event.orderRef) {
            const byOrder = (await tx.paymentIntent.findFirst({
                where: { organizationId, provider, orderId: event.orderRef },
                orderBy: { createdAt: "desc" },
            })) as IntentRow | null;
            return byOrder;
        }
        return null;
    }

    private async applySuccess(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // Order.paymentStatus → PAID FIRST, ROUTED through the state machine; an
        // illegal move throws BEFORE any intent/attempt write. A same→same
        // target (already PAID) is a guard-free no-op.
        let applied = await this.moveOrderPayment(tx, intent.orderId, "PAID");

        if (intent.status !== "SUCCEEDED") {
            await tx.paymentIntent.update({
                where: { id: intent.id },
                data: { status: "SUCCEEDED" },
            });
            applied = true;
            // Record the provider payment id so a later refund can reference it.
            if (event.providerPaymentRef) {
                await tx.paymentAttempt.create({
                    data: {
                        organizationId: intent.organizationId,
                        paymentIntentId: intent.id,
                        provider: intent.provider,
                        providerRef: event.providerPaymentRef,
                        status: "CAPTURED",
                    },
                });
            }
        }
        return { applied };
    }

    private async applyFailure(
        tx: Tx,
        intent: IntentRow,
    ): Promise<{ applied: boolean }> {
        let applied = false;
        // Never override a succeeded intent with a late failure.
        if (intent.status !== "SUCCEEDED" && intent.status !== "FAILED") {
            await tx.paymentIntent.update({
                where: { id: intent.id },
                data: { status: "FAILED" },
            });
            applied = true;
        }
        // Move Order UNPAID→FAILED only. A stray failure after a capture (PAID)
        // is IGNORED rather than forced through an illegal transition.
        const order = await tx.order.findUnique({
            where: { id: intent.orderId },
            select: { paymentStatus: true },
        });
        if (order?.paymentStatus === "UNPAID") {
            const changed = await this.moveOrderPayment(
                tx,
                intent.orderId,
                "FAILED",
            );
            applied = applied || changed;
        }
        return { applied };
    }

    private async applyRefund(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // Order.paymentStatus → REFUNDED via the state machine FIRST (PAID→
        // REFUNDED); an illegal move (e.g. UNPAID→REFUNDED) throws before any
        // refund write. Already REFUNDED is a guard-free no-op.
        let applied = await this.moveOrderPayment(
            tx,
            intent.orderId,
            "REFUNDED",
        );

        // Settle the PaymentRefund idempotently: PENDING→SUCCEEDED once, or
        // create SUCCEEDED if the refund originated outside our initiate flow.
        if (event.providerRefundId) {
            const existing = await tx.paymentRefund.findFirst({
                where: {
                    organizationId: intent.organizationId,
                    providerRefundId: event.providerRefundId,
                },
            });
            if (existing) {
                if (existing.status !== "SUCCEEDED") {
                    await tx.paymentRefund.update({
                        where: { id: existing.id },
                        data: { status: "SUCCEEDED" },
                    });
                    applied = true;
                }
            } else {
                await tx.paymentRefund.create({
                    data: {
                        organizationId: intent.organizationId,
                        paymentIntentId: intent.id,
                        amountCents: intent.amountCents,
                        currency: intent.currency,
                        status: "SUCCEEDED",
                        providerRefundId: event.providerRefundId,
                    },
                });
                applied = true;
            }
        }
        return { applied };
    }

    /**
     * Move an Order's paymentStatus, ROUTING every real change through
     * {@link assertPaymentTransition}. A same→same target is an idempotent no-op
     * (never asserted, so a re-applied event can't error). Returns whether it
     * actually moved. This is the ONLY place reconciliation writes
     * Order.paymentStatus.
     */
    private async moveOrderPayment(
        tx: Tx,
        orderId: string,
        target: PaymentStatus,
    ): Promise<boolean> {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { paymentStatus: true },
        });
        if (!order) return false;

        const current = order.paymentStatus as PaymentStatus;
        if (current === target) return false; // idempotent no-op

        assertPaymentTransition(current, target); // throws on an illegal move
        await tx.order.update({
            where: { id: orderId },
            data: { paymentStatus: target },
        });
        return true;
    }
}

/** True for a Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
    );
}
