import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { recordOrderRefundedInTx } from "../analytics/order-events";
import { treatmentBegunInTx } from "../bookings/treatment-cancel";
import { creditRestOfOrder } from "../invoices/order-invoicing";
import { authorize } from "../organizations/organization-policy";
import { PaymentsService } from "../payments/payments.service";
import { enqueueRefundSendInTx } from "../payments/send-refund.handler";
import { handPaidCents } from "./hand-payments";
import {
    cancelRefundKey,
    cancelRefusal,
    completeCancelInTx,
    onlineRefundableInTx,
} from "./order-cancel";
import type { CancelOrderDto } from "./order-change.dto";
import { cancelNote, tellOrderCustomer } from "./order-customer-note";
import { assertPaymentTransition } from "./order-state";

/** What "Cancel order…" did. */
export interface CancelOutcome {
    id: string;
    /** The order is cancelled now. */
    cancelled: boolean;
    /**
     * What went back online: the whole of what was left. Null when nothing
     * was paid online (unpaid, or paid by hand).
     */
    refund: {
        amountCents: number;
        currency: string;
        /** The provider hasn't answered for part of it: the cancel waits. */
        beingConfirmed: boolean;
        /** Part of it was refused: that part is still the customer's. */
        partlyRefused: boolean;
    } | null;
    /** Paid by hand: the counter gives it back (the order reads refunded). */
    byHand: { amountCents: number; currency: string } | null;
    /** A note went into the customer's message thread. */
    told: boolean;
}

type Tx = Prisma.TransactionClient;

/**
 * "Cancel order…" on Order Detail (round-2 B9, R7): a refund in full, and
 * the order kept as cancelled. `order:refund` (B16, matrix §2): a cancel is
 * a refund in full, so it is one power whether or not anything was paid.
 * Refused from its handover on — "Refund it instead".
 *
 * - Nothing paid (or the payment failed): cancelled at once, its promised
 *   stock back on the shelf.
 * - Paid by hand: cancelled at once and marked refunded, what is left of
 *   its invoice credited; the counter hands the money back.
 * - Paid online: everything still refundable goes back through the one
 *   refund path (`PaymentsService.refundOrderForCancel`, DEC-026) and the
 *   order is cancelled once the provider has answered for all of it. A
 *   lost answer keeps the order open with the money held; the send job
 *   keeps asking (`payments.send-refund`), and whichever path hears last
 *   finishes the cancel (`order-cancel.ts`). A refusal leaves the order as
 *   it was.
 *
 * A treatment's visits still to come are cancelled with it (E9).
 */
@Injectable()
export class OrderCancelService {
    private readonly logger = new Logger(OrderCancelService.name);

    constructor(@Optional() private readonly payments?: PaymentsService) {}

    async cancel(
        ctx: OrganizationContext,
        orderId: string,
        dto: CancelOrderDto,
    ): Promise<CancelOutcome> {
        authorize(ctx, "order:refund");
        const reason = dto.reason?.trim() ? dto.reason.trim() : null;

        const first = await prisma.$transaction(async (tx) => {
            const order = await lockForCancel(tx, ctx, orderId);
            refuseCancel(order, await treatmentBegunInTx(tx, order.id));
            const { leftCents, unanswered } = await onlineRefundableInTx(
                tx,
                order.id,
            );
            if (leftCents > 0) return { kind: "refund" as const, order };
            if (unanswered > 0) {
                throw new ConflictException({
                    message:
                        "A refund on this order is still being confirmed. Cancel it once that settles.",
                    field: "status",
                });
            }
            // Nothing to hand back online: cancelled now.
            let byHand: CancelOutcome["byHand"] = null;
            if (order.paymentStatus === "PAID") {
                assertPaymentTransition("PAID", "REFUNDED");
                await tx.order.update({
                    where: { id: order.id },
                    data: { paymentStatus: "REFUNDED" },
                });
                await creditRestOfOrder(tx, order.id, "Cancelled", ctx.userId);
                // Off Insights' orders figure again (#867).
                await recordOrderRefundedInTx(tx, order.id);
                // What was taken at the counter goes back from the till:
                // the amount recorded, which an unpaid edit's difference
                // never joined (`hand-payments.ts`).
                byHand = {
                    amountCents: handPaidCents({
                        ...order,
                        paymentIntents: [],
                    }),
                    currency: order.currency,
                };
            }
            await completeCancelInTx(tx, {
                orderId: order.id,
                actorUserId: ctx.userId,
                reason,
                releaseStock: true,
            });
            return { kind: "done" as const, order, byHand };
        });

        if (first.kind === "done") {
            return {
                id: first.order.id,
                cancelled: true,
                refund: null,
                byHand: first.byHand,
                told: dto.tell
                    ? await this.tell(
                          ctx,
                          first.order,
                          cancelNote(first.order.orderId),
                      )
                    : false,
            };
        }

        if (!this.payments) {
            throw new ServiceUnavailableException(
                "Refunds aren't available right now. Nothing was cancelled.",
            );
        }
        const refund = await this.payments.refundOrderForCancel(ctx, orderId, {
            reason,
            idempotencyKey: cancelRefundKey(orderId, dto.idempotencyKey),
            // Read again under the refund's own order lock: a handover or
            // another cancel since the first read is refused here.
            guard: async (tx) => {
                const order = await lockForCancel(tx, ctx, orderId);
                refuseCancel(order, await treatmentBegunInTx(tx, order.id));
            },
        });

        // Parts the provider hasn't answered for: the send job keeps asking
        // (it looks before it sends, DEC-026), and finishes the cancel when
        // the provider has them.
        const unanswered = refund.refunds.filter((r) => r.beingConfirmed);
        if (unanswered.length > 0) {
            await prisma.$transaction(async (tx) => {
                for (const r of unanswered) {
                    await enqueueRefundSendInTx(tx, ctx.organizationId, r.id);
                }
            });
        }
        const now = await prisma.order.findUnique({
            where: { id: orderId },
            select: { status: true },
        });
        const cancelled = now?.status === "CANCELLED";
        return {
            id: orderId,
            cancelled,
            refund: {
                amountCents: refund.refunds
                    .filter((r) => r.status !== "FAILED")
                    .reduce((s, r) => s + r.amountCents, 0),
                currency: refund.currency,
                beingConfirmed: unanswered.length > 0,
                partlyRefused: refund.refunds.some(
                    (r) => r.status === "FAILED",
                ),
            },
            byHand: null,
            // Said only once it is so: a cancel still waiting on its refund
            // tells them nothing yet.
            told:
                dto.tell && cancelled
                    ? await this.tell(
                          ctx,
                          first.order,
                          cancelNote(first.order.orderId, {
                              amountCents: refund.amountCents,
                              currency: refund.currency,
                          }),
                      )
                    : false,
        };
    }

    /** The note in the customer's thread; never fails the cancel. */
    private tell(
        ctx: OrganizationContext,
        order: { customerId: string | null },
        body: string,
    ): Promise<boolean> {
        return tellOrderCustomer(
            {
                organizationId: ctx.organizationId,
                actorUserId: ctx.userId,
                customerId: order.customerId,
                body,
                event: "ORDER_CANCELLED",
            },
            this.logger,
        );
    }
}

/** The order under its row lock, with what a cancel reads. */
async function lockForCancel(
    tx: Tx,
    ctx: OrganizationContext,
    orderId: string,
) {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} AND "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: ctx.organizationId },
        select: {
            id: true,
            orderId: true,
            status: true,
            paymentStatus: true,
            stage: true,
            fulfilment: true,
            total: true,
            paidByHand: true,
            currency: true,
            customerId: true,
        },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
}

function refuseCancel(
    order: {
        status: string;
        paymentStatus: string;
        stage: string;
        fulfilment: string;
    },
    treatmentBegun: boolean,
): void {
    const refusal = cancelRefusal({ ...order, treatmentBegun });
    if (refusal) {
        throw new ConflictException({ message: refusal, field: "status" });
    }
}
