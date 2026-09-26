import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
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

import { categoryTree } from "../collections/collections.service";
import { businessTracksStock, COUNTING_ROWS } from "../stock/tracking";
import type { CatalogueNeed } from "./catalogue-needs";
import { needsFrom } from "./catalogue-needs";
import type { ProductStatus } from "./dto";
import { PRODUCT_STATUSES } from "./dto";
import type { ProductsService } from "./products.service";
import { listedAt, openStores } from "./products.service";
import type { CatalogueItemDto } from "./serialize";

/**
 * The Products list, a page at a time (#519). The catalogue read
 * (`GET organizations/:org/products`) returns the whole catalogue as an
 * array to every caller that doesn't ask for a page; with `limit` it
 * returns this: a page of rows after `cursor`, how many match, the counts
 * the list's chips show, and what needs someone — all worked out here, so
 * a screen that holds one page never counts from it.
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

export class CatalogueQueryDto {
    @IsOptional()
    @IsIn(PRODUCT_STATUSES, { message: "Unknown status" })
    status?: ProductStatus;

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

    /** In this category or one inside it. */
    @IsOptional()
    @IsString()
    category?: string;

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
}

export interface CataloguePageDto {
    items: CatalogueItemDto[];
    /** Pass as `cursor` for the next page; null on the last. */
    nextCursor: string | null;
    /** Products matching every filter, search and view. */
    total: number;
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
}

const ARCHIVED = "ARCHIVED";

/**
 * Whether `query` asks for a page (it names a `limit`) rather than the
 * whole catalogue, which every older caller reads as an array.
 */
export function wantsPage(query: CatalogueQueryDto): boolean {
    return query.limit !== undefined;
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

export async function cataloguePage(
    products: ProductsService,
    organizationId: string,
    query: CatalogueQueryDto,
): Promise<CataloguePageDto> {
    const { status, storefront } = query;
    const stores = await openStores(organizationId, storefront);
    const base: Prisma.ProductWhereInput = {
        organizationId,
        ...(storefront ? listedAt(storefront) : {}),
        ...(status ? { status } : {}),
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

    const narrow: Prisma.ProductWhereInput[] = [];
    const q = query.q?.trim();
    if (q) narrow.push(searchWhere(q));
    if (query.view === "collections") narrow.push(inCollections);
    if (query.view === "inventory") narrow.push(tracked);
    if (query.view === "needs") {
        narrow.push({ id: { in: needs.map((n) => n.productId) } });
    }
    if (query.category) {
        const found = await prisma.category.count({
            where: { id: query.category, organizationId },
        });
        if (found === 0) throw new NotFoundException("Category not found");
        narrow.push({ categoryId: { in: tree.within(query.category) } });
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

    const take = query.limit ?? DEFAULT_PAGE;
    const [page, total, all, inColl, inv, everywhere, listed] =
        await Promise.all([
            products.catalogue(
                organizationId,
                { status, storefront },
                {
                    where: after ? { AND: [where, after] } : where,
                    take: take + 1,
                },
            ),
            prisma.product.count({ where: { AND: [base, where] } }),
            prisma.product.count({ where: base }),
            prisma.product.count({ where: { AND: [base, inCollections] } }),
            prisma.product.count({ where: { AND: [base, tracked] } }),
            prisma.product.count({
                where: { organizationId, ...(status ? { status } : {}) },
            }),
            prisma.productListing.groupBy({
                by: ["storeId"],
                where: {
                    organizationId,
                    storeId: { in: stores.map((s) => s.id) },
                    ...(status ? { product: { status } } : {}),
                },
                _count: { _all: true },
            }),
        ]);
    const perStore = new Map(listed.map((l) => [l.storeId, l._count._all]));
    const more = page.length > take;
    const items = more ? page.slice(0, take) : page;
    return {
        items,
        nextCursor: more ? (items[items.length - 1]?.id ?? null) : null,
        total,
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
    };
}

/**
 * What needs restocking at `storefronts`, among the products in `base` that
 * count stock and are listed there — published or draft, never archived,
 * the same scope as the Stock screen's "Needs you". Every shelf is judged
 * where the storefront sells it (and, for a variant, sells that variant);
 * a storefront that sells it with no shelf yet reads 0, as on Stock.
 */
export async function catalogueNeeds(
    organizationId: string,
    storefronts: readonly { id: string; name: string }[],
    base: Prisma.ProductWhereInput,
): Promise<CatalogueNeed[]> {
    if (storefronts.length === 0) return [];
    const storeIds = storefronts.map((s) => s.id);
    const products = await prisma.product.findMany({
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
    });
    return needsFrom(
        products.map((p) => ({ ...p, shelves: p.stockLevels })),
        storefronts,
    );
}
