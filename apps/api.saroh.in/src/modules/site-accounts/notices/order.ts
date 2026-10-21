import type { Prisma } from "@saroh/database";

import { noticeOn } from "../../communications/notice-settings";
import { holdsOnPayment } from "../../orders/online-checkout";
import type { NoticeReach } from "../notice-reach";
import { contactReach } from "../notice-reach";
import { businessName, defineNotice, firstWord, safeLink } from "./notice";

/**
 * A website order placed (UX-042), and an order's steps the customer is
 * told about: Ready, handed to the courier, out for delivery (round-2 A14).
 */

type Tx = Prisma.TransactionClient;

/** The order steps a customer is told about. */
export type NoticeStage = "READY" | "HANDED_TO_COURIER" | "OUT_FOR_DELIVERY";

export type OrderStepKind = "ORDER_READY" | "ORDER_HANDED_OVER";

/**
 * The delivery updates (DEC-174 U16, #1147): a delivered order, a digital
 * order sent, tracking added after the handover. Behind the business's
 * ORDER_DELIVERY switch; their words are `order-delivery.ts`.
 */
export type OrderDeliveryKind =
    "ORDER_DELIVERED" | "ORDER_SENT" | "ORDER_TRACKING";

export interface OrderNoticeVars {
    business: string;
    firstName: string | null;
    /** The order's number as the business shows it ("ORD-1019"). */
    number: string;
    stage: NoticeStage;
    /** Collected by the customer: Ready means "ready for pick-up". */
    pickup: boolean;
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
}

/** A website order the customer just placed (UX-042). */
export interface PlacedOrderVars {
    business: string;
    firstName: string | null;
    number: string;
    /** How it reaches them (`OrderFulfilment`): collected, delivered, … */
    fulfilment: string;
    /** Paid when it is handed over, not online. */
    payOnHandover: boolean;
    /**
     * The order's own page on the business's site (`notice-link.ts`); null
     * or absent: the email has no link.
     */
    link?: string | null;
    /**
     * How its next updates reach them (U16, #1147), as `contactNotice`
     * reads it when the notice goes: `EMAIL`, emailed (and maybe in their
     * account too); `ACCOUNT`, only in their account on the site; `NONE`,
     * nothing reaches them, so nothing is promised and the business will be
     * in touch. Absent (a notice queued before U16): "We'll tell you".
     */
    updates?: "EMAIL" | "ACCOUNT" | "NONE";
    /** The business sends delivery updates (ORDER_DELIVERY on). */
    deliveryUpdates?: boolean;
}

export interface OrderStepNotice {
    kind: OrderStepKind;
    order: OrderNoticeVars;
}

export interface PlacedOrderNotice {
    kind: "ORDER_PLACED";
    placed: PlacedOrderVars;
}

export { orderNoticeKind, orderNoticeSetting } from "./order-steps";

export const orderStepNotice = defineNotice<OrderStepNotice>({
    setting: null,
    load: async (tx, organizationId, payload) => {
        const kind = payload.kind;
        if (kind !== "ORDER_READY" && kind !== "ORDER_HANDED_OVER") {
            return null;
        }
        if (!payload.orderId || !payload.orderEventId) return null;
        const [order, event] = await Promise.all([
            tx.order.findFirst({
                where: { id: payload.orderId, organizationId },
                select: {
                    id: true,
                    orderId: true,
                    status: true,
                    fulfilment: true,
                    customerId: true,
                    customerAccountId: true,
                    courierName: true,
                    trackingNumber: true,
                    trackingUrl: true,
                    customer: { select: { firstName: true } },
                },
            }),
            tx.orderEvent.findFirst({
                where: { id: payload.orderEventId, orderId: payload.orderId },
                select: { toStage: true, undoneAt: true },
            }),
        ]);
        // Undone before it went (B6), or the order cancelled meanwhile.
        if (!order || !event || event.undoneAt) return null;
        if (order.status === "CANCELLED") return null;
        const stage = event.toStage;
        if (
            stage !== "READY" &&
            stage !== "HANDED_TO_COURIER" &&
            stage !== "OUT_FOR_DELIVERY"
        ) {
            return null;
        }
        const contactId = await orderContactId(tx, organizationId, order);
        if (!contactId) return null;
        return {
            contactId,
            orderId: order.id,
            vars: {
                kind,
                order: {
                    business: await businessName(tx, organizationId),
                    firstName: firstWord(order.customer?.firstName ?? null),
                    number: order.orderId,
                    stage,
                    pickup: order.fulfilment === "PICKUP",
                    courier: order.courierName,
                    trackingNumber: order.trackingNumber,
                    trackingUrl: order.trackingUrl,
                },
            },
        };
    },
    sentence: ({ kind, order: o }) => {
        if (kind === "ORDER_READY") {
            return o.pickup
                ? `Your order ${o.number} is ready for pick-up.`
                : `Your order ${o.number} is packed and ready to go.`;
        }
        if (o.stage === "OUT_FOR_DELIVERY") {
            return `Your order ${o.number} is out for delivery.`;
        }
        const courier = o.courier ? ` with ${o.courier}` : "";
        const tracking = o.trackingNumber
            ? ` Tracking number: ${o.trackingNumber}.`
            : "";
        return `Your order ${o.number} is on its way${courier}.${tracking}`;
    },
    subject: ({ kind, order: o }) => {
        if (kind === "ORDER_READY") {
            return o.pickup
                ? `Your order ${o.number} from ${o.business} is ready for pick-up`
                : `Your order ${o.number} from ${o.business} is ready`;
        }
        return `Your order ${o.number} from ${o.business} is on its way`;
    },
    names: ({ order }) => ({
        business: order.business,
        firstName: order.firstName,
    }),
    // The courier's tracking page, once it is handed to them.
    links: ({ kind, order }) =>
        kind === "ORDER_HANDED_OVER" && order.stage === "HANDED_TO_COURIER"
            ? [{ lead: "Track it here:", url: safeLink(order.trackingUrl) }]
            : [],
});

/**
 * A website order just placed (UX-042), while it still stands: not
 * cancelled, and an online checkout only once it is paid (G13).
 */
export const placedOrderNotice = defineNotice<PlacedOrderNotice>({
    setting: null,
    load: async (tx, organizationId, payload) => {
        if (payload.kind !== "ORDER_PLACED" || !payload.orderId) return null;
        const order = await tx.order.findFirst({
            where: { id: payload.orderId, organizationId },
            select: {
                id: true,
                orderId: true,
                status: true,
                paymentStatus: true,
                placedOnline: true,
                payOnHandover: true,
                fulfilment: true,
                customerId: true,
                customerAccountId: true,
                customer: { select: { firstName: true } },
            },
        });
        if (!order?.placedOnline || order.status === "CANCELLED") return null;
        if (holdsOnPayment(order) && order.paymentStatus !== "PAID") {
            return null;
        }
        const contactId = await orderContactId(tx, organizationId, order);
        if (!contactId) return null;
        // What the email promises is only what will reach them (U16).
        const [reach, deliveryUpdates] = await Promise.all([
            contactReach(tx, organizationId, contactId),
            noticeOn(tx, organizationId, "ORDER_DELIVERY"),
        ]);
        return {
            contactId,
            orderId: order.id,
            vars: {
                kind: "ORDER_PLACED",
                placed: {
                    business: await businessName(tx, organizationId),
                    firstName: firstWord(order.customer?.firstName ?? null),
                    number: order.orderId,
                    fulfilment: order.fulfilment,
                    payOnHandover: order.payOnHandover,
                    updates: updatesOf(reach),
                    deliveryUpdates,
                },
            },
        };
    },
    sentence: ({ placed: p }) => {
        const pickup = p.fulfilment === "PICKUP";
        const delivered =
            p.fulfilment === "LOCAL_DELIVERY" || p.fulfilment === "SHIPPING";
        const next = placedNext(p);
        if (p.payOnHandover) {
            const pay = pickup
                ? "You pay at pick-up."
                : delivered
                  ? "You pay when it's delivered."
                  : "You pay when you get it.";
            return `We have your order ${p.number}. ${pay}${next}`;
        }
        return `We have your order ${p.number}, and it's paid.${next}`;
    },
    subject: ({ placed }) =>
        `Your order ${placed.number} from ${placed.business}`,
    names: ({ placed }) => ({
        business: placed.business,
        firstName: placed.firstName,
    }),
    backLink: ({ placed }) => ({
        lead: "See your order:",
        url: safeLink(placed.link),
    }),
    withLink: (vars, link) => ({ ...vars, placed: { ...vars.placed, link } }),
});

/** A contact's reach, as the placed notice's promise reads it. */
function updatesOf(reach: NoticeReach): PlacedOrderVars["updates"] {
    if (reach === "EMAIL" || reach === "EMAIL_AND_ACCOUNT") return "EMAIL";
    if (reach === "ACCOUNT" || reach === "ON_SIGN_IN") return "ACCOUNT";
    return "NONE";
}

/**
 * What "Order placed" promises next, with its leading space: only the
 * steps they are told about (`orderNoticeKind`), by the way that reaches
 * them (U16, #1147). Emailed: "We'll email you when it's on its way";
 * shown in their account only: "We'll tell you"; nothing reaches them:
 * no promise, "‹Business› will be in touch". Delivered and Sent are
 * promised only while the business sends delivery updates.
 */
export function placedNext(p: PlacedOrderVars): string {
    if (p.updates === "NONE") return ` ${p.business} will be in touch.`;
    const tell = p.updates === "EMAIL" ? "We'll email you" : "We'll tell you";
    const deliveryOn = p.deliveryUpdates === true;
    switch (p.fulfilment) {
        case "PICKUP":
            return ` ${tell} when it's ready for pick-up.`;
        case "LOCAL_DELIVERY":
        case "SHIPPING":
            return deliveryOn
                ? ` ${tell} when it's on its way, and when it's delivered.`
                : ` ${tell} when it's on its way.`;
        case "DIGITAL":
            if (deliveryOn) return ` ${tell} when it's sent.`;
            // Queued before U16: it promised nothing for a digital order.
            return p.updates === undefined
                ? ""
                : ` ${p.business} will be in touch.`;
        default:
            return "";
    }
}

/**
 * The contact an order is told to: the site account that placed it, or
 * else the contact its store customer is linked to (C2's identity links,
 * the oldest first), as the account's Orders tab reads them (A7).
 */
export async function orderContactId(
    tx: Pick<Tx, "customerAccount" | "customerIdentityLink">,
    organizationId: string,
    order: { customerId: string | null; customerAccountId: string | null },
): Promise<string | null> {
    if (order.customerAccountId) {
        const account = await tx.customerAccount.findFirst({
            where: { id: order.customerAccountId, organizationId },
            select: { contactId: true },
        });
        if (account) return account.contactId;
    }
    // A walk-in (B13) has no customer record, so no one to tell.
    if (!order.customerId) return null;
    const link = await tx.customerIdentityLink.findFirst({
        where: { organizationId, customerId: order.customerId },
        orderBy: { createdAt: "asc" },
        select: { contactId: true },
    });
    return link?.contactId ?? null;
}
