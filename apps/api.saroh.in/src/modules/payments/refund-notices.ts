import type { Prisma } from "@saroh/database";

import { noticeOn } from "../communications/notice-settings";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import {
    enqueueCustomerNotice,
    refundNoticeKey,
} from "../site-accounts/customer-notify-queue";

/**
 * Who hears of an online refund (DEC-174 U12, #1143). Plain functions on
 * the caller's transaction (the outbox, DEC-008), written with the change
 * to the refund row that they are about:
 *
 * - The customer, once the provider takes it: `customer.notify`
 *   `REFUND_SENT`, keyed `refund:<id>`, so the call's answer, a look-up of
 *   a lost one and the refund webhook all tell it once. Only while the
 *   business's REFUND switch is on (read here, and again when it runs).
 * - The team, when no money went back: `team.alert` `refund`, "refused"
 *   when the provider said no to Saroh's call, "failed" when it took the
 *   refund and the refund later failed. Queued only by the write that moved
 *   the row to FAILED, so a redelivered webhook tells nobody twice; keyed
 *   `team:refund:<change>:<id>` when it runs.
 *
 * Neither is queued for a refund recorded by hand (no `PaymentRefund`), a
 * refund made in the provider's own dashboard, or the ₹1 autopay check's
 * (no order or invoice: no sale to tell).
 */

type Tx = Pick<
    Prisma.TransactionClient,
    "job" | "paymentRefund" | "customerNoticeSetting"
>;

/** Whether the refund is of a sale: an order's or an invoice's payment. */
async function refundOfSale(
    tx: Pick<Prisma.TransactionClient, "paymentRefund">,
    organizationId: string,
    refundId: string,
): Promise<boolean> {
    const row = await tx.paymentRefund.findFirst({
        where: { id: refundId, organizationId },
        select: {
            paymentIntent: {
                select: { purpose: true, orderId: true, invoiceId: true },
            },
        },
    });
    const intent = row?.paymentIntent;
    if (intent?.purpose !== null) return false;
    return Boolean(intent.orderId ?? intent.invoiceId);
}

/**
 * The provider took an online refund Saroh made: tell the customer it is
 * on its way. Returns whether a notice was queued.
 */
export async function enqueueRefundSentNotice(
    tx: Tx,
    organizationId: string,
    refundId: string,
): Promise<boolean> {
    if (!(await noticeOn(tx, organizationId, "REFUND"))) return false;
    if (!(await refundOfSale(tx, organizationId, refundId))) return false;
    await enqueueCustomerNotice(tx, organizationId, {
        kind: "REFUND_SENT",
        eventKey: refundNoticeKey(refundId),
        refundId,
    });
    return true;
}

/**
 * No money went back on a refund: tell the team, on the Payment failed
 * row. Call it only from the write that moved the row to FAILED.
 * `actorUserId` is whoever asked for it and saw the refusal on screen; the
 * rest of the team is told. Returns whether an alert was queued.
 */
export async function enqueueRefundAlert(
    tx: Tx,
    organizationId: string,
    refundId: string,
    change: "failed" | "refused",
    actorUserId: string | null = null,
): Promise<boolean> {
    if (!(await refundOfSale(tx, organizationId, refundId))) return false;
    await enqueueTeamAlert(tx, organizationId, {
        event: "refund",
        refundId,
        change,
        ...(actorUserId ? { actorUserId } : {}),
    });
    return true;
}
