// Which notice an order step is, and its switch: pure, so the queue
// (`customer-notify-queue.ts`) can ask without importing the notice files.

/** The notices an order step can send. */
export type OrderStepNoticeKind =
    "ORDER_READY" | "ORDER_HANDED_OVER" | "ORDER_DELIVERED" | "ORDER_SENT";

/**
 * Which notice an order step is, or null for a step nobody is told:
 * Ready, the handover, Delivered and a digital order's Sent. Collected
 * tells nobody: they were there. A treatment reaches Delivered through its
 * visits, never as a step here (`treatment-fulfil.ts`), so is never told.
 */
export function orderNoticeKind(stage: string): OrderStepNoticeKind | null {
    if (stage === "READY") return "ORDER_READY";
    if (stage === "HANDED_TO_COURIER" || stage === "OUT_FOR_DELIVERY") {
        return "ORDER_HANDED_OVER";
    }
    if (stage === "DELIVERED") return "ORDER_DELIVERED";
    if (stage === "SENT") return "ORDER_SENT";
    return null;
}

/**
 * The business's switch a step's notice sits behind, or null: Ready and
 * the handover have none of their own (A1); the delivery updates share
 * ORDER_DELIVERY (A17).
 */
export function orderNoticeSetting(
    kind: OrderStepNoticeKind | "ORDER_TRACKING",
): "ORDER_DELIVERY" | null {
    return kind === "ORDER_READY" || kind === "ORDER_HANDED_OVER"
        ? null
        : "ORDER_DELIVERY";
}
