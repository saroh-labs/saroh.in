import type { OrderStatus, PaymentStatus } from "@/lib/orders/service";

/**
 * The order lifecycle as the API enforces it (`order-state.ts`), so the
 * screen only offers moves the server will accept.
 *
 * Both machines run FORWARD ONLY: nothing goes back from shipped to
 * processing, or from paid to unpaid. That is why every move on the order
 * screen asks first — the design's rule is undo by default, and a confirm only
 * where undo is impossible, which is every one of these.
 */
export const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
    PENDING: ["PROCESSING", "CANCELLED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
};

export const PAYMENT_TRANSITIONS: Record<
    PaymentStatus,
    readonly PaymentStatus[]
> = {
    UNPAID: ["PAID", "FAILED"],
    FAILED: ["PAID"],
    PAID: ["REFUNDED"],
    REFUNDED: [],
};

export const STATUS_LABEL: Record<OrderStatus, string> = {
    PENDING: "New",
    PROCESSING: "Being prepared",
    SHIPPED: "Sent",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
    UNPAID: "Not paid",
    PAID: "Paid",
    FAILED: "Payment failed",
    REFUNDED: "Refunded",
};

export type OrderStanding =
    "UNFULFILLED" | "FULFILLED" | "REFUNDED" | "CANCELLED";

/**
 * The one word an order is summed up by — the same precedence the orders list
 * uses (`order-standing.ts`): money first, then cancellation, then the goods.
 */
export function standingOf(
    status: OrderStatus,
    paymentStatus: PaymentStatus,
): OrderStanding {
    if (paymentStatus === "REFUNDED") return "REFUNDED";
    if (status === "CANCELLED") return "CANCELLED";
    return status === "PENDING" || status === "PROCESSING"
        ? "UNFULFILLED"
        : "FULFILLED";
}

export interface Step {
    to: OrderStatus;
    /** The button: what the merchant is doing. */
    label: string;
    /** The confirm's title and body: what it changes, and that it sticks. */
    title: string;
    body: string;
}

/** The next thing to do with an order's goods, or null once there is none. */
export function nextStep(status: OrderStatus): Step | null {
    if (status === "PENDING") {
        return {
            to: "PROCESSING",
            label: "Start preparing",
            title: "Start preparing this order?",
            body: "It moves from New to Being prepared. Orders only move forward, so this cannot be taken back.",
        };
    }
    if (status === "PROCESSING") {
        return {
            to: "SHIPPED",
            label: "Mark sent",
            title: "Mark this order as sent?",
            body: "The stock it reserved is taken off your shelves for good, and it can no longer be cancelled.",
        };
    }
    if (status === "SHIPPED") {
        return {
            to: "DELIVERED",
            label: "Mark delivered",
            title: "Mark this order as delivered?",
            body: "This is the last step. Nothing about its goods can change after it.",
        };
    }
    return null;
}

export function canCancel(status: OrderStatus): boolean {
    return STATUS_TRANSITIONS[status].includes("CANCELLED");
}
