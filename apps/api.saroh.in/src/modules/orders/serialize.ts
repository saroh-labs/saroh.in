import { toMoneyString } from "../../common/money";
import { orderStanding } from "./order-standing";

/**
 * Decimal → string serializers for orders. An Order carries five Decimal money
 * fields plus per-line prices; rendering them as fixed 2-decimal strings keeps
 * money exact over HTTP and keeps the services' return types portable (no
 * Decimal in the public shape — avoids TS2883).
 */

interface DecimalLike {
    toString(): string;
}

export interface OrderItemDto {
    id: string;
    productId: string;
    quantity: number;
    price: string;
    product?: { name: string } | null;
}

export interface OrderSummaryDto {
    id: string;
    orderId: string;
    customerId: string;
    status: string;
    paymentStatus: string;
    total: string;
    currency: string;
    createdAt: Date;
    customer?: {
        email: string;
        firstName: string | null;
        lastName: string | null;
    } | null;
}

export interface OrderDetailDto extends OrderSummaryDto {
    /** When anything on the order last changed; `null` if never read. */
    updatedAt: Date | null;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    items: OrderItemDto[];
    /**
     * The code this order used, as it was WHEN it was used — read from the
     * redemption's snapshot, never the live code, so renaming or re-rating a
     * code later cannot rewrite this order. `null` for no code.
     */
    discountCode: {
        code: string;
        /** "15% off" or "10.00 off" — the rule that produced `discount`. */
        rule: string;
    } | null;
}

interface RawCustomer {
    email: string;
    firstName: string | null;
    lastName: string | null;
}

interface RawSummary {
    id: string;
    orderId: string;
    customerId: string;
    status: string;
    paymentStatus: string;
    total: DecimalLike;
    currency: string;
    createdAt: Date;
    customer?: RawCustomer | null;
}

interface RawItem {
    id: string;
    productId: string;
    quantity: number;
    price: DecimalLike;
    product?: { name: string } | null;
}

interface RawDetail extends RawSummary {
    updatedAt?: Date;
    subtotal: DecimalLike;
    tax: DecimalLike;
    shipping: DecimalLike;
    discount: DecimalLike;
    items: RawItem[];
    discountRedemption?: {
        code: string;
        kind: string;
        percentBps: number | null;
        ruleAmount: DecimalLike | null;
        currency: string;
    } | null;
}

function ruleOf(r: NonNullable<RawDetail["discountRedemption"]>): string {
    if (r.kind === "PERCENTAGE" && r.percentBps !== null) {
        return `${(r.percentBps / 100).toFixed(2).replace(/\.?0+$/, "")}% off`;
    }
    return r.ruleAmount
        ? `${toMoneyString(r.ruleAmount)} ${r.currency} off`
        : "Amount off";
}

export function serializeOrderSummary(order: RawSummary): OrderSummaryDto {
    return {
        id: order.id,
        orderId: order.orderId,
        customerId: order.customerId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: toMoneyString(order.total),
        currency: order.currency,
        createdAt: order.createdAt,
        customer: order.customer ?? null,
    };
}

export function serializeOrderDetail(order: RawDetail): OrderDetailDto {
    return {
        ...serializeOrderSummary(order),
        updatedAt: order.updatedAt ?? null,
        subtotal: toMoneyString(order.subtotal),
        tax: toMoneyString(order.tax),
        shipping: toMoneyString(order.shipping),
        discount: toMoneyString(order.discount),
        items: order.items.map((i) => ({
            id: i.id,
            productId: i.productId,
            quantity: i.quantity,
            price: toMoneyString(i.price),
            product: i.product ?? null,
        })),
        discountCode: order.discountRedemption
            ? {
                  code: order.discountRedemption.code,
                  rule: ruleOf(order.discountRedemption),
              }
            : null,
    };
}

/** A row on the business-wide Orders screen. */
export interface OrganizationOrderDto {
    id: string;
    orderId: string;
    /** REFUNDED | CANCELLED | FULFILLED | UNFULFILLED — see `orderStanding`. */
    standing: ReturnType<typeof orderStanding>;
    total: string;
    currency: string;
    placedAt: Date;
    itemCount: number;
    store: { id: string; name: string };
    customer: {
        id: string;
        name: string | null;
        email: string;
    } | null;
}

interface RawOrganizationOrder {
    id: string;
    orderId: string;
    customerId: string;
    status: string;
    paymentStatus: string;
    total: DecimalLike;
    currency: string;
    createdAt: Date;
    customer?: RawCustomer | null;
    store: { id: string; name: string };
    _count: { items: number };
}

/**
 * The row shape for the business-wide list.
 *
 * It does NOT extend the per-store summary: that one answers "what is this
 * order" inside a storefront you already chose, and this one answers "which of
 * my orders needs me" across all of them — so it carries the storefront and an
 * item count, and resolves the two status columns into the single standing the
 * screen actually renders, rather than making each caller redo that.
 */
export function serializeOrganizationOrder(
    order: RawOrganizationOrder,
): OrganizationOrderDto {
    const name = [order.customer?.firstName, order.customer?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    return {
        id: order.id,
        orderId: order.orderId,
        standing: orderStanding(order.status, order.paymentStatus),
        total: toMoneyString(order.total),
        currency: order.currency,
        placedAt: order.createdAt,
        itemCount: order._count.items,
        store: order.store,
        customer: order.customer
            ? {
                  id: order.customerId,
                  name: name || null,
                  email: order.customer.email,
              }
            : null,
    };
}
