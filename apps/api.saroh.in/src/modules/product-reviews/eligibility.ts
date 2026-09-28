import { contactEmailForDisplay } from "../contacts/contact-email";

/**
 * Whether an order can be asked for — or still accept — reviews (R1): paid,
 * shipped or delivered, part of a business, with somewhere to send the link.
 * One rule, used when inviting AND on every public request, so an order
 * refunded after the invite stops taking reviews.
 */
export type IneligibleReason =
    | "no-business"
    | "cancelled"
    | "refunded"
    | "not-paid"
    | "not-shipped"
    | "no-email"
    | "no-products";

export function orderIneligibility(order: {
    organizationId: string | null;
    status: string;
    paymentStatus: string;
    customerEmail: string | null;
    /**
     * The lines that bill a product. A treatment's service line (E9,
     * DEC-050) invites no product review, so an order of nothing else has
     * nothing to review. Absent: not counted, as before.
     */
    productLines?: number;
}): IneligibleReason | null {
    if (!order.organizationId) return "no-business";
    if (order.status === "CANCELLED") return "cancelled";
    if (order.paymentStatus === "REFUNDED") return "refunded";
    if (order.paymentStatus !== "PAID") return "not-paid";
    if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
        return "not-shipped";
    }
    // A walk-in kept by their phone (B13b) holds a placeholder: no email.
    if (!contactEmailForDisplay(order.customerEmail)) return "no-email";
    if (order.productLines === 0) return "no-products";
    return null;
}

/** The reason as the merchant reads it. */
export const INELIGIBLE_MESSAGE: Record<IneligibleReason, string> = {
    "no-business": "This order is not part of a business.",
    cancelled: "This order was cancelled.",
    refunded: "This order was refunded.",
    "not-paid": "This order has not been paid.",
    "not-shipped": "This order has not shipped yet.",
    "no-email": "This customer has no email address.",
    "no-products": "This order has no products to review.",
};
