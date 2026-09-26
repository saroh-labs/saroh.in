import { NotFoundException } from "@nestjs/common";
import type { Prisma, StockEntryKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import type { StockWord } from "../products/product-overview";
import { stockLine } from "../products/product-overview";
import type { StockLevelsQueryDto } from "./dto";
import type { StockReader } from "./stock-access";
import { shortBy } from "./stock-words";
import { businessTracksStock } from "./tracking";

/**
 * The Stock screen's levels (#514, paged for #527): a row per product (or
 * per variant) with a cell per open storefront.
 *
 * Paged by product, a page at a time (`limit` products after `cursor`, the
 * last product id of the page before), the way the log pages. The rows are
 * worked out for every product the filters keep — "Needs you" is a word the
 * shelves make, not a column — and only the page's are sent, with the page's
 * last changes read. Without `limit` every row comes back, as before.
 */

export interface LastChange {
    at: Date;
    kind: StockEntryKind;
    quantity: number;
    /** Who made it — only for a role that reads the audit trail. */
    by: string | null;
    /** The order behind it — only for a role that reads orders. */
    order: { id: string; number: string } | null;
}

/** One storefront's shelf of one row. */
export interface StockCell {
    storeId: string;
    /** Null where this storefront has no shelf for it yet. */
    stockLevelId: string | null;
    /** The storefront sells it; false reads "Not sold here". */
    soldHere: boolean;
    onHand: number;
    promised: number;
    /** On hand minus promised, never below 0 — what the shop sells. */
    canSell: number;
    /** Promised units not on the shelf ("N short"). */
    short: number;
    warnAt: number;
    word: StockWord | "NOT_SOLD_HERE";
    lastChange: LastChange | null;
}

export interface StockLevelRow {
    productId: string;
    productName: string;
    productStatus: string;
    image: string | null;
    /** Null: the product counted as a whole. */
    variantId: string | null;
    variantTitle: string | null;
    sku: string | null;
    cells: StockCell[];
    /** The latest change at any storefront. */
    lastChange: LastChange | null;
}

export interface StockLevelsView {
    storefronts: { id: string; name: string }[];
    rows: StockLevelRow[];
    /**
     * Products that don't track stock (#515) — Track stock off for the
     * product, or for the whole business: they sell unless a storefront
     * marked them Sold out by hand (`soldOutAt`, its storefront ids). Every
     * one, on every page: the screen's footer.
     */
    untracked: {
        productId: string;
        name: string;
        status: string;
        soldOutAt: string[];
    }[];
    /** The business's Track stock switch; off, every product is untracked. */
    tracking: boolean;
    canWrite: boolean;
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
    /**
     * Rows that need someone, across every page (not the search): short,
     * sold out or at their warning level where they are sold.
     */
    needsYou: number;
    /** The business's zone, for the screen's "today at 07:12". */
    timezone: string;
}

/** Open storefronts of the business, first made first. */
export function openStorefronts(organizationId: string, only?: string) {
    return prisma.store.findMany({
        where: {
            organizationId,
            deletedAt: null,
            ...(only ? { id: only } : {}),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
    });
}

/** The latest entry on each row, with who made it and its order. */
async function lastChanges(
    reader: StockReader,
    stockLevelIds: string[],
): Promise<Map<string, LastChange>> {
    if (stockLevelIds.length === 0) return new Map();
    const rows = await prisma.$queryRaw<
        {
            stockLevelId: string;
            kind: StockEntryKind;
            quantity: number;
            createdAt: Date;
            actorUserId: string | null;
            orderId: string | null;
        }[]
    >`SELECT DISTINCT ON ("stockLevelId") "stockLevelId", "kind"::text AS "kind", "quantity", "createdAt", "actorUserId", "orderId"
      FROM "StockEntry"
      WHERE "organizationId" = ${reader.organizationId}
        AND "stockLevelId" = ANY(${stockLevelIds}::text[])
      ORDER BY "stockLevelId", "createdAt" DESC, "id" DESC`;
    const people = new Map<string, string>();
    const userIds = reader.seesPeople
        ? Array.from(new Set(rows.flatMap((r) => r.actorUserId ?? [])))
        : [];
    if (userIds.length > 0) {
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
        });
        for (const u of users)
            people.set(u.id, u.name?.trim() ? u.name : u.email);
    }
    const orders = new Map<string, string>();
    const orderIds = reader.seesOrders
        ? Array.from(new Set(rows.flatMap((r) => r.orderId ?? [])))
        : [];
    if (orderIds.length > 0) {
        const found = await prisma.order.findMany({
            where: {
                id: { in: orderIds },
                organizationId: reader.organizationId,
            },
            select: { id: true, orderId: true },
        });
        for (const o of found) orders.set(o.id, o.orderId);
    }
    return new Map(
        rows.map((r) => {
            const number = r.orderId ? orders.get(r.orderId) : undefined;
            return [
                r.stockLevelId,
                {
                    at: r.createdAt,
                    kind: r.kind,
                    quantity: r.quantity,
                    by: (r.actorUserId && people.get(r.actorUserId)) ?? null,
                    order:
                        r.orderId && number ? { id: r.orderId, number } : null,
                },
            ];
        }),
    );
}

function latest(changes: (LastChange | null)[]): LastChange | null {
    let out: LastChange | null = null;
    for (const c of changes) {
        if (c && (!out || c.at > out.at)) out = c;
    }
    return out;
}

/** A row that needs someone: short, sold out or low where it is sold. */
export function rowNeedsYou(cells: readonly StockCell[]): boolean {
    return cells.some(
        (c) =>
            c.word !== "NOT_SOLD_HERE" &&
            (c.short > 0 || c.word === "SOLD_OUT" || c.word === "LOW"),
    );
}

/** Where a search looks: the product's name and its variants' SKUs. */
function searchWhere(q: string | undefined): Prisma.ProductWhereInput {
    const text = q?.trim();
    if (!text) return {};
    return {
        OR: [
            { name: { contains: text, mode: "insensitive" } },
            {
                variants: {
                    some: { sku: { contains: text, mode: "insensitive" } },
                },
            },
        ],
    };
}

export async function readLevels(
    reader: StockReader,
    query: StockLevelsQueryDto,
): Promise<StockLevelsView> {
    const { organizationId } = reader;
    const storefronts = await openStorefronts(organizationId, query.storefront);
    if (query.storefront && storefronts.length === 0) {
        throw new NotFoundException("Store not found");
    }
    if (query.product) {
        const found = await prisma.product.count({
            where: { id: query.product, organizationId },
        });
        if (found === 0) throw new NotFoundException("Product not found");
    }
    if (query.cursor) {
        const found = await prisma.product.count({
            where: { id: query.cursor, organizationId },
        });
        if (found === 0) throw new NotFoundException("Product not found");
    }
    const productWhere: Prisma.ProductWhereInput = {
        organizationId,
        ...(query.product ? { id: query.product } : {}),
    };
    const [products, levels, tracking, timezone] = await Promise.all([
        prisma.product.findMany({
            where: productWhere,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: {
                id: true,
                name: true,
                status: true,
                image: true,
                stockTracked: true,
                variants: {
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                    select: { id: true, title: true, sku: true },
                },
                listings: {
                    select: {
                        storeId: true,
                        soldOutAt: true,
                        variants: { select: { variantId: true } },
                    },
                },
            },
        }),
        prisma.stockLevel.findMany({
            where: {
                organizationId,
                ...(query.product ? { productId: query.product } : {}),
            },
            select: {
                id: true,
                storeId: true,
                productId: true,
                variantId: true,
                onHand: true,
                promised: true,
                lowStockAlert: true,
            },
        }),
        businessTracksStock(prisma, organizationId),
        businessTimezone(prisma, organizationId),
    ]);
    // The search, as ids: the rows are worked out for every product (the
    // "Needs you" count is the business's, not the search's).
    const text = query.q?.trim();
    const matching = text
        ? new Set(
              (
                  await prisma.product.findMany({
                      where: { ...productWhere, ...searchWhere(text) },
                      select: { id: true },
                  })
              ).map((p) => p.id),
          )
        : null;

    const byProduct = new Map<string, typeof levels>();
    for (const level of levels) {
        const list = byProduct.get(level.productId) ?? [];
        list.push(level);
        byProduct.set(level.productId, list);
    }

    /** Every tracked product's rows, before paging; cells lack last change. */
    const groups: { productId: string; rows: StockLevelRow[] }[] = [];
    const untracked: StockLevelsView["untracked"] = [];
    let needsYou = 0;
    for (const product of products) {
        const shelves = byProduct.get(product.id) ?? [];
        if (!tracking || !product.stockTracked) {
            untracked.push({
                productId: product.id,
                name: product.name,
                status: product.status,
                soldOutAt: product.listings.flatMap((l) =>
                    l.soldOutAt ? [l.storeId] : [],
                ),
            });
            continue;
        }
        const listings = new Map(
            product.listings.map((l) => [
                l.storeId,
                new Set(l.variants.map((v) => v.variantId)),
            ]),
        );
        const perVariant = shelves.some((s) => s.variantId !== null);
        const lines: {
            variantId: string | null;
            title: string | null;
            sku: string | null;
        }[] = perVariant
            ? product.variants.map((v) => ({
                  variantId: v.id,
                  title: v.title,
                  sku: v.sku,
              }))
            : [
                  {
                      variantId: null,
                      title: null,
                      sku: product.variants[0]?.sku ?? null,
                  },
              ];
        // In per-variant mode the product's own shelf only carries promises
        // of lines without a variant; shown while it holds any.
        if (
            perVariant &&
            shelves.some(
                (s) =>
                    s.variantId === null &&
                    (s.onHand !== 0 || s.promised !== 0),
            )
        ) {
            lines.push({ variantId: null, title: null, sku: null });
        }
        const rows: StockLevelRow[] = [];
        for (const line of lines) {
            const cells = storefronts.map((store): StockCell => {
                const shelf = shelves.find(
                    (s) =>
                        s.storeId === store.id &&
                        s.variantId === line.variantId,
                );
                const sold = listings.get(store.id);
                const soldHere =
                    sold !== undefined &&
                    (line.variantId === null || sold.has(line.variantId));
                const counts = stockLine({
                    quantity: shelf?.onHand ?? 0,
                    reserved: shelf?.promised ?? 0,
                    lowStockAlert: shelf?.lowStockAlert ?? 0,
                });
                return {
                    storeId: store.id,
                    stockLevelId: shelf?.id ?? null,
                    soldHere,
                    onHand: counts.onHand,
                    promised: counts.promised,
                    canSell: counts.canSell,
                    short: shortBy({
                        onHand: counts.onHand,
                        promised: counts.promised,
                    }),
                    warnAt: counts.warnAt,
                    word: soldHere ? counts.word : "NOT_SOLD_HERE",
                    lastChange: null,
                };
            });
            if (rowNeedsYou(cells)) needsYou += 1;
            rows.push({
                productId: product.id,
                productName: product.name,
                productStatus: product.status,
                image: product.image,
                variantId: line.variantId,
                variantTitle: line.title,
                sku: line.sku,
                cells,
                lastChange: null,
            });
        }
        groups.push({ productId: product.id, rows });
    }

    // Filter, then page by product.
    let kept = groups
        .filter((g) => !matching || matching.has(g.productId))
        .map((g) =>
            query.needs
                ? { ...g, rows: g.rows.filter((r) => rowNeedsYou(r.cells)) }
                : g,
        )
        .filter((g) => g.rows.length > 0);
    if (query.cursor) {
        // After the cursor in name order — whether or not the filters
        // still keep the cursor's own product.
        const order = new Map(products.map((p, i) => [p.id, i]));
        const after = order.get(query.cursor) ?? -1;
        kept = kept.filter((g) => (order.get(g.productId) ?? -1) > after);
    }
    const more = query.limit !== undefined && kept.length > query.limit;
    const page = more ? kept.slice(0, query.limit) : kept;
    const rows = page.flatMap((g) => g.rows);

    const changes = await lastChanges(
        reader,
        rows.flatMap((r) => r.cells.flatMap((c) => c.stockLevelId ?? [])),
    );
    for (const row of rows) {
        for (const cell of row.cells) {
            cell.lastChange = cell.stockLevelId
                ? (changes.get(cell.stockLevelId) ?? null)
                : null;
        }
        row.lastChange = latest(row.cells.map((c) => c.lastChange));
    }

    return {
        storefronts,
        rows,
        untracked,
        tracking,
        canWrite: reader.canWrite,
        nextCursor: more ? page[page.length - 1].productId : null,
        needsYou,
        timezone,
    };
}
