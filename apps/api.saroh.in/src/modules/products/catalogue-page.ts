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
import type { CatalogueNeed, NeedShelf } from "./catalogue-needs";
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
    /** Published products that need restocking, most urgent first. */
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
        storefront ? [storefront] : stores.map((s) => s.id),
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
    if (query.cursor) {
        const found = await prisma.product.count({
            where: { id: query.cursor, organizationId },
        });
        if (found === 0) throw new NotFoundException("Product not found");
    }
    const where: Prisma.ProductWhereInput = { AND: narrow };

    const take = query.limit ?? DEFAULT_PAGE;
    const [page, total, all, inColl, inv, everywhere, listed] =
        await Promise.all([
            products.catalogue(
                organizationId,
                { status, storefront },
                { where, take: take + 1, cursor: query.cursor },
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
 * What needs restocking, from every shelf the products in `base` have at
 * `storeIds` — only published products that count stock, only where the
 * storefront sells them (and, for a variant's shelf, sells that variant).
 */
export async function catalogueNeeds(
    organizationId: string,
    storeIds: readonly string[],
    base: Prisma.ProductWhereInput,
): Promise<CatalogueNeed[]> {
    if (storeIds.length === 0) return [];
    const rows = await prisma.stockLevel.findMany({
        where: {
            organizationId,
            storeId: { in: [...storeIds] },
            product: {
                AND: [COUNTING_ROWS.product, base, { status: "PUBLISHED" }],
            },
        },
        select: {
            productId: true,
            storeId: true,
            variantId: true,
            onHand: true,
            promised: true,
            lowStockAlert: true,
            product: { select: { name: true } },
        },
    });
    if (rows.length === 0) return [];
    const productIds = [...new Set(rows.map((r) => r.productId))];
    const [listings, listedVariants] = await Promise.all([
        prisma.productListing.findMany({
            where: {
                organizationId,
                storeId: { in: [...storeIds] },
                productId: { in: productIds },
            },
            select: { storeId: true, productId: true },
        }),
        prisma.productListingVariant.findMany({
            where: {
                organizationId,
                productId: { in: productIds },
                listing: { storeId: { in: [...storeIds] } },
            },
            select: { variantId: true, listing: { select: { storeId: true } } },
        }),
    ]);
    const listed = new Set(listings.map((l) => `${l.productId}:${l.storeId}`));
    const variantListed = new Set(
        listedVariants.map((v) => `${v.variantId}:${v.listing.storeId}`),
    );
    const shelves: NeedShelf[] = rows
        .filter((r) =>
            r.variantId
                ? variantListed.has(`${r.variantId}:${r.storeId}`)
                : listed.has(`${r.productId}:${r.storeId}`),
        )
        .map((r) => ({
            productId: r.productId,
            name: r.product.name,
            onHand: r.onHand,
            promised: r.promised,
            lowStockAlert: r.lowStockAlert,
        }));
    return needsFrom(shelves);
}
