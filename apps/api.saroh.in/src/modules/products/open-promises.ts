import type { Prisma } from "@saroh/database";

import { RESERVING_STATUSES } from "../orders/order-inventory";

/**
 * The open order lines holding stock on a product's own row that name a
 * variant — the ones that move to that variant's row when the product
 * switches to counting per variant. Lines without a variant stay put.
 *
 * Exact for lines that recorded their row. A line from before rows were
 * recorded (`stockRow` null) is taken to sit on the product's row whenever
 * the product counts stock — the same guess its release would make.
 */
export function linesToMove(
    productId: string,
    tracked: boolean,
): Prisma.OrderItemWhereInput {
    return {
        productId,
        variantId: { not: null },
        order: { status: { in: [...RESERVING_STATUSES] } },
        OR: [{ stockRow: "PRODUCT" }, ...(tracked ? [{ stockRow: null }] : [])],
    };
}

/** What those lines promise, summed per variant. */
export async function promisesToMove(
    db: Pick<Prisma.TransactionClient, "orderItem">,
    productId: string,
    tracked: boolean,
): Promise<Record<string, number>> {
    const lines = await db.orderItem.groupBy({
        by: ["variantId"],
        where: linesToMove(productId, tracked),
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
