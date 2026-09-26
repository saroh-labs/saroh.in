import type { Prisma } from "@saroh/database";

/**
 * StockLevel helpers (#510): one storefront's shelf of a product (variantId
 * null — it counts as a whole) or of one variant. A product counts stock at
 * a storefront while it has a row there, and counts per variant once any of
 * its rows names a variant.
 *
 * Lock order, every flow that changes stock (plan KTD): Order →
 * BusinessProfile (FOR SHARE, when Track stock is read under the lock) →
 * Product (a change to how the product counts: listing it, switching to
 * variants, removing a variant; several at once sorted by id) → StockLevel
 * rows, sorted by id. Rows are found under that lock and created when
 * missing; the uniques are partial, so they are never upserted.
 *
 * A product is locked FOR NO KEY UPDATE, never FOR UPDATE: every insert
 * that names a product (a StockEntry, an OrderItem) takes FOR KEY SHARE on
 * it for its foreign key, often while it holds a StockLevel lock. FOR
 * UPDATE conflicts with that, so a count opening a new shelf and a sale on
 * the product's other shelf would wait on each other (PR #533 review). NO
 * KEY UPDATE still serialises every lockProduct caller.
 */

/** What the API has always called a stock row: on hand, promised, warning. */
export interface StockCounts {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

export interface StockLevelRow {
    id: string;
    storeId: string;
    variantId: string | null;
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

export const STOCK_LEVEL_SELECT = {
    id: true,
    storeId: true,
    variantId: true,
    onHand: true,
    promised: true,
    lowStockAlert: true,
} satisfies Prisma.StockLevelSelect;

/** A StockLevel in the wire shape the app has always read. */
export function asCounts(
    row: Pick<StockLevelRow, "onHand" | "promised" | "lowStockAlert">,
): StockCounts {
    return {
        quantity: row.onHand,
        reserved: row.promised,
        lowStockAlert: row.lowStockAlert,
    };
}

/** Take the row locks for `ids`, in id order so two writers never deadlock. */
export async function lockStockLevels(
    tx: Prisma.TransactionClient,
    ids: readonly string[],
): Promise<void> {
    const sorted = Array.from(new Set(ids)).sort();
    if (sorted.length === 0) return;
    await tx.$queryRaw`SELECT id FROM "StockLevel" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR UPDATE`;
}

/** Lock a product's rows (all storefronts, or one) and return them. */
export async function lockProductStock(
    tx: Prisma.TransactionClient,
    productId: string,
    storeId?: string,
): Promise<StockLevelRow[]> {
    const where = { productId, ...(storeId ? { storeId } : {}) };
    const ids = await tx.stockLevel.findMany({ where, select: { id: true } });
    await lockStockLevels(
        tx,
        ids.map((r) => r.id),
    );
    // Re-read under the lock: a row made meanwhile shows up now.
    return tx.stockLevel.findMany({
        where,
        select: STOCK_LEVEL_SELECT,
        orderBy: { id: "asc" },
    });
}

/** Lock the product itself, for a change to how it counts or where it sells. */
export async function lockProduct(
    tx: Prisma.TransactionClient,
    productId: string,
): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR NO KEY UPDATE`;
}

/** Lock several products at once, in id order, in one statement. */
export async function lockProducts(
    tx: Prisma.TransactionClient,
    productIds: readonly string[],
): Promise<void> {
    const sorted = Array.from(new Set(productIds)).sort();
    if (sorted.length === 0) return;
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR NO KEY UPDATE`;
}

/** Whether the product counts stock per variant (anywhere). */
export async function countsPerVariant(
    db: Pick<Prisma.TransactionClient, "stockLevel">,
    productId: string,
): Promise<boolean> {
    return (
        (await db.stockLevel.count({
            where: { productId, variantId: { not: null } },
        })) > 0
    );
}

/** The first row, if any: a storefront has at most one of a kind. */
export function firstRow<T>(rows: readonly T[]): T | undefined {
    return rows.length > 0 ? rows[0] : undefined;
}
