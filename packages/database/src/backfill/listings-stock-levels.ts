/**
 * #510 backfill — listings and stock per storefront (ADR-010).
 *
 * A product belonged to one storefront and counted its stock in Inventory (a
 * product counted as a whole) or VariantInventory (per variant). It now
 * belongs to the business: a storefront sells it through a ProductListing
 * and counts it in StockLevel. This script, like the migration
 * `20261002100000_catalogue_listings_stock_levels` that does the same copy in
 * SQL, gives the old rows their new shape:
 *
 * 1. every product carries its business — taken from its storefront; a
 *    product with neither stops the run, loudly, before anything changes;
 * 2. product addresses (slugs) are unique in a business — where two clash,
 *    the oldest keeps its address and the others get a "-2", "-3" suffix,
 *    each listed in the report;
 * 3. every product is listed at the storefront it was made at, with all its
 *    variants;
 * 4. each Inventory and VariantInventory row becomes a StockLevel at that
 *    storefront with the same on hand, promised and warning level — only
 *    for a product with no StockLevel there yet, so a run after the new code
 *    has moved stock never copies an old count back;
 * 5. every line of an open or fulfilled order that holds or held stock names
 *    its StockLevel (the row it recorded, or for a line from before rows
 *    were recorded, its variant's row if it has one, else the product's) and
 *    holds its quantity while open, nothing once fulfilled.
 *
 * Steps 1 and 2 read and write only columns that exist before and after the
 * migration, so the script can run on either side of it: the migration
 * refuses to run while a product has no business or two share an address.
 * Steps 3–5 need the new tables and are skipped before it.
 *
 * Idempotent: a second run finds nothing to do and changes nothing. Each
 * business runs in its own transaction. Run it right after the migration;
 * it is not a repair tool once the new code has written stock.
 *
 * Run: `pnpm --filter @saroh/database exec tsx src/backfill/listings-stock-levels.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

import type { TransactionClient } from "../transaction";

export interface ListingsBackfillReport {
    /** Products given their storefront's business. */
    organizationsFilled: number;
    /** Addresses changed so each is unique in its business. */
    slugsSuffixed: {
        organizationId: string;
        productId: string;
        was: string;
        now: string;
    }[];
    /** False before the migration: steps 3–5 were skipped. */
    tablesPresent: boolean;
    listings: number;
    listingVariants: number;
    stockLevels: number;
    orderLines: number;
}

const OPEN = ["PENDING", "PROCESSING"];
const FULFILLED = ["SHIPPED", "DELIVERED"];

export async function backfillListingsStockLevels(
    db: PrismaClient,
): Promise<ListingsBackfillReport> {
    const report: ListingsBackfillReport = {
        organizationsFilled: 0,
        slugsSuffixed: [],
        tablesPresent: false,
        listings: 0,
        listingVariants: 0,
        stockLevels: 0,
        orderLines: 0,
    };

    await fillOrganizations(db, report);
    await suffixSlugs(db, report);

    const [{ present }] = await db.$queryRaw<{ present: boolean }[]>`
        SELECT to_regclass('"StockLevel"') IS NOT NULL AS present`;
    report.tablesPresent = present;
    if (!present) return report;

    const orgs = await db.organization.findMany({
        select: { id: true },
        orderBy: { id: "asc" },
    });
    for (const org of orgs) {
        await db.$transaction(
            async (tx) => {
                await listProducts(tx, org.id, report);
                await copyStock(tx, org.id, report);
                await linkOrderLines(tx, org.id, report);
            },
            { timeout: 120_000 },
        );
    }
    return report;
}

// ---- 1. The business ----

async function fillOrganizations(
    db: PrismaClient,
    report: ListingsBackfillReport,
): Promise<void> {
    const orphans = await db.$queryRaw<{ id: string; name: string }[]>`
        SELECT p."id", p."name" FROM "Product" p
        LEFT JOIN "Store" s ON s."id" = p."storeId"
        WHERE p."organizationId" IS NULL AND s."organizationId" IS NULL
        ORDER BY p."id"`;
    if (orphans.length > 0) {
        throw new Error(
            `${orphans.length} product(s) have no business and no storefront to take one from: ${orphans
                .map((p) => `${p.name} (${p.id})`)
                .join(
                    ", ",
                )}. Give each its organizationId by hand, then run this again.`,
        );
    }
    const mismatched = await db.$queryRaw<{ id: string }[]>`
        SELECT p."id" FROM "Product" p
        JOIN "Store" s ON s."id" = p."storeId"
        WHERE p."organizationId" IS NOT NULL
          AND p."organizationId" <> s."organizationId"
        ORDER BY p."id"`;
    if (mismatched.length > 0) {
        throw new Error(
            `${mismatched.length} product(s) name a business other than their storefront's: ${mismatched
                .map((p) => p.id)
                .join(", ")}. Fix them by hand, then run this again.`,
        );
    }
    report.organizationsFilled = await db.$executeRaw`
        UPDATE "Product" p SET "organizationId" = s."organizationId"
        FROM "Store" s
        WHERE p."storeId" = s."id" AND p."organizationId" IS NULL`;
}

// ---- 2. Addresses unique in a business ----

async function suffixSlugs(
    db: PrismaClient,
    report: ListingsBackfillReport,
): Promise<void> {
    const clashing = await db.$queryRaw<
        { id: string; organizationId: string; slug: string }[]
    >`
        SELECT p."id", p."organizationId", p."slug" FROM "Product" p
        WHERE ("organizationId", "slug") IN (
            SELECT "organizationId", "slug" FROM "Product"
            GROUP BY "organizationId", "slug" HAVING COUNT(*) > 1)
        ORDER BY p."organizationId", p."slug", p."createdAt", p."id"`;
    if (clashing.length === 0) return;

    const byOrg = new Map<string, typeof clashing>();
    for (const row of clashing) {
        byOrg.set(row.organizationId, [
            ...(byOrg.get(row.organizationId) ?? []),
            row,
        ]);
    }
    for (const [organizationId, rows] of Array.from(byOrg)) {
        await db.$transaction(async (tx) => {
            const taken = new Set(
                (
                    await tx.$queryRaw<{ slug: string }[]>`
                        SELECT "slug" FROM "Product"
                        WHERE "organizationId" = ${organizationId}`
                ).map((r) => r.slug),
            );
            const seen = new Set<string>();
            for (const row of rows) {
                // The oldest keeps its address.
                if (!seen.has(row.slug)) {
                    seen.add(row.slug);
                    continue;
                }
                let n = 2;
                while (taken.has(`${row.slug}-${n}`)) n += 1;
                const next = `${row.slug}-${n}`;
                taken.add(next);
                await tx.$executeRaw`
                    UPDATE "Product" SET "slug" = ${next} WHERE "id" = ${row.id}`;
                report.slugsSuffixed.push({
                    organizationId,
                    productId: row.id,
                    was: row.slug,
                    now: next,
                });
            }
        });
    }
}

// ---- 3. Listings ----

async function listProducts(
    tx: TransactionClient,
    organizationId: string,
    report: ListingsBackfillReport,
): Promise<void> {
    const products = await tx.product.findMany({
        where: {
            organizationId,
            storeId: { not: null },
            listings: { none: {} },
        },
        select: {
            id: true,
            storeId: true,
            createdAt: true,
            variants: { select: { id: true } },
        },
        orderBy: { id: "asc" },
    });
    for (const product of products) {
        if (!product.storeId) continue;
        const listing = await tx.productListing.create({
            data: {
                organizationId,
                storeId: product.storeId,
                productId: product.id,
                createdAt: product.createdAt,
            },
            select: { id: true },
        });
        report.listings += 1;
        if (product.variants.length > 0) {
            const made = await tx.productListingVariant.createMany({
                data: product.variants.map((v) => ({
                    organizationId,
                    listingId: listing.id,
                    productId: product.id,
                    variantId: v.id,
                })),
            });
            report.listingVariants += made.count;
        }
    }
}

// ---- 4. Stock ----

async function copyStock(
    tx: TransactionClient,
    organizationId: string,
    report: ListingsBackfillReport,
): Promise<void> {
    const products = await tx.product.findMany({
        where: {
            organizationId,
            storeId: { not: null },
            OR: [
                { inventory: { isNot: null } },
                { variants: { some: { inventory: { isNot: null } } } },
            ],
        },
        select: {
            id: true,
            storeId: true,
            inventory: {
                select: {
                    quantity: true,
                    reserved: true,
                    lowStockAlert: true,
                    updatedAt: true,
                },
            },
            variants: {
                select: {
                    id: true,
                    inventory: {
                        select: {
                            quantity: true,
                            reserved: true,
                            lowStockAlert: true,
                            updatedAt: true,
                        },
                    },
                },
            },
        },
        orderBy: { id: "asc" },
    });
    for (const product of products) {
        const storeId = product.storeId;
        if (!storeId) continue;
        // Already on StockLevel: the new code owns its numbers now.
        const counted = await tx.stockLevel.count({
            where: { storeId, productId: product.id },
        });
        if (counted > 0) continue;
        const rows = [
            ...(product.inventory
                ? [{ variantId: null, ...product.inventory }]
                : []),
            ...product.variants.flatMap((v) =>
                v.inventory ? [{ variantId: v.id, ...v.inventory }] : [],
            ),
        ];
        for (const row of rows) {
            await tx.stockLevel.create({
                data: {
                    organizationId,
                    storeId,
                    productId: product.id,
                    variantId: row.variantId,
                    onHand: row.quantity,
                    promised: row.reserved,
                    lowStockAlert: row.lowStockAlert,
                    updatedAt: row.updatedAt,
                },
            });
            report.stockLevels += 1;
        }
    }
}

// ---- 5. Order lines ----

async function linkOrderLines(
    tx: TransactionClient,
    organizationId: string,
    report: ListingsBackfillReport,
): Promise<void> {
    const lines = await tx.orderItem.findMany({
        where: {
            stockLevelId: null,
            OR: [{ stockRow: null }, { stockRow: { not: "NONE" } }],
            order: {
                store: { organizationId },
                status: { in: [...OPEN, ...FULFILLED] },
            },
        },
        select: {
            id: true,
            productId: true,
            variantId: true,
            quantity: true,
            stockRow: true,
            order: { select: { storeId: true, status: true } },
        },
        orderBy: { id: "asc" },
    });
    for (const line of lines) {
        const storeId = line.order.storeId;
        const variantRow = line.variantId
            ? await tx.stockLevel.findFirst({
                  where: { storeId, variantId: line.variantId },
                  select: { id: true },
              })
            : null;
        const productRow = await tx.stockLevel.findFirst({
            where: { storeId, productId: line.productId, variantId: null },
            select: { id: true },
        });
        let row: { id: string } | null;
        let kind: "PRODUCT" | "VARIANT" | null;
        if (line.stockRow === "VARIANT") {
            [row, kind] = [variantRow, "VARIANT"];
        } else if (line.stockRow === "PRODUCT") {
            [row, kind] = [productRow, "PRODUCT"];
        } else {
            // From before rows were recorded: the guess its release made.
            row = variantRow ?? productRow;
            kind = variantRow ? "VARIANT" : productRow ? "PRODUCT" : null;
        }
        if (!row || !kind) continue;
        await tx.orderItem.update({
            where: { id: line.id },
            data: {
                stockLevelId: row.id,
                stockRow: kind,
                heldQuantity: OPEN.includes(line.order.status)
                    ? line.quantity
                    : 0,
            },
        });
        report.orderLines += 1;
    }
}
