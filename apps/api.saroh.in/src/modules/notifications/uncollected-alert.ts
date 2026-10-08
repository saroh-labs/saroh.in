import type { Prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { payOnHandoverWords } from "../orders/online-checkout";
import {
    awaitsHandover,
    notHandedOverWords,
    uncollectedDays,
    uncollectedFrom,
} from "../orders/uncollected";
import { orderPartyName } from "../orders/walk-in";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";
import { enqueueTeamAlert } from "./team-alerts";

/** The inbox notice an uncollected order writes; on the New order row. */
export const ORDER_UNCOLLECTED_NOTIFICATION_TYPE = "order.uncollected";

type Tx = Prisma.TransactionClient;
type Uncollected = Extract<TeamAlertPayload, { event: "uncollected" }>;

const ORDER_SELECT = {
    id: true,
    orderId: true,
    createdAt: true,
    status: true,
    paymentStatus: true,
    payOnHandover: true,
    fulfilment: true,
    customerId: true,
    walkInName: true,
    customer: { select: { firstName: true, lastName: true, email: true } },
} as const;

/**
 * An order to pay on handover nobody came for (R34), worded for the team;
 * null once it no longer stands — paid, handed over, cancelled, gone — or
 * while it isn't three days old yet in the business's zone. Told on the New
 * order row (`event: "order"`), so whoever hears about new orders hears
 * about this one, and claimed once per order: never repeated, however long
 * it waits. It only tells: nothing here cancels the order.
 */
export async function wordUncollected(
    tx: Tx,
    organizationId: string,
    p: Uncollected,
    now: Date,
): Promise<WordedAlert | null> {
    const order = await tx.order.findFirst({
        where: { id: p.orderId, organizationId },
        select: ORDER_SELECT,
    });
    if (!order) return null;
    const zone = await businessTimezone(tx, organizationId);
    const days = uncollectedDays(order, now, zone);
    if (days === null) return null;
    const pickup = order.fulfilment === "PICKUP";
    return {
        event: "order",
        eventKey: `team:uncollected:${order.id}`,
        notificationId: null,
        type: ORDER_UNCOLLECTED_NOTIFICATION_TYPE,
        title: `${notHandedOverWords(order.fulfilment)}: order ${order.orderId} from ${orderPartyName(order)}`,
        body: `Placed ${days} days ago to ${payOnHandoverWords(order.fulfilment)}, and not paid yet. ${pickup ? "Nobody has collected it" : "It hasn't been delivered"}. Cancel it to put the stock back, or keep waiting. Nothing cancels on its own.`,
        mail: {
            heading: `${notHandedOverWords(order.fulfilment)}: order ${order.orderId}`,
            body: `Placed ${days} days ago to ${payOnHandoverWords(order.fulfilment)}, and not paid yet. ${pickup ? "Nobody has collected it" : "It hasn't been delivered"}. Cancel it to put the stock back, or keep waiting. Nothing cancels on its own.`,
        },
        path: `/commerce/orders/${order.id}`,
        skipUserId: null,
        orderId: order.id,
    };
}

/**
 * Before telling: an order still waiting that isn't due yet — the business
 * moved its zone after the alert was queued — is queued again for when it
 * is, rather than dropped. True when it was put off.
 */
export async function putOffUntilDue(
    tx: Tx,
    organizationId: string,
    p: Uncollected,
    now: Date,
): Promise<boolean> {
    const order = await tx.order.findFirst({
        where: { id: p.orderId, organizationId },
        select: ORDER_SELECT,
    });
    if (!order || !awaitsHandover(order)) return false;
    const zone = await businessTimezone(tx, organizationId);
    const due = uncollectedFrom(order.createdAt, zone);
    if (due.getTime() <= now.getTime()) return false;
    await enqueueTeamAlert(tx, organizationId, p, due);
    return true;
}

/**
 * Queue the alert with the order it is about, for the instant it becomes
 * due (`checkout-order.ts`, on the order's own transaction).
 */
export async function queueUncollectedAlert(
    tx: Tx,
    organizationId: string,
    order: { id: string; createdAt: Date },
): Promise<void> {
    const zone = await businessTimezone(tx, organizationId);
    await enqueueTeamAlert(
        tx,
        organizationId,
        { event: "uncollected", orderId: order.id },
        uncollectedFrom(order.createdAt, zone),
    );
}
