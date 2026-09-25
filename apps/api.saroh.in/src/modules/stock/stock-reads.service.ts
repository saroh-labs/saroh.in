import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, StockEntryKind } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { StockWord } from "../products/product-overview";
import { stockLine } from "../products/product-overview";
import type { StockLevelsQueryDto, StockLogQueryDto } from "./dto";
import { stockReader } from "./stock-access";
import {
    countMismatched,
    isHandMade,
    shortBy,
    STOCK_ENTRY_WORDS,
} from "./stock-words";

/**
 * What the Stock screen, the quick look and the product page read (#514):
 * the levels — a row per product (or per variant) with a cell per
 * storefront — and the log. Every number comes from StockLevel and
 * StockEntry; the screens only turn them into words (`lib/stock/levels.ts`).
 */

export interface LastChange {
    at: Date;
    kind: StockEntryKind;
    quantity: number;
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
    /** Products that don't count stock (no shelf anywhere): they always sell. */
    untracked: { productId: string; name: string; status: string }[];
    canWrite: boolean;
}

export interface StockLogEntry {
    id: string;
    kind: StockEntryKind;
    word: string;
    quantity: number;
    before: number;
    after: number;
    expected: number | null;
    counted: number | null;
    /** A count against a number the shelf no longer had. */
    mismatch: boolean;
    storeId: string;
    storeName: string;
    productId: string;
    productName: string;
    variantId: string | null;
    variantTitle: string | null;
    pairId: string | null;
    reversesId: string | null;
    /** An Undo has taken it back. */
    undone: boolean;
    /** This caller can Undo it now. */
    canUndo: boolean;
    note: string | null;
    createdAt: Date;
    /** Who made it — only for a role that reads the audit trail. */
    by: { id: string; name: string } | null;
    /** The order behind it — only for a role that reads orders. */
    order: { id: string; number: string } | null;
}

export interface StockLogView {
    entries: StockLogEntry[];
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
    seesPeople: boolean;
    seesOrders: boolean;
}

const DEFAULT_LOG_PAGE = 50;

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

/** The latest entry on each row. */
async function lastChanges(
    organizationId: string,
    stockLevelIds: string[],
): Promise<Map<string, LastChange>> {
    if (stockLevelIds.length === 0) return new Map();
    const rows = await prisma.$queryRaw<
        {
            stockLevelId: string;
            kind: StockEntryKind;
            quantity: number;
            createdAt: Date;
        }[]
    >`SELECT DISTINCT ON ("stockLevelId") "stockLevelId", "kind"::text AS "kind", "quantity", "createdAt"
      FROM "StockEntry"
      WHERE "organizationId" = ${organizationId}
        AND "stockLevelId" = ANY(${stockLevelIds}::text[])
      ORDER BY "stockLevelId", "createdAt" DESC, "id" DESC`;
    return new Map(
        rows.map((r) => [
            r.stockLevelId,
            { at: r.createdAt, kind: r.kind, quantity: r.quantity },
        ]),
    );
}

function latest(changes: (LastChange | null)[]): LastChange | null {
    let out: LastChange | null = null;
    for (const c of changes) {
        if (c && (!out || c.at > out.at)) out = c;
    }
    return out;
}

@Injectable()
export class StockReadsService {
    /**
     * Stock levels: every product that counts stock, a row per variant when
     * it counts per variant, a cell per open storefront. A storefront that
     * doesn't sell it reads "Not sold here", with any stock still on its
     * shelf shown.
     */
    async levels(
        ctx: OrganizationContext,
        query: StockLevelsQueryDto,
    ): Promise<StockLevelsView> {
        const reader = stockReader(ctx);
        const { organizationId } = reader;
        const storefronts = await openStorefronts(
            organizationId,
            query.storefront,
        );
        if (query.storefront && storefronts.length === 0) {
            throw new NotFoundException("Store not found");
        }
        if (query.product) {
            const found = await prisma.product.count({
                where: { id: query.product, organizationId },
            });
            if (found === 0) throw new NotFoundException("Product not found");
        }
        const productWhere: Prisma.ProductWhereInput = {
            organizationId,
            ...(query.product ? { id: query.product } : {}),
        };
        const [products, levels] = await Promise.all([
            prisma.product.findMany({
                where: productWhere,
                orderBy: [{ name: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    name: true,
                    status: true,
                    image: true,
                    variants: {
                        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                        select: { id: true, title: true, sku: true },
                    },
                    listings: {
                        select: {
                            storeId: true,
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
        ]);
        const changes = await lastChanges(
            organizationId,
            levels.map((l) => l.id),
        );
        const byProduct = new Map<string, typeof levels>();
        for (const level of levels) {
            const list = byProduct.get(level.productId) ?? [];
            list.push(level);
            byProduct.set(level.productId, list);
        }

        const rows: StockLevelRow[] = [];
        const untracked: StockLevelsView["untracked"] = [];
        for (const product of products) {
            const shelves = byProduct.get(product.id) ?? [];
            if (shelves.length === 0) {
                untracked.push({
                    productId: product.id,
                    name: product.name,
                    status: product.status,
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
            // In per-variant mode the product's own shelf only carries
            // promises of lines without a variant; shown while it holds any.
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
                        lastChange: shelf
                            ? (changes.get(shelf.id) ?? null)
                            : null,
                    };
                });
                rows.push({
                    productId: product.id,
                    productName: product.name,
                    productStatus: product.status,
                    image: product.image,
                    variantId: line.variantId,
                    variantTitle: line.title,
                    sku: line.sku,
                    cells,
                    lastChange: latest(cells.map((c) => c.lastChange)),
                });
            }
        }
        return { storefronts, rows, untracked, canWrite: reader.canWrite };
    }

    /**
     * The stock log, newest first: by kind, storefront, product or variant,
     * a page at a time. Names only for a role that reads the audit trail;
     * order links only for one that reads orders.
     */
    async log(
        ctx: OrganizationContext,
        query: StockLogQueryDto,
    ): Promise<StockLogView> {
        const reader = stockReader(ctx);
        const { organizationId } = reader;
        await this.assertFilters(organizationId, query);
        const where: Prisma.StockEntryWhereInput = {
            organizationId,
            ...(query.kind?.length ? { kind: { in: query.kind } } : {}),
            ...(query.storefront ? { storeId: query.storefront } : {}),
            ...(query.product ? { productId: query.product } : {}),
            ...(query.variant ? { variantId: query.variant } : {}),
        };
        const take = query.limit ?? DEFAULT_LOG_PAGE;
        const page = await prisma.stockEntry.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: take + 1,
            ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
            include: {
                store: { select: { name: true } },
                product: { select: { name: true } },
                variant: { select: { title: true } },
                order: { select: { id: true, orderId: true } },
                reversedBy: { select: { id: true } },
            },
        });
        const more = page.length > take;
        const entries = more ? page.slice(0, take) : page;

        const people = new Map<string, string>();
        if (reader.seesPeople) {
            const ids = Array.from(
                new Set(entries.flatMap((e) => e.actorUserId ?? [])),
            );
            const users = ids.length
                ? await prisma.user.findMany({
                      where: { id: { in: ids } },
                      select: { id: true, name: true, email: true },
                  })
                : [];
            for (const u of users)
                people.set(u.id, u.name?.trim() ? u.name : u.email);
        }

        return {
            entries: entries.map((e): StockLogEntry => {
                const undone = e.reversedBy !== null;
                const name = e.actorUserId ? people.get(e.actorUserId) : null;
                return {
                    id: e.id,
                    kind: e.kind,
                    word: STOCK_ENTRY_WORDS[e.kind],
                    quantity: e.quantity,
                    before: e.before,
                    after: e.after,
                    expected: e.expected,
                    counted: e.counted,
                    mismatch:
                        e.kind === "COUNTED" &&
                        countMismatched(e.expected, e.before),
                    storeId: e.storeId,
                    storeName: e.store.name,
                    productId: e.productId,
                    productName: e.product.name,
                    variantId: e.variantId,
                    variantTitle: e.variant?.title ?? null,
                    pairId: e.pairId,
                    reversesId: e.reversesId,
                    undone,
                    canUndo: reader.canWrite && isHandMade(e.kind) && !undone,
                    note: e.note,
                    createdAt: e.createdAt,
                    by:
                        e.actorUserId && name
                            ? { id: e.actorUserId, name }
                            : null,
                    order:
                        reader.seesOrders && e.order
                            ? { id: e.order.id, number: e.order.orderId }
                            : null,
                };
            }),
            nextCursor: more ? entries[entries.length - 1].id : null,
            seesPeople: reader.seesPeople,
            seesOrders: reader.seesOrders,
        };
    }

    /** Every id a filter names must be this business's. */
    private async assertFilters(
        organizationId: string,
        query: StockLogQueryDto,
    ): Promise<void> {
        const [store, product, variant, cursor] = await Promise.all([
            query.storefront
                ? prisma.store.count({
                      where: { id: query.storefront, organizationId },
                  })
                : 1,
            query.product
                ? prisma.product.count({
                      where: { id: query.product, organizationId },
                  })
                : 1,
            query.variant
                ? prisma.productVariant.count({
                      where: { id: query.variant, product: { organizationId } },
                  })
                : 1,
            query.cursor
                ? prisma.stockEntry.count({
                      where: { id: query.cursor, organizationId },
                  })
                : 1,
        ]);
        if (store === 0) throw new NotFoundException("Store not found");
        if (product === 0) throw new NotFoundException("Product not found");
        if (variant === 0) throw new NotFoundException("Variant not found");
        if (cursor === 0) throw new NotFoundException("Stock change not found");
    }
}
