import type { OrderRead } from "./read";

/**
 * An order placed on the website to be paid at the handover ("Pay when you
 * collect", "Pay on delivery") and not paid yet: how it is settled, or
 * null for any other order. A cancelled or paid one, or one whose payment
 * through a pay link failed, reads as usual.
 */
export function handoverPayment(
    order: Pick<OrderRead, "status" | "paymentStatus" | "fulfilmentType"> &
        Partial<Pick<OrderRead, "payOnHandover">>,
): "collection" | "delivery" | null {
    if (!order.payOnHandover) return null;
    if (order.status === "CANCELLED" || order.paymentStatus !== "UNPAID") {
        return null;
    }
    return order.fulfilmentType === "PICKUP" ? "collection" : "delivery";
}

/**
 * "Not collected for 4 days" (R34): the pay-on-handover banner's heading
 * once nobody has come for the order in three days, counted by the API in
 * the business's zone, which sends none before then (the banner then
 * reads as usual).
 */
export function uncollectedHeading(
    handover: "collection" | "delivery",
    days: number | null | undefined,
): string | null {
    if (typeof days !== "number" || days <= 0) return null;
    const what = handover === "collection" ? "Not collected" : "Not delivered";
    return `${what} for ${days} days`;
}

/**
 * Whether the order is paid, for someone who moves its steps without the
 * money read (`order:stage` alone, DEC-024; UX-010): the state, never a
 * figure. The counter must know not to hand over an unpaid order; the API
 * refuses Collected or Delivered on one paid at the handover until it is
 * marked paid (`order-stage.ts`), and this says so before anyone tries.
 * Null for a cancelled order.
 */
export function kitchenPayment(
    order: Pick<
        OrderRead,
        "status" | "paymentStatus" | "fulfilmentType" | "refundStanding"
    > &
        Partial<Pick<OrderRead, "payOnHandover">>,
): {
    label: string;
    tone: "ready" | "new" | "bad" | "done";
    body: string | null;
} | null {
    if (order.status === "CANCELLED") return null;
    if (order.refundStanding === "REFUNDED") {
        return { label: "Refunded", tone: "done", body: null };
    }
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
        return { label: "Paid", tone: "ready", body: null };
    }
    const handover = handoverPayment(order);
    if (handover) {
        const step = handover === "collection" ? "collected" : "delivered";
        return {
            label: `To pay on ${handover}`,
            tone: "new",
            body: `Not paid yet. It can be marked ${step} once the payment is recorded.`,
        };
    }
    return {
        label: "Not paid yet",
        tone: "bad",
        body: "Don't start it until it's paid.",
    };
}
