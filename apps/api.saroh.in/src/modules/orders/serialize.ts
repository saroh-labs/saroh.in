import { toMoneyString } from "../../common/money";

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
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    items: OrderItemDto[];
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
    subtotal: DecimalLike;
    tax: DecimalLike;
    shipping: DecimalLike;
    discount: DecimalLike;
    items: RawItem[];
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
    };
}
