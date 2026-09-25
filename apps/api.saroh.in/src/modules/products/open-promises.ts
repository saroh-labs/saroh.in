import type { Prisma } from "@saroh/database";

import { RESERVING_STATUSES } from "../orders/order-inventory";

/**
 * The open order lines on a product's own row that name a variant — the
 * ones that move to that variant's row when the product switches to
 * counting per variant. Lines without a variant stay put. With `storeId`,
 * only that storefront's orders (#510: each storefront's lines move to its
 * own variant rows).
 *
 * Only lines that recorded the row (#511). A line with no row has never
 * held (an online order not yet paid, or a product that counted nothing
 * when it was placed): it keeps no row, so `reserveOnPayment` still holds
 * it — on the variant's row — when it is paid.
 */
export function linesToMove(
    productId: string,
    storeId?: string,
): Prisma.OrderItemWhereInput {
    return {
        productId,
        variantId: { not: null },
        order: {
            status: { in: [...RESERVING_STATUSES] },
            ...(storeId ? { storeId } : {}),
        },
        stockLevel: { productId, variantId: null },
    };
}

/**
 * What those lines at one storefront hold, summed per variant: their
 * `heldQuantity`, not their quantity — a line refunded in part before it
 * was fulfilled holds less (a row's promised is the sum of its open lines'
 * held units, #511).
 */
export async function promisesToMove(
    db: Pick<Prisma.TransactionClient, "orderItem">,
    productId: string,
    storeId: string,
): Promise<Record<string, number>> {
    const lines = await db.orderItem.groupBy({
        by: ["variantId"],
        where: linesToMove(productId, storeId),
        _sum: { heldQuantity: true },
        orderBy: { variantId: "asc" },
    });
    const out: Record<string, number> = {};
    for (const line of lines) {
        const q = line._sum.heldQuantity ?? 0;
        if (line.variantId && q > 0) out[line.variantId] = q;
    }
    return out;
}
