import type { Prisma } from "@saroh/database";

import { RESERVING_STATUSES } from "../orders/order-inventory";

/**
 * What a product counting as a whole has promised to open orders, per
 * variant — the reservations that move to each variant's own row when it
 * switches to counting per variant. Only order lines that name a variant
 * move; lines without one stay promised on the product's row.
 *
 * Capped at what the product's row actually holds (`reserved`), so a line
 * placed while the product was untracked — which reserved nothing — can
 * never move more than exists.
 */
export async function promisesToMove(
    db: Pick<Prisma.TransactionClient, "orderItem">,
    productId: string,
    reserved: number,
): Promise<Record<string, number>> {
    if (reserved <= 0) return {};
    const lines = await db.orderItem.groupBy({
        by: ["variantId"],
        where: {
            productId,
            variantId: { not: null },
            order: { status: { in: [...RESERVING_STATUSES] } },
        },
        _sum: { quantity: true },
        orderBy: { variantId: "asc" },
    });
    const out: Record<string, number> = {};
    let left = reserved;
    for (const line of lines) {
        const q = Math.min(line._sum.quantity ?? 0, left);
        if (!line.variantId || q <= 0) continue;
        out[line.variantId] = q;
        left -= q;
    }
    return out;
}
