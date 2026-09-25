import type { Prisma } from "@saroh/database";

import { RESERVING_STATUSES } from "../orders/order-inventory";

/**
 * The open order lines holding stock on a product's own row that name a
 * variant — the ones that move to that variant's row when the product
 * switches to counting per variant. Lines without a variant stay put. With
 * `storeId`, only that storefront's orders (#510: each storefront's lines
 * move to its own variant rows).
 *
 * Exact for lines that recorded their row. A line from before rows were
 * recorded (`stockRow` and `stockLevelId` null) is taken to sit on the
 * product's row whenever the product counts stock at the order's
 * storefront — the same guess its release would make.
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
        OR: [
            { stockLevel: { productId, variantId: null } },
            {
                stockRow: null,
                stockLevelId: null,
                order: {
                    store: {
                        stockLevels: { some: { productId, variantId: null } },
                    },
                },
            },
        ],
    };
}

/** What those lines at one storefront promise, summed per variant. */
export async function promisesToMove(
    db: Pick<Prisma.TransactionClient, "orderItem">,
    productId: string,
    storeId: string,
): Promise<Record<string, number>> {
    const lines = await db.orderItem.groupBy({
        by: ["variantId"],
        where: linesToMove(productId, storeId),
        _sum: { quantity: true },
        orderBy: { variantId: "asc" },
    });
    const out: Record<string, number> = {};
    for (const line of lines) {
        const q = line._sum.quantity ?? 0;
        if (line.variantId && q > 0) out[line.variantId] = q;
    }
    return out;
}
