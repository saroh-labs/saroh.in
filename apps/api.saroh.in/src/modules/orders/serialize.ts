import { toMoneyString } from "../../common/money";
import type { OrderLineKind } from "./order-line";
import { lineKind, lineName } from "./order-line";

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
    /** Null on a service line (E9): it bills `serviceId` instead. */
    productId: string | null;
    /** The service a treatment's line bills (E9, DEC-050); null otherwise. */
    serviceId: string | null;
    /** What the line bills, so screens don't branch on which id is set. */
    kind: OrderLineKind;
    /** The product's or the service's name. */
    name: string | null;
    /** The variant bought, when the line names one. */
    variantId: string | null;
    variant: { title: string } | null;
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
    productId: string | null;
    serviceId?: string | null;
    service?: { name: string } | null;
    variantId?: string | null;
    variant?: { title: string } | null;
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
            serviceId: i.serviceId ?? null,
            kind: lineKind(i),
            name: lineName(i),
            variantId: i.variantId ?? null,
            variant: i.variant ?? null,
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
