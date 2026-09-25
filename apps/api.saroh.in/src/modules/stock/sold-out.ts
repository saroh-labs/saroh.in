import type { Prisma } from "@saroh/database";

/**
 * Sold out by hand (#515, DEC-032 amended): a storefront can mark a product
 * that counts no stock Sold out (`ProductListing.soldOutAt`). There it
 * refuses new shop and staff orders — `reserve.ts` says so in the words a
 * counted Sold out uses — until it is marked available again; open orders
 * keep what they have, and no stock entry is written. It belongs only to an
 * untracked product: turning Track stock on clears it (`tracking.ts`).
 *
 * The pure pieces live here, with no service imports, so the stock flows
 * and the products module read the same rule.
 */

type Tx = Prisma.TransactionClient;

/**
 * Clear the hand-marked Sold out on the listings `where` names: those
 * products count stock now, so their count says whether they sell.
 */
export async function clearSoldOut(
    tx: Pick<Tx, "productListing">,
    where: Prisma.ProductListingWhereInput,
): Promise<void> {
    await tx.productListing.updateMany({
        where: { ...where, soldOutAt: { not: null } },
        data: { soldOutAt: null, soldOutByUserId: null },
    });
}

/**
 * Of the (storefront, product) pairs asked about, those marked Sold out by
 * hand, as `storeId:productId` keys.
 */
export async function markedSoldOut(
    tx: Pick<Tx, "productListing">,
    pairs: readonly { storeId: string; productId: string }[],
): Promise<Set<string>> {
    if (pairs.length === 0) return new Set();
    const rows = await tx.productListing.findMany({
        where: {
            soldOutAt: { not: null },
            OR: pairs.map((p) => ({
                storeId: p.storeId,
                productId: p.productId,
            })),
        },
        select: { storeId: true, productId: true },
    });
    return new Set(rows.map((r) => soldOutKey(r)));
}

export function soldOutKey(pair: { storeId: string; productId: string }) {
    return `${pair.storeId}:${pair.productId}`;
}

/** Refused: it counts stock, so its count says whether it sells. */
export const SOLD_OUT_NEEDS_UNTRACKED =
    "This product counts its stock, so it shows Sold out when the count runs out. Stop tracking it to mark it sold out by hand.";

/** The storefront named doesn't sell the product. */
export const NOT_SOLD_THERE = "That storefront doesn't sell this product.";
