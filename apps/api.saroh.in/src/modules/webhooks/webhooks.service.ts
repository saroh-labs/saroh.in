import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMinor } from "../../common/money";
import { confirmHoldInTx } from "../bookings/booking-hold";
import { markBookingPaidInTx } from "../bookings/booking-pay-link";
import { completePackDraftInTx } from "../class-packs/pack-checkout";
import {
    CAPTURED_NEEDS_REFUND,
    ONLINE_PAYMENT_METHOD,
} from "../invoices/invoice-state";
import {
    creditNoteForRefund,
    creditRestOfOrder,
    ensureOrderInvoice,
    invoiceSupersededPayment,
    settleSupplementaryInvoices,
} from "../invoices/order-invoicing";
import type { PaymentStatus } from "../orders/dto";
import { finishCancelInTx } from "../orders/order-cancel";
import { RETIRED_PAY_LINK } from "../orders/order-pay-link";
import { assertPaymentTransition } from "../orders/order-state";
import { orderMoneyIntents } from "../orders/treatment-ledger";
import {
    OPEN_INTENT_STATUSES,
    SUPERSEDED_INTENT,
} from "../payments/intent-state";
import { PaymentsService } from "../payments/payments.service";
import { enqueueRefundSendInTx } from "../payments/send-refund.handler";
import { lockOrderShelves, settleRefundStock } from "../stock/reserve";
import { completePlanJoinInTx } from "../subscriptions/plan-join";
import { applyOnlineOrderSuccess } from "./online-order-payment";
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

/**
 * A row loaded from `paymentIntent` for reconciliation. Exactly one of
 * `orderId` / `invoiceId` is set (a CHECK constraint says so); `invoiceId`
 * may be absent on rows read by code that predates invoice intents.
 */
interface IntentRow {
    id: string;
    organizationId: string;
    provider: string;
    orderId: string | null;
    invoiceId?: string | null;
    providerIntentId?: string | null;
    status: string;
    amountCents: number;
    currency: string;
}

/** What the provider is called on an invoice paid through it. */
const PROVIDER_LABEL: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

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
 *     and applied: SUCCEEDED→PAID, FAILED, refund→REFUNDED once refunded in
 *     full (a partial refund leaves the order PAID — ADR-008). Every Order
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
     * Run a stored delivery through reconciliation again (admin console U8).
     *
     * Only a FAILED delivery is replayed: one that was PROCESSED or IGNORED
     * already had its effect decided, and replaying it could apply a payment
     * twice. The payload is the one verified when it arrived — it is never
     * re-sent by anyone — and every money effect below checks the state it
     * moves from, so a replay that races a live delivery changes nothing
     * twice. The row claims its own replay (FAILED → RECEIVED) before it
     * runs, so two operators replaying at once cannot both run it.
     */
    async replay(eventId: string): Promise<{
        status: "processed" | "ignored" | "failed" | "skipped";
        detail?: string;
    }> {
        const stored = await prisma.webhookEvent.findUnique({
            where: { id: eventId },
            select: {
                id: true,
                provider: true,
                organizationId: true,
                payload: true,
                status: true,
            },
        });
        if (!stored) return { status: "skipped", detail: "Delivery not found" };
        if (stored.status !== "FAILED") {
            return {
                status: "skipped",
                detail: `Already ${stored.status.toLowerCase()}; only a failed delivery is replayed`,
            };
        }
        if (!stored.organizationId) {
            return {
                status: "skipped",
                detail: "Delivery belongs to no business",
            };
        }

        const claimed = await prisma.webhookEvent.updateMany({
            where: { id: stored.id, status: "FAILED" },
            data: { status: "RECEIVED", error: null },
        });
        if (claimed.count === 0) {
            return {
                status: "skipped",
                detail: "Another replay took it first",
            };
        }

        const organizationId = stored.organizationId;
        try {
            const provider = this.factory.get(stored.provider);
            const event = provider.parseEvent({
                payload: stored.payload,
                headers: {},
            });
            const { applied } = await prisma.$transaction((tx) =>
                this.reconcile(tx, provider.name, organizationId, event),
            );
            await prisma.webhookEvent.update({
                where: { id: stored.id },
                data: {
                    status: applied ? "PROCESSED" : "IGNORED",
                    processedAt: new Date(),
                },
            });
            return { status: applied ? "processed" : "ignored" };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await prisma.webhookEvent.update({
                where: { id: stored.id },
                data: {
                    status: "FAILED",
                    error: message,
                    processedAt: new Date(),
                },
            });
            return { status: "failed", detail: message };
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

        const result = await this.applyOutcome(tx, intent, event);
        const feeRecorded = await recordFee(tx, intent, event);
        return { applied: result.applied || feeRecorded };
    }

    /** The money effect of one event on the intent it matched. */
    private async applyOutcome(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // An invoice's pay link (U13): the same outcomes, applied to the
        // invoice instead of an order.
        if (intent.invoiceId) {
            const invoiceId = intent.invoiceId;
            switch (event.outcome) {
                case "SUCCEEDED":
                    return this.applyInvoiceSuccess(
                        tx,
                        intent,
                        invoiceId,
                        event,
                    );
                case "FAILED":
                    return this.applyIntentFailure(tx, intent);
                case "REFUNDED":
                    return this.applyInvoiceRefund(tx, intent, event);
                case "REFUND_FAILED":
                    return this.failProviderRefund(tx, intent, event);
                default:
                    return { applied: false };
            }
        }

        const orderId = intent.orderId;
        if (!orderId) return { applied: false };
        switch (event.outcome) {
            case "SUCCEEDED":
                return this.applySuccess(tx, intent, orderId, event);
            case "FAILED":
                return this.applyFailure(tx, intent, orderId);
            case "REFUNDED":
                return this.applyRefund(tx, intent, orderId, event);
            // A refund that never went back changes the refund row only:
            // the order stays as it was, and no credit note is made.
            case "REFUND_FAILED":
                return this.failProviderRefund(tx, intent, event);
            default:
                return { applied: false };
        }
    }

    /**
     * Resolve the PaymentIntent by provider intent id, else by the merchant
     * reference we submitted at create — an Order's id or, for a pay link,
     * an Invoice's.
     */
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
                where: {
                    organizationId,
                    provider,
                    OR: [
                        { orderId: event.orderRef },
                        { invoiceId: event.orderRef },
                    ],
                },
                orderBy: { createdAt: "desc" },
            })) as IntentRow | null;
            return byOrder;
        }
        return null;
    }

    private async applySuccess(
        tx: Tx,
        found: IntentRow,
        orderId: string,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // The intent's status as it stands under its row lock: an edit
        // supersedes a difference charge under the order's lock, and must not
        // be overwritten by a payment read a moment before (#508, U8).
        const intent = { ...found, status: await lockIntent(tx, found) };
        if (intent.status === SUPERSEDED_INTENT) {
            return this.applySupersededSuccess(tx, intent, orderId, event);
        }

        // An order the site's checkout started (G13) holds its units only
        // now, and becomes an order only if they held. Read without a lock:
        // `placedOnline` is set when the order is made and never changes,
        // and the order's lock comes after the intent's (reserve.ts).
        const placed = await tx.order.findUnique({
            where: { id: orderId },
            select: { placedOnline: true },
        });
        if (placed?.placedOnline) {
            const online = await applyOnlineOrderSuccess(
                tx,
                intent,
                orderId,
                event,
                (target) => this.moveOrderPayment(tx, orderId, target),
            );
            // A refused checkout's refund is sent from a job written here,
            // with the refusal (G13, DEC-032): retried with backoff until
            // the provider answers, and never lost to a failed call.
            if (online.refundId && online.refundCreated) {
                await enqueueRefundSendInTx(
                    tx,
                    intent.organizationId,
                    online.refundId,
                );
            }
            return { applied: online.applied };
        }

        // Read before the move: money arriving on an order cancelled in the
        // meantime is owed back (plan B, B11), recorded below.
        const cancelled =
            intent.status !== "SUCCEEDED" &&
            (await isOrderCancelledInTx(tx, orderId));

        // Order.paymentStatus → PAID FIRST, ROUTED through the state machine; an
        // illegal move throws BEFORE any intent/attempt write. A same→same
        // target (already PAID) is a guard-free no-op.
        const paidNow = await this.moveOrderPayment(tx, orderId, "PAID");
        let applied = paidNow;

        // The order's invoice (ADR-008), made once, in this transaction: a
        // failed reconciliation leaves no invoice and no number behind, and
        // a replayed or second delivery finds the one already made.
        if (paidNow) {
            await ensureOrderInvoice(tx, orderId, {
                method: "ONLINE",
                reference:
                    event.providerPaymentRef ?? intent.providerIntentId ?? null,
            });
        } else if (intent.status !== "SUCCEEDED") {
            // A second payment on a paid order — an edit's difference —
            // settles the supplementary invoice that edit wrote.
            await settleSupplementaryInvoices(tx, orderId);
        }

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
            // A pay link (or a checkout) already open when the order was
            // cancelled can still take the money (plan B, B11). It was
            // received, so it stays on the order as a payment to refund —
            // and is marked as owed back, as the invoice path marks one.
            if (cancelled) {
                await tx.paymentAttempt.create({
                    data: {
                        organizationId: intent.organizationId,
                        paymentIntentId: intent.id,
                        provider: intent.provider,
                        providerRef: event.providerPaymentRef ?? null,
                        status: CAPTURED_NEEDS_REFUND,
                        rawResponse: { orderStatus: "CANCELLED" },
                    },
                });
                this.logger.warn(
                    `Payment captured for order ${orderId} after it was cancelled; recorded as needing a refund`,
                );
            }
        }
        return { applied };
    }

    /**
     * Money arrived on an edit's difference charge that a later edit
     * superseded (#508, U8). There is no provider cancel, so a customer
     * still on its checkout could pay it. It is not the order's money: the
     * intent stays SUPERSEDED — every paid sum counts SUCCEEDED intents
     * only — the order's payment status is left alone, and the capture is
     * recorded as needing a refund, as an invoice paid twice is. Order
     * Detail shows it as owed back until a refund for it is on record.
     * It was received, though, so it is invoiced: a supplementary invoice,
     * PAID by this payment, that the refund's credit note later offsets.
     *
     * A second event for the same payment (Razorpay sends `payment.captured`
     * and `order.paid`) finds that record and changes nothing.
     */
    private async applySupersededSuccess(
        tx: Tx,
        intent: IntentRow,
        orderId: string,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        const recorded = await tx.paymentAttempt.findFirst({
            where: {
                paymentIntentId: intent.id,
                status: CAPTURED_NEEDS_REFUND,
            },
            select: { id: true },
        });
        if (recorded) return { applied: false };
        await tx.paymentAttempt.create({
            data: {
                organizationId: intent.organizationId,
                paymentIntentId: intent.id,
                provider: intent.provider,
                providerRef: event.providerPaymentRef ?? null,
                status: CAPTURED_NEEDS_REFUND,
                rawResponse: { intentStatus: SUPERSEDED_INTENT },
            },
        });
        // Money in has an invoice, money out a credit note: the payment is
        // invoiced now, and its refund's credit note offsets it.
        await invoiceSupersededPayment(tx, {
            orderId,
            paymentIntentId: intent.id,
        });
        this.logger.warn(
            `Payment captured on superseded charge ${intent.id} of order ${orderId}; recorded as needing a refund`,
        );
        return { applied: true };
    }

    private async applyFailure(
        tx: Tx,
        intent: IntentRow,
        orderId: string,
    ): Promise<{ applied: boolean }> {
        let { applied } = await this.applyIntentFailure(tx, intent);
        // Move Order UNPAID→FAILED only. A stray failure after a capture (PAID)
        // is IGNORED rather than forced through an illegal transition.
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { paymentStatus: true, placedOnline: true },
        });
        // A checkout's failed attempt (G13) leaves its order UNPAID: until it
        // is paid it is an abandoned checkout, which Orders leaves out (B1),
        // and the customer may try again on the same order.
        if (order?.paymentStatus === "UNPAID" && !order.placedOnline) {
            const changed = await this.moveOrderPayment(tx, orderId, "FAILED");
            applied = applied || changed;
        }
        return { applied };
    }

    /**
     * A failed attempt moves the intent only. An invoice stays as it was —
     * the customer can try again from the same link.
     */
    private async applyIntentFailure(
        tx: Tx,
        intent: IntentRow,
    ): Promise<{ applied: boolean }> {
        // Only an open intent can fail. The condition is in the UPDATE, not
        // on `intent.status` (read without a lock): a success committed in
        // the meantime, or an intent an edit SUPERSEDED, must stay as it is.
        // Overwriting either lost track of money taken (PAY-02).
        const { count } = await tx.paymentIntent.updateMany({
            where: {
                id: intent.id,
                status: { in: [...OPEN_INTENT_STATUSES] },
            },
            data: { status: "FAILED" },
        });
        return { applied: count > 0 };
    }

    private async applyRefund(
        tx: Tx,
        intent: IntentRow,
        orderId: string,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // Lock order (#511): Order → its StockLevel rows → PaymentRefund →
        // intent → Invoice, the order a cancel and a refund request take
        // too. The order id came from the intent, read without a lock; the
        // refund row is locked only after these (matchRefund), so a refund
        // settling and a cancel on one order take turns, never deadlock.
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        await lockOrderShelves(tx, orderId);
        // Guard FIRST: a refund on an order that was never paid (UNPAID→
        // REFUNDED) is illegal and throws before any refund write. PAID and
        // already-REFUNDED orders pass.
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { paymentStatus: true, placedOnline: true },
        });
        if (!order) return { applied: false };
        const current = order.paymentStatus as PaymentStatus;
        // A checkout whose payment was refused (G13): the money came in but
        // the order never became paid, so its refund settles on its own row
        // and the order stays as it is: closed, nothing held or invoiced.
        if (
            order.placedOnline &&
            (current === "UNPAID" || current === "FAILED")
        ) {
            const { applied } = await this.settleRefund(tx, intent, event);
            return { applied };
        }
        if (current !== "REFUNDED" && current !== "PAID") {
            assertPaymentTransition(current, "REFUNDED");
        }
        const { applied, refundId, settledNow } = await this.settleRefund(
            tx,
            intent,
            event,
        );
        const full = await this.fullyRefunded(tx, orderId);
        // Stock follows a refund only in the transaction that moves it into
        // SUCCEEDED (DEC-026): its lines give back what they still hold and
        // put back what was asked. A redelivery finds it settled already.
        if (refundId && settledNow) {
            await settleRefundStock(tx, refundId, {
                orderFullyRefunded: full,
            });
        }
        // The refund's credit note on the order's invoice (ADR-008) — made
        // here when the refund started outside Saroh, or when the refund
        // path could not make it; keyed on the refund, so never twice.
        if (refundId) await creditNoteForRefund(tx, refundId);
        // A refund by line is partial (ADR-008, U6): the order moves to
        // REFUNDED only once every rupee taken has gone back. Until then it
        // stays PAID and reads "partly refunded", derived from the sums.
        const moved =
            current === "PAID" && full
                ? await this.moveOrderPayment(tx, orderId, "REFUNDED")
                : false;
        // Refunded in full: whatever of the invoice no refund credited is
        // credited now, and it reads CREDITED.
        if (moved) await creditRestOfOrder(tx, orderId, "Refunded", null);
        // The last part of a cancel's refund, heard here first: the order
        // is marked cancelled now (B9), under the lock this call holds.
        const cancelled = await finishCancelInTx(tx, orderId, null);
        return { applied: moved || applied || cancelled };
    }

    /**
     * Whether every successful payment on an order has been refunded in
     * full — settled refunds only, so a refund still in flight does not
     * close the order early.
     */
    private async fullyRefunded(tx: Tx, orderId: string): Promise<boolean> {
        const payments = await tx.paymentIntent.findMany({
            where: { orderId, status: "SUCCEEDED" },
            select: {
                amountCents: true,
                refunds: {
                    where: { status: "SUCCEEDED" },
                    select: { amountCents: true },
                },
            },
        });
        const captured = payments.reduce((s, p) => s + p.amountCents, 0);
        const refunded = payments.reduce(
            (s, p) => s + p.refunds.reduce((r, x) => r + x.amountCents, 0),
            0,
        );
        return captured > 0 && refunded >= captured;
    }

    /**
     * A refund of an invoice's payment settled: the refund row, and — for
     * a booking's own invoice, a deposit or price handed back on a cancel
     * in time (E8) — its credit note, now that the provider has confirmed
     * it (DEC-023). Keyed on the refund, so never twice. Other invoices
     * keep their status and no note, as before.
     */
    private async applyInvoiceRefund(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // A treatment's booking invoice names its order (E9, DEC-050): its
        // refund is the order's, so the order is locked first, as every
        // refund of an order takes it.
        const invoice = intent.invoiceId
            ? await tx.invoice.findUnique({
                  where: { id: intent.invoiceId },
                  select: { orderId: true, source: true, kind: true },
              })
            : null;
        const orderId =
            invoice?.source === "BOOKING" && invoice.kind === "INVOICE"
                ? invoice.orderId
                : null;
        if (orderId) {
            await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        }
        const settled = await this.settleRefund(tx, intent, event);
        if (settled.refundId && settled.settledNow) {
            await creditNoteForRefund(tx, settled.refundId);
        }
        // Paid in full online and every rupee of it back: the treatment's
        // order is refunded, and books no more visits. A balance recorded
        // by hand was not handed back here, so that order stays as it is.
        let moved = false;
        if (orderId && (await this.treatmentRefundedInFull(tx, orderId))) {
            moved = await this.moveOrderPayment(tx, orderId, "REFUNDED");
        }
        // A treatment cancelled with its deposit refunded (B9): cancelled
        // once the provider has answered for all of it.
        const cancelled = orderId
            ? await finishCancelInTx(tx, orderId, null)
            : false;
        return { ...settled, applied: settled.applied || moved || cancelled };
    }

    /**
     * Whether a treatment's order took its whole total online (its own
     * payments and its booking invoice's) and has had all of it back —
     * settled refunds only.
     */
    private async treatmentRefundedInFull(
        tx: Tx,
        orderId: string,
    ): Promise<boolean> {
        const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { paymentStatus: true, total: true },
        });
        if (order?.paymentStatus !== "PAID") return false;
        const payments = await tx.paymentIntent.findMany({
            where: { ...orderMoneyIntents(orderId), status: "SUCCEEDED" },
            select: {
                amountCents: true,
                refunds: {
                    where: { status: "SUCCEEDED" },
                    select: { amountCents: true },
                },
            },
        });
        const captured = payments.reduce((s, p) => s + p.amountCents, 0);
        const refunded = payments.reduce(
            (s, p) => s + p.refunds.reduce((r, x) => r + x.amountCents, 0),
            0,
        );
        return (
            captured > 0 &&
            captured >= toMinor(order.total) &&
            refunded >= captured
        );
    }

    /**
     * Settle the PaymentRefund idempotently: PENDING→SUCCEEDED once, or create
     * SUCCEEDED if the refund originated outside our initiate flow (a refund
     * made in the provider's own dashboard). For an invoice this is the whole
     * of a refund: the invoice keeps its PAID or VOID status and the workspace
     * reads the refund from here.
     */
    private async settleRefund(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{
        applied: boolean;
        refundId: string | null;
        /** This call moved the refund into SUCCEEDED (or recorded it so). */
        settledNow: boolean;
    }> {
        if (!event.providerRefundId && !event.refundReference) {
            return { applied: false, refundId: null, settledNow: false };
        }
        const existing = await this.matchRefund(tx, intent, event);
        if (existing) {
            if (existing.status === "SUCCEEDED") {
                return {
                    applied: false,
                    refundId: existing.id,
                    settledNow: false,
                };
            }
            if (existing.status === "FAILED") {
                // Saroh freed this money; the provider says it went back.
                // The provider's word is the ledger's.
                this.logger.warn(
                    `Refund ${existing.id} was FAILED but ${intent.provider} reports it refunded; settling it`,
                );
            }
            if (
                event.refundAmountCents !== undefined &&
                event.refundAmountCents !== existing.amountCents
            ) {
                this.logger.warn(
                    `Refund ${existing.id}: ${intent.provider} refunded ${event.refundAmountCents}, Saroh asked ${existing.amountCents}`,
                );
            }
            await tx.paymentRefund.update({
                where: { id: existing.id },
                data: {
                    status: "SUCCEEDED",
                    providerRefundId:
                        existing.providerRefundId ??
                        event.providerRefundId ??
                        null,
                },
            });
            // The refund path writes the REFUND step when it attaches the
            // provider's id; here the webhook got there first (the call's
            // answer was lost, or is still on its way), so the step is
            // written here, once — the refund path's attach now finds the
            // id set and writes none (DEC-026).
            if (!existing.providerRefundId && existing.paymentIntent.orderId) {
                await tx.orderEvent.create({
                    data: {
                        organizationId: intent.organizationId,
                        orderId: existing.paymentIntent.orderId,
                        kind: "REFUND",
                        actorUserId: null,
                        note: existing.reason,
                        amountCents: existing.amountCents,
                    },
                });
            }
            return { applied: true, refundId: existing.id, settledNow: true };
        }
        // Made outside Saroh (the provider's dashboard): recorded at what the
        // provider refunded. Only an event with no amount falls back to the
        // whole payment — and says so.
        if (!event.providerRefundId) {
            return { applied: false, refundId: null, settledNow: false };
        }
        let amountCents = event.refundAmountCents;
        if (amountCents === undefined) {
            this.logger.warn(
                `Refund ${event.providerRefundId} came with no amount; recorded at the payment's ${intent.amountCents}`,
            );
            amountCents = intent.amountCents;
        }
        const created = await tx.paymentRefund.create({
            data: {
                organizationId: intent.organizationId,
                paymentIntentId: intent.id,
                amountCents,
                currency: intent.currency,
                status: "SUCCEEDED",
                providerRefundId: event.providerRefundId,
            },
        });
        return { applied: true, refundId: created.id, settledNow: true };
    }

    /**
     * The provider definitely made no refund (Razorpay `refund.failed`,
     * Cashfree CANCELLED): Saroh's PENDING row goes FAILED, so its money and
     * lines can be refunded again. No credit note, and the order's payment
     * status is left as it is. A row already settled, or no row at all, is
     * logged and left alone.
     */
    private async failProviderRefund(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        const existing = await this.matchRefund(tx, intent, event);
        if (existing?.status !== "PENDING") {
            this.logger.warn(
                `${intent.provider} reports refund ${event.providerRefundId ?? event.refundReference ?? "?"} failed; ${
                    existing
                        ? `refund ${existing.id} is ${existing.status}, left as it is`
                        : "no refund of Saroh's matches it"
                }`,
            );
            return { applied: false };
        }
        await tx.paymentRefund.update({
            where: { id: existing.id },
            data: {
                status: "FAILED",
                providerRefundId:
                    existing.providerRefundId ?? event.providerRefundId ?? null,
            },
        });
        return { applied: true };
    }

    /**
     * The refund row a refund event is about, under its row lock: by the
     * provider's refund id, else by Saroh's own reference (DEC-026) on the
     * same order or invoice — a row whose provider id was never stored, the
     * call timed out, or its answer is still on the way. Never by amount: a
     * dashboard refund of the same amount must not settle Saroh's row.
     *
     * The reference is matched on the intent's order (or invoice), not the
     * intent alone: Cashfree names the refund by the merchant order id,
     * which resolves to the order's latest intent.
     *
     * The lock serialises this with the refund path attaching the provider's
     * id, so exactly one of them sees the id unset — and writes the REFUND
     * step.
     */
    private async matchRefund(
        tx: Tx,
        intent: IntentRow,
        event: NormalizedWebhookEvent,
    ) {
        let id: string | null = null;
        if (event.providerRefundId) {
            const byProvider = await tx.paymentRefund.findFirst({
                where: {
                    organizationId: intent.organizationId,
                    providerRefundId: event.providerRefundId,
                },
                select: { id: true },
            });
            id = byProvider?.id ?? null;
        }
        const parent = intent.orderId
            ? { orderId: intent.orderId }
            : intent.invoiceId
              ? { invoiceId: intent.invoiceId }
              : null;
        if (!id && event.refundReference && parent) {
            const byReference = await tx.paymentRefund.findFirst({
                where: {
                    id: event.refundReference,
                    organizationId: intent.organizationId,
                    paymentIntent: parent,
                },
                select: { id: true, providerRefundId: true },
            });
            // A row already carrying another provider refund is not this one.
            if (
                byReference &&
                (!byReference.providerRefundId ||
                    !event.providerRefundId ||
                    byReference.providerRefundId === event.providerRefundId)
            ) {
                id = byReference.id;
            }
        }
        if (!id) return null;
        await tx.$queryRaw`SELECT id FROM "PaymentRefund" WHERE id = ${id} FOR UPDATE`;
        return tx.paymentRefund.findUniqueOrThrow({
            where: { id },
            select: {
                id: true,
                status: true,
                amountCents: true,
                reason: true,
                providerRefundId: true,
                paymentIntent: { select: { orderId: true } },
            },
        });
    }

    /**
     * Money arrived for an invoice's pay link (U13).
     *
     * Under the invoice's row lock — so a hand-recorded payment or a void
     * racing this webhook is seen, not overwritten — an ISSUED invoice
     * becomes PAID, recorded as paid online through the provider. An invoice
     * that is already PAID (cash at the counter, a second tab) or VOID is
     * left exactly as it is: the intent still SUCCEEDED, because the money
     * was taken, and the capture is recorded as needing a refund, which the
     * workspace surfaces on Home and on the invoice.
     *
     * An intent already SUCCEEDED means this payment was settled by an
     * earlier event (Razorpay sends `payment.captured` and `order.paid` for
     * one payment), so it is a no-op — never a second "needs a refund".
     *
     * A pay-now hold's invoice (U19) arrives here as a DRAFT: the payment
     * confirms its booking and numbers the invoice (`booking-hold.ts`).
     */
    private async applyInvoiceSuccess(
        tx: Tx,
        unlocked: IntentRow,
        invoiceId: string,
        event: NormalizedWebhookEvent,
    ): Promise<{ applied: boolean }> {
        // The intent's status under its row lock, taken before the Invoice's
        // (intent → Invoice, the lock order). `unlocked` was read without
        // a lock: two events for one payment (payment.captured and order.paid)
        // could both see it unpaid, and the second then recorded a good
        // payment as "needs a refund" (PAY-01).
        const intent = {
            ...unlocked,
            status: await lockIntent(tx, unlocked),
        };
        if (intent.status === "SUCCEEDED") return { applied: false };

        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} AND "organizationId" = ${intent.organizationId} FOR UPDATE`;
        const invoice = await tx.invoice.findFirst({
            where: { id: invoiceId, organizationId: intent.organizationId },
            select: { status: true, source: true, bookingId: true },
        });

        await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { status: "SUCCEEDED" },
        });

        const providerRef = event.providerPaymentRef ?? null;
        const payment = {
            paymentMethod: ONLINE_PAYMENT_METHOD,
            paymentReference: providerRef ?? intent.providerIntentId ?? null,
            paymentNote: `Paid online through ${
                PROVIDER_LABEL[intent.provider] ?? intent.provider
            }`,
        };
        // A pay-now hold's draft (U19): the booking is confirmed and the
        // invoice numbered and paid — unless its place went to someone else
        // after the hold ran out, and then the money is owed back, below.
        const held =
            invoice?.status === "DRAFT" && invoice.source === "BOOKING"
                ? await confirmHoldInTx(tx, {
                      invoiceId,
                      organizationId: intent.organizationId,
                      now: new Date(),
                      payment,
                  })
                : null;
        // A pack bought online (A11): the purchase is made from the draft's
        // snapshot and the invoice numbered and paid — unless the draft was
        // discarded or its buyer removed meanwhile, and then the money is
        // owed back, below.
        const bought =
            invoice?.status === "DRAFT" && invoice.source === "PACK"
                ? await completePackDraftInTx(tx, {
                      invoiceId,
                      organizationId: intent.organizationId,
                      now: new Date(),
                      payment,
                  })
                : null;
        // A plan joined online (G20): the subscription is started from the
        // draft's snapshot and the invoice numbered and paid — unless the
        // draft was discarded, or its member removed or put on the plan by
        // the desk meanwhile, and then the money is owed back, below.
        const joined =
            invoice?.status === "DRAFT" && invoice.source === "SUBSCRIPTION"
                ? await completePlanJoinInTx(tx, {
                      invoiceId,
                      organizationId: intent.organizationId,
                      now: new Date(),
                      payment,
                  })
                : null;
        // A booking's pay link (E4) paid after the booking was cancelled:
        // cancelling retires the link, but a checkout already open can still
        // take the money. The place is gone, so it is owed back, not a
        // clean payment — the invoice stays issued for the business to void.
        // The booking's lock after the invoice's (the webhook's order), so a
        // cancel racing this is seen.
        const cancelledBooking =
            invoice?.status === "ISSUED" &&
            invoice.source === "BOOKING" &&
            invoice.bookingId
                ? await isBookingCancelledInTx(tx, invoice.bookingId)
                : false;
        if (
            (invoice?.status === "ISSUED" && !cancelledBooking) ||
            held === "confirmed" ||
            bought === "bought" ||
            joined === "joined"
        ) {
            if (invoice?.status === "ISSUED") {
                await tx.invoice.update({
                    where: { id: invoiceId },
                    data: { status: "PAID", paidAt: new Date(), ...payment },
                });
                // A booking's pay link (E4): the booking reads as paid
                // online. The invoice's lock is held, then the booking's.
                if (invoice.source === "BOOKING" && invoice.bookingId) {
                    await markBookingPaidInTx(tx, invoice.bookingId);
                }
            }
            if (providerRef) {
                await tx.paymentAttempt.create({
                    data: {
                        organizationId: intent.organizationId,
                        paymentIntentId: intent.id,
                        provider: intent.provider,
                        providerRef,
                        status: "CAPTURED",
                    },
                });
            }
            return { applied: true };
        }

        const found =
            held === "released"
                ? "RELEASED_HOLD"
                : bought === "gone"
                  ? "PACK_NOT_BOUGHT"
                  : joined === "gone"
                    ? "PLAN_NOT_JOINED"
                    : cancelledBooking
                      ? "CANCELLED_BOOKING"
                      : (invoice?.status ?? "MISSING");
        await tx.paymentAttempt.create({
            data: {
                organizationId: intent.organizationId,
                paymentIntentId: intent.id,
                provider: intent.provider,
                providerRef,
                status: CAPTURED_NEEDS_REFUND,
                rawResponse: { invoiceStatus: found },
            },
        });
        this.logger.warn(
            `Payment captured for invoice ${invoiceId} while it was ${found}; recorded as needing a refund`,
        );
        return { applied: true };
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
            data: {
                paymentStatus: target,
                // Paid or refunded: its pay link has nothing left to take
                // (plan B, B11).
                ...(target === "PAID" || target === "REFUNDED"
                    ? RETIRED_PAY_LINK
                    : {}),
            },
        });
        return true;
    }
}

/**
 * Take the intent's row lock and read its status afresh. NO KEY UPDATE: it
 * waits on an edit superseding the row, not on a refund row being inserted
 * against it (a foreign key's KEY SHARE) under the order's lock. Falls back
 * to the status already read when the row is gone.
 */
async function lockIntent(tx: Tx, intent: IntentRow): Promise<string> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "PaymentIntent" WHERE id = ${intent.id} FOR NO KEY UPDATE`;
    return rows[0]?.status ?? intent.status;
}

/**
 * Keep the fee the provider reported on a captured payment (plan 005 E19,
 * default 47), once. Whatever the payment settled — an order, an invoice,
 * or money owed back — the provider kept its fee, so it is recorded on every
 * success that reports one. The first report stands: Razorpay sends
 * `payment.captured` and `order.paid` for one payment, and a replay repeats
 * both. No reported fee writes nothing — never an estimate.
 */
async function recordFee(
    tx: Tx,
    intent: IntentRow,
    event: NormalizedWebhookEvent,
): Promise<boolean> {
    if (event.outcome !== "SUCCEEDED" || event.feeCents === undefined) {
        return false;
    }
    const { count } = await tx.paymentIntent.updateMany({
        where: { id: intent.id, feeCents: null },
        data: { feeCents: event.feeCents },
    });
    return count > 0;
}

/**
 * Whether the booking is cancelled, read under its row lock (taken after the
 * invoice's, the order `lockBookingInTx` and the cancel path use).
 */
async function isBookingCancelledInTx(
    tx: Tx,
    bookingId: string,
): Promise<boolean> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
    return rows[0]?.status === "CANCELLED";
}

/**
 * Whether the order is cancelled, read under its row lock — the lock the
 * paid move takes next anyway, so a cancel racing this is seen (B11).
 */
async function isOrderCancelledInTx(tx: Tx, orderId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    return rows[0]?.status === "CANCELLED";
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
