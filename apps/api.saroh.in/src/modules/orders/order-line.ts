import type { Prisma } from "@saroh/database";

/*
 * What an order line bills (E9, DEC-050): a product, or a service — a
 * treatment sold as one order with a booking per visit. Exactly one of
 * `productId` and `serviceId` is set (the database CHECKs it). A service
 * line holds no stock, has no variant and a quantity of 1, takes its GST
 * from the service, invites no product review and never matches a product
 * discount.
 *
 * Readers give each line a `name` and a `kind` from here, so no screen
 * branches on which id is set or reads `product.name` directly.
 */

export const ORDER_LINE_KINDS = ["product", "service"] as const;
export type OrderLineKind = (typeof ORDER_LINE_KINDS)[number];

/** What a reader selects beside the product to name a service line. */
export const LINE_SERVICE_SELECT = {
    serviceId: true,
    service: { select: { name: true } },
} as const satisfies Prisma.OrderItemSelect;

/** A service line (E9): it bills a service, not a product. */
export function isServiceLine(line: {
    productId?: string | null;
    serviceId?: string | null;
}): boolean {
    return !line.productId && Boolean(line.serviceId);
}

/** What a line bills: `product` or `service`. */
export function lineKind(line: {
    productId?: string | null;
    serviceId?: string | null;
}): OrderLineKind {
    return isServiceLine(line) ? "service" : "product";
}

/** The line's name: its product's, or its service's. Null if neither is read. */
export function lineName(line: {
    product?: { name: string } | null;
    service?: { name: string } | null;
}): string | null {
    return line.product?.name ?? line.service?.name ?? null;
}

/** Only the lines that bill a product: what stock, reviews and discounts read. */
export const PRODUCT_LINES = {
    productId: { not: null },
} as const satisfies Prisma.OrderItemWhereInput;
