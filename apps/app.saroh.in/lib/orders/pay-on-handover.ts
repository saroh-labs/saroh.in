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
