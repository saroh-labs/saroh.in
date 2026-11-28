import {
    BadRequestException,
    HttpException,
    HttpStatus,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";
import { Type } from "class-transformer";
import {
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import { pausedByCut } from "../billing/over-limit";
import { overLimit } from "../billing/over-limit.service";
import { categoryTree } from "../collections/collections.service";
import { realOrderSql } from "../orders/open-orders";
import { orderLocationSql } from "../orders/order-location";
import { SharedRateLimiter } from "../rate-limits/shared-window";
import { businessTracksStock, COUNTING_ROWS } from "../stock/tracking";
import type { CatalogueNeed } from "./catalogue-needs";
import { needsFrom } from "./catalogue-needs";
import { PRODUCT_STATUSES } from "./dto";
import type { ProductsService } from "./products.service";
import { listedAt, openStores } from "./products.service";
import type { CatalogueItemDto } from "./serialize";

/** Stock-sorted catalogue pages a minute, per business (04-F9). */
export const STOCK_SORTS_PER_MINUTE = 30;
const stockSorts = new SharedRateLimiter(
    "catalogue-stock-sorts",
    STOCK_SORTS_PER_MINUTE,
    60_000,
);

/**
 * The Products list, a page at a time (#519). The catalogue read
 * (`GET organizations/:org/products`) returns the whole catalogue as an
 * array to every caller that doesn't ask for a page; with `limit` it
 * returns this: a page of rows after `cursor`, how many match, the counts
 * the list's chips show, and what needs someone — all worked out here, so
 * a screen that holds one page never counts from it.
 *
 * A list with numbered pages asks by `page` (from 1) and `size` instead of
 * a cursor, as the Orders list does.
 */

/** The list's chips: everything, what's in a collection, what counts stock. */
export const CATALOGUE_VIEWS = [
    "all",
    "collections",
    "inventory",
    "needs",
] as const;
export type CatalogueView = (typeof CATALOGUE_VIEWS)[number];

const DEFAULT_PAGE = 50;

/** The sizes a list with numbered pages offers; any other is refused. */
/**
 * How the list is sorted (owner, 15 Nov): newest first (the default), by
 * name, by price, or by stock to sell, lowest first or highest first.
 */
export const CATALOGUE_SORTS = [
    "newest",
    "name",
    "-name",
    "price",
    "-price",
    "stock",
    "-stock",
] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];

export const CATALOGUE_PAGE_SIZES = [10, 25, 50, 100] as const;

/** `?category=none`: the products with no category (Uncategorized). */
export const UNCATEGORIZED = "none";

/**
 * The list's statuses: one, or "CURRENT" — live and draft, what is sold or
 * about to be (DEC-268, the Products list's first view).
 */
export const CATALOGUE_STATUSES = [...PRODUCT_STATUSES, "CURRENT"] as const;
export type CatalogueStatus = (typeof CATALOGUE_STATUSES)[number];

/** How far back "Sold, 30 days" looks (finding 17). */
export const SOLD_DAYS = 30;

export class CatalogueQueryDto {
    @IsOptional()
    @IsIn(CATALOGUE_STATUSES, { message: "Unknown status" })
    status?: CatalogueStatus;

    /** Only what this storefront sells (a filter by listing). */
    @IsOptional()
    @IsString()
    storefront?: string;

    /** Name or SKU, any case. */
    @IsOptional()
    @IsString()
    @MaxLength(120)
    q?: string;

    @IsOptional()
    @IsIn(CATALOGUE_VIEWS, { message: "Unknown view" })
    view?: CatalogueView;

    /** In this category or one inside it; "none" is Uncategorized. */
    @IsOptional()
    @IsString()
    category?: string;

    /** Choosing its variants by this option (Settings › Options' count). */
    @IsOptional()
    @IsString()
    option?: string;

    /** Shown in this collection now. */
    @IsOptional()
    @IsString()
    collection?: string;

    /** The last product of the page before; the next page starts after it. */
    @IsOptional()
    @IsString()
    cursor?: string;

    /** Asking for a page: without it the read is the whole catalogue. */
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;

    /**
     * Or the page by its number, from 1: what a list with numbered pages
     * asks. Read by offset, so a product added while someone pages can move
     * one down a page; the cursor stays for a caller that must not skip.
     */
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: "page must be a whole number" })
    @Min(1)
    @Max(100_000)
    page?: number;

    /** How the rows are sorted; newest first without. */
    @IsOptional()
    @IsIn(CATALOGUE_SORTS, { message: "Unknown sort" })
    sort?: CatalogueSort;

    /** Rows per page, for a list with numbered pages: 10, 25, 50 or 100. */
    @IsOptional()
    @Type(() => Number)
    @IsIn(CATALOGUE_PAGE_SIZES, { message: "size is 10, 25, 50 or 100" })
    size?: number;
}

export interface CataloguePageDto {
    items: CatalogueItemDto[];
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
    /** Products matching every filter, search and view. */
    total: number;
    /** How many rows a page holds: `size`, else `limit`, else the default. */
    pageSize: number;
    /** Each chip's count, within the storefront and status asked for. */
    counts: { all: number; collections: number; inventory: number };
    /**
     * The storefront filter's counts, within the status asked for: every
     * product of the business, and how many each open storefront sells.
     */
    storefronts: {
        everywhere: number;
        byStorefront: { id: string; name: string; count: number }[];
    };
    /**
     * Products (published or draft) that need restocking, most urgent
     * first — judged shelf by shelf, as the Stock screen judges them.
     */
    needs: CatalogueNeed[];
    /**
     * What each product on the page sold in the last {@link SOLD_DAYS}
     * days (finding 17): units, and what they came to. Only for a caller
     * who reads orders' money; a product with no sales is absent.
     */
    sold?: Record<string, { units: number; amount: string }>;
}

const ARCHIVED = "ARCHIVED";

/**
 * Whether `query` asks for a page (it names a `limit`, a `page` or a
 * `size`) rather than the whole catalogue, which every older caller reads
 * as an array.
 */
export function wantsPage(query: CatalogueQueryDto): boolean {
    return (
        query.limit !== undefined ||
        query.page !== undefined ||
        query.size !== undefined
    );
}

/**
 * Products after `at` in the list's order (newest first, then by id): an
 * explicit keyset, so a page never loses a product when the one before it
 * has left the filters since.
 */
export function afterInList(at: {
    id: string;
    createdAt: Date;
}): Prisma.ProductWhereInput {
    return {
        OR: [
            { createdAt: { lt: at.createdAt } },
            { createdAt: at.createdAt, id: { gt: at.id } },
        ],
    };
}

/** Name or SKU contains `q`, any case. */
export function searchWhere(q: string): Prisma.ProductWhereInput {
    return {
        OR: [
            { name: { contains: q, mode: "insensitive" } },
            {
                variants: {
                    some: { sku: { contains: q, mode: "insensitive" } },
                },
            },
        ],
    };
}

/**
 * The Prisma order for a sort that the database can read off the row;
 * null for newest (the default) and for stock, which is a sum
 * (`stockOrderedIds`). The id last, so equal names never swap pages.
 */
export function catalogueOrder(
    sort: CatalogueSort | undefined,
): Prisma.ProductOrderByWithRelationInput[] | null {
    switch (sort) {
        case "name":
        case "-name":
            return [{ name: sort === "name" ? "asc" : "desc" }, { id: "asc" }];
        case "price":
        case "-price":
            return [
                { price: sort === "price" ? "asc" : "desc" },
                { name: "asc" },
                { id: "asc" },
            ];
        default:
            return null;
    }
}

/**
 * Every product matching `where`, by stock to sell (on hand less what is
 * promised, at the open stores), lowest first for "stock". A product that
 * doesn't count stock has no figure and goes last either way, then by name.
 */
async function stockOrderedIds(
    where: Prisma.ProductWhereInput,
    stores: readonly string[],
    sort: "stock" | "-stock",
): Promise<string[]> {
    const rows = await prisma.product.findMany({
        where,
        select: {
            id: true,
            name: true,
            stockTracked: true,
            stockLevels: {
                where: { storeId: { in: [...stores] }, ...COUNTING_ROWS },
                select: { onHand: true, promised: true },
            },
        },
    });
    const sign = sort === "stock" ? 1 : -1;
    const toSell = (r: (typeof rows)[number]) =>
        r.stockTracked && r.stockLevels.length > 0
            ? r.stockLevels.reduce((n, l) => n + l.onHand - l.promised, 0)
            : null;
    return rows
        .map((r) => ({ id: r.id, name: r.name, n: toSell(r) }))
        .sort(
            (a, b) =>
                (a.n === null ? 1 : 0) - (b.n === null ? 1 : 0) ||
                (a.n !== null && b.n !== null ? sign * (a.n - b.n) : 0) ||
                a.name.localeCompare(b.name) ||
                a.id.localeCompare(b.id),
        )
        .map((r) => r.id);
}

export async function cataloguePage(
    products: ProductsService,
    organizationId: string,
    query: CatalogueQueryDto,
    /** `order:read`: the page's sales in the last 30 days. */
    caller: {
        sold: boolean;
        /** Who asks: a location's team counts only its storefronts' orders (DEC-074). */
        who?: Pick<OrganizationContext, "roleKey" | "userId">;
    } = { sold: false },
    now: Date = new Date(),
): Promise<CataloguePageDto> {
    const { storefront } = query;
    // Live and draft is a status of the list's, not a product's (DEC-268).
    const current = query.status === "CURRENT";
    const status = query.status === "CURRENT" ? undefined : query.status;
    const byStatus: Prisma.ProductWhereInput = current
        ? { status: { not: ARCHIVED } }
        : status
          ? { status }
          : {};
    const sorted = query.sort && query.sort !== "newest";
    if (query.cursor && sorted) {
        throw new BadRequestException({
            message: "A sorted list pages by number, not by a cursor.",
            details: { field: "sort" },
        });
    }
    if (query.cursor && query.page) {
        throw new BadRequestException({
            message: "Page by a cursor or a page number, not both.",
            details: { field: "page" },
        });
    }
    const stores = await openStores(organizationId, storefront);
    const base: Prisma.ProductWhereInput = {
        organizationId,
        ...(storefront ? listedAt(storefront) : {}),
        ...byStatus,
    };
    const [tree, collections, tracks] = await Promise.all([
        categoryTree(organizationId),
        prisma.collection.findMany({
            where: { organizationId },
            select: { id: true, categoryId: true },
        }),
        businessTracksStock(prisma, organizationId),
    ]);
    const automatic = [
        ...new Set(
            collections.flatMap((c) =>
                c.categoryId ? tree.within(c.categoryId) : [],
            ),
        ),
    ];
    // What a collection shows: hand-picked members and the categories of
    // automatic ones, never an archived product.
    const inCollections: Prisma.ProductWhereInput = {
        status: { not: ARCHIVED },
        OR: [
            { collections: { some: {} } },
            ...(automatic.length ? [{ categoryId: { in: automatic } }] : []),
        ],
    };
    // Off for the business, nothing counts stock.
    const tracked: Prisma.ProductWhereInput = tracks
        ? { stockTracked: true }
        : { id: { in: [] } };

    const needs = await catalogueNeeds(
        organizationId,
        storefront ? stores.filter((s) => s.id === storefront) : stores,
        base,
    );

    const narrow: Prisma.ProductWhereInput[] = current ? [byStatus] : [];
    const q = query.q?.trim();
    if (q) narrow.push(searchWhere(q));
    if (query.view === "collections") narrow.push(inCollections);
    if (query.view === "inventory") narrow.push(tracked);
    if (query.view === "needs") {
        narrow.push({ id: { in: needs.map((n) => n.productId) } });
    }
    if (query.category === UNCATEGORIZED) {
        narrow.push({ categoryId: null });
    } else if (query.category) {
        const found = await prisma.category.count({
            where: { id: query.category, organizationId },
        });
        if (found === 0) throw new NotFoundException("Category not found");
        narrow.push({ categoryId: { in: tree.within(query.category) } });
    }
    if (query.option) {
        const found = await prisma.productOption.count({
            where: { id: query.option, organizationId },
        });
        if (found === 0) throw new NotFoundException("Option not found");
        narrow.push({ optionId: query.option });
    }
    if (query.collection) {
        const collection = collections.find((c) => c.id === query.collection);
        if (!collection) throw new NotFoundException("Collection not found");
        narrow.push({
            status: { not: ARCHIVED },
            ...(collection.categoryId
                ? { categoryId: { in: tree.within(collection.categoryId) } }
                : {
                      collections: {
                          some: { collectionId: collection.id },
                      },
                  }),
        });
    }
    // The page starts after the cursor's place in the list's order, read
    // from the product itself — whether or not the filters still keep it
    // (restocked out of Needs you, archived out of a collection).
    let after: Prisma.ProductWhereInput | null = null;
    if (query.cursor) {
        const at = await prisma.product.findFirst({
            where: { id: query.cursor, organizationId },
            select: { id: true, createdAt: true },
        });
        if (!at) throw new NotFoundException("Product not found");
        after = afterInList(at);
    }
    const where: Prisma.ProductWhereInput = { AND: narrow };

    const take = query.size ?? query.limit ?? DEFAULT_PAGE;
    const skip = query.page ? (query.page - 1) * take : 0;
    const order = catalogueOrder(query.sort);
    // By stock reads every matching product's levels: limited per business
    // on its own, under the per-person ceiling (04-F9).
    if (query.sort === "stock" || query.sort === "-stock") {
        if (!(await stockSorts.take(organizationId))) {
            throw new HttpException(
                "Too many stock sorts. Wait a moment, then try again.",
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
    }
    // By stock: the order is a sum, worked out over every match, then the
    // page is cut from it (`take + 1` to know if there is more).
    const byStock =
        query.sort === "stock" || query.sort === "-stock"
            ? (
                  await stockOrderedIds(
                      { AND: [base, where] },
                      stores.map((s) => s.id),
                      query.sort,
                  )
              ).slice(skip, skip + take + 1)
            : null;
    const [found, total, all, inColl, inv, everywhere, listed] =
        await Promise.all([
            products.catalogue(
                organizationId,
                { status, storefront },
                byStock
                    ? { where: { id: { in: byStock } } }
                    : {
                          where: after ? { AND: [where, after] } : where,
                          take: take + 1,
                          ...(skip > 0 ? { skip } : {}),
                          ...(order ? { orderBy: order } : {}),
                      },
            ),
            prisma.product.count({ where: { AND: [base, where] } }),
            prisma.product.count({ where: base }),
            prisma.product.count({ where: { AND: [base, inCollections] } }),
            prisma.product.count({ where: { AND: [base, tracked] } }),
            prisma.product.count({
                where: { organizationId, ...byStatus },
            }),
            prisma.productListing.groupBy({
                by: ["storeId"],
                where: {
                    organizationId,
                    storeId: { in: stores.map((s) => s.id) },
                    ...(current || status ? { product: byStatus } : {}),
                },
                _count: { _all: true },
            }),
        ]);
    const page = byStock
        ? byStock.flatMap((id) => found.filter((p) => p.id === id))
        : found;
    const perStore = new Map(listed.map((l) => [l.storeId, l._count._all]));
    const more = page.length > take;
    const items = more ? page.slice(0, take) : page;
    const sold = caller.sold
        ? await soldLately(
              organizationId,
              items.map((i) => i.id),
              now,
              caller.who,
          )
        : undefined;
    return {
        items,
        nextCursor: more ? (items[items.length - 1]?.id ?? null) : null,
        total,
        pageSize: take,
        counts: { all, collections: inColl, inventory: inv },
        storefronts: {
            everywhere,
            byStorefront: stores.map((s) => ({
                id: s.id,
                name: s.name,
                count: perStore.get(s.id) ?? 0,
            })),
        },
        needs,
        ...(sold ? { sold } : {}),
    };
}

/**
 * Units and money each of `productIds` sold in the last {@link SOLD_DAYS}
 * days (finding 17): ONE grouped read over the business's order lines, for
 * the page's products only. Cancelled orders and abandoned checkouts don't
 * count; a line's amount is its price times its quantity.
 */
export async function soldLately(
    organizationId: string,
    productIds: string[],
    now: Date,
    who?: Pick<OrganizationContext, "roleKey" | "userId">,
): Promise<Record<string, { units: number; amount: string }>> {
    if (productIds.length === 0) return {};
    const since = new Date(now.getTime() - SOLD_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<
        { productId: string; units: number; amount: string }[]
    >(Prisma.sql`SELECT oi."productId", SUM(oi.quantity)::int AS units,
            SUM(oi.price * oi.quantity)::numeric(14, 2)::text AS amount
        FROM "OrderItem" oi
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE o."organizationId" = ${organizationId}
            AND oi."productId" = ANY(${productIds})
            AND o."createdAt" >= ${since.toISOString().replace("Z", "")}::timestamp
            AND o.status::text <> 'CANCELLED'
            AND ${realOrderSql()}${orderLocationSql(who, "o")}
        GROUP BY oi."productId"`);
    return Object.fromEntries(
        rows.map((r) => [r.productId, { units: r.units, amount: r.amount }]),
    );
}

/**
 * What needs restocking at `storefronts`, among the products in `base` that
 * count stock and are listed there — never archived, and a draft only
 * when short for orders already placed (no customer can buy it yet) — the
 * same scope as the Stock screen's "Needs you". Every shelf is judged
 * where the storefront sells it (and, for a variant, sells that variant);
 * a storefront that sells it with no shelf yet reads 0, as on Stock.
 * A product a lower plan paused (#800) is hidden from the site: it needs
 * someone only when short for orders already placed, never for out or
 * low, so Needs you never asks to restock it.
 */
export async function catalogueNeeds(
    organizationId: string,
    storefronts: readonly { id: string; name: string }[],
    base: Prisma.ProductWhereInput,
): Promise<CatalogueNeed[]> {
    if (storefronts.length === 0) return [];
    const storeIds = storefronts.map((s) => s.id);
    const [paused, products] = await Promise.all([
        overLimit.pausedNow(organizationId),
        prisma.product.findMany({
            where: {
                AND: [
                    base,
                    { organizationId },
                    COUNTING_ROWS.product,
                    { status: { not: ARCHIVED } },
                    { listings: { some: { storeId: { in: storeIds } } } },
                ],
            },
            select: {
                id: true,
                name: true,
                createdAt: true,
                // A draft needs someone only for orders already placed.
                status: true,
                option: { select: { name: true } },
                variants: {
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                    select: { id: true, title: true },
                },
                listings: {
                    where: { storeId: { in: storeIds } },
                    select: {
                        storeId: true,
                        variants: { select: { variantId: true } },
                    },
                },
                // Every shelf: counting per variant or as a whole is the
                // product's, not one storefront's.
                stockLevels: {
                    select: {
                        storeId: true,
                        variantId: true,
                        onHand: true,
                        promised: true,
                        lowStockAlert: true,
                    },
                },
            },
        }),
    ]);
    const cut = paused?.products ?? null;
    return needsFrom(
        products.map((p) => ({
            ...p,
            shelves: p.stockLevels,
            paused: pausedByCut(p, cut),
        })),
        storefronts,
    );
}
