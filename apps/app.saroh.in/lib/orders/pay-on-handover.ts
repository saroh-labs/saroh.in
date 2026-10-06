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
