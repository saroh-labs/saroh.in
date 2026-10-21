import { businessName, defineNotice, firstWord, safeLink } from "./notice";
import type { OrderDeliveryKind } from "./order";
import { orderContactId } from "./order";

/**
 * Delivery updates (DEC-174 U16, #1147), behind the business's one
 * ORDER_DELIVERY switch (A17), on by default:
 *
 * - `ORDER_DELIVERED`: a local delivery or a shipment moved to Delivered.
 * - `ORDER_SENT`: a digital order marked Sent.
 * - `ORDER_TRACKING`: the courier's tracking added or changed after the
 *   handover (`saveCourier`), told once per change.
 *
 * Delivered and Sent are steps with an Undo, so they are held ten seconds
 * (`enqueueOrderStepNotice`) and read again here: a step undone, or an
 * order cancelled since, tells nobody. Collected tells nobody at all, and a
 * treatment's Delivered comes from its visits, never a step.
 */

export interface OrderDeliveryVars {
    business: string;
    firstName: string | null;
    /** The order's number as the business shows it ("ORD-1019"). */
    number: string;
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
}

export interface OrderDeliveryNotice {
    kind: OrderDeliveryKind;
    delivery: OrderDeliveryVars;
}

/** The step each kind is about, and the ways of leaving it fits. */
const STEP_OF: Record<
    Exclude<OrderDeliveryKind, "ORDER_TRACKING">,
    { stage: "DELIVERED" | "SENT"; fulfilment: readonly string[] }
> = {
    // A pick-up is Collected, never Delivered; a treatment never gets here.
    ORDER_DELIVERED: {
        stage: "DELIVERED",
        fulfilment: ["LOCAL_DELIVERY", "SHIPPING"],
    },
    ORDER_SENT: { stage: "SENT", fulfilment: ["DIGITAL"] },
};

/** Stages an order with a courier's tracking still travels at. */
const ON_ITS_WAY = ["HANDED_TO_COURIER", "OUT_FOR_DELIVERY"];

function isDeliveryKind(kind: string): kind is OrderDeliveryKind {
    return (
        kind === "ORDER_DELIVERED" ||
        kind === "ORDER_SENT" ||
        kind === "ORDER_TRACKING"
    );
}

export const orderDeliveryNotice = defineNotice<OrderDeliveryNotice>({
    setting: "ORDER_DELIVERY",
    load: async (tx, organizationId, payload) => {
        const kind = payload.kind;
        if (!isDeliveryKind(kind)) return null;
        if (!payload.orderId || !payload.orderEventId) return null;
        const [order, event] = await Promise.all([
            tx.order.findFirst({
                where: { id: payload.orderId, organizationId },
                select: {
                    id: true,
                    orderId: true,
                    status: true,
                    stage: true,
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
                select: { kind: true, toStage: true, undoneAt: true },
            }),
        ]);
        if (!order || !event || event.undoneAt) return null;
        if (order.status === "CANCELLED") return null;
        if (kind === "ORDER_TRACKING") {
            // Still on its way, and something to track it by.
            if (event.kind !== "EDIT") return null;
            if (!ON_ITS_WAY.includes(order.stage)) return null;
            if (!order.trackingNumber && !safeLink(order.trackingUrl)) {
                return null;
            }
        } else {
            const step = STEP_OF[kind];
            if (event.kind !== "STAGE" || event.toStage !== step.stage) {
                return null;
            }
            // Undone and done again is a new step with its own notice.
            if (order.stage !== step.stage) return null;
            if (!step.fulfilment.includes(order.fulfilment)) return null;
        }
        const contactId = await orderContactId(tx, organizationId, order);
        if (!contactId) return null;
        return {
            contactId,
            orderId: order.id,
            vars: {
                kind,
                delivery: {
                    business: await businessName(tx, organizationId),
                    firstName: firstWord(order.customer?.firstName ?? null),
                    number: order.orderId,
                    courier: order.courierName,
                    trackingNumber: order.trackingNumber,
                    trackingUrl: order.trackingUrl,
                },
            },
        };
    },
    sentence: ({ kind, delivery: d }) => {
        if (kind === "ORDER_DELIVERED") {
            return `Your order ${d.number} has been delivered.`;
        }
        if (kind === "ORDER_SENT") {
            return `Your order ${d.number} has been sent. If you can't find the download or access details, ${d.business} can help.`;
        }
        const courier = d.courier ? ` with ${d.courier}` : "";
        const number = d.trackingNumber
            ? ` Tracking number: ${d.trackingNumber}.`
            : "";
        return `You can track your order ${d.number}${courier} now.${number}`;
    },
    subject: ({ kind, delivery: d }) => {
        if (kind === "ORDER_DELIVERED") {
            return `Your order ${d.number} from ${d.business} has been delivered`;
        }
        if (kind === "ORDER_SENT") {
            return `Your order ${d.number} from ${d.business} has been sent`;
        }
        return `Track your order ${d.number} from ${d.business}`;
    },
    names: ({ delivery }) => ({
        business: delivery.business,
        firstName: delivery.firstName,
    }),
    links: ({ kind, delivery }) =>
        kind === "ORDER_TRACKING"
            ? [
                  {
                      lead: "Track your parcel:",
                      url: safeLink(delivery.trackingUrl),
                  },
              ]
            : [],
});
