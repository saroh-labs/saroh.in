import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import type { OrganizationContext } from "../../common/types/organization-context";
import { allows, authorize } from "../organizations/organization-policy";
import { slugify } from "../stores/slug";
import type {
    CreateCollectionDto,
    ProductCollectionsDto,
    UpdateCollectionDto,
} from "./dto";
import { COLLECTION_PRODUCTS_MAX } from "./dto";
import type { WebsitePlacement } from "./website-pages";
import { websitePagesFor } from "./website-pages";

export type CollectionKind = "HAND_PICKED" | "AUTOMATIC";

export interface CollectionSummary {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    kind: CollectionKind;
    /** The category an automatic collection fills itself from. */
    category: { id: string; name: string } | null;
    /** Products it shows now — archived ones never count. */
    productCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CollectionProductRow {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    status: string;
    price: string;
    categoryId: string | null;
}

export interface CollectionDetail extends CollectionSummary {
    /** In order: as picked, or (automatic) by name. */
    products: CollectionProductRow[];
    /** Hand-picked products it keeps while they are archived, not shown. */
    hiddenCount: number;
}

/** A collection one product is in, for the product page. */
export interface ProductCollection {
    id: string;
    name: string;
    kind: CollectionKind;
    category: { id: string; name: string } | null;
    /**
     * Whether the product shows in it now. False only for a hand-picked
     * one while the product is archived: kept, so "Sell again" brings it back.
     */
    showing: boolean;
}

export interface ProductPlacement {
    collections: ProductCollection[];
    website: WebsitePlacement;
}

const ARCHIVED = "ARCHIVED";
const notArchived = { status: { not: ARCHIVED } };

const PRODUCT_ROW = {
    id: true,
    name: true,
    slug: true,
    image: true,
    status: true,
    price: true,
    categoryId: true,
} as const;

const SUMMARY = {
    id: true,
    name: true,
    slug: true,
    description: true,
    categoryId: true,
    category: { select: { id: true, name: true } },
    createdAt: true,
    updatedAt: true,
} as const;

/** Reading collections needs `store:read`; the business comes from the guard. */
export function readCollections(ctx: OrganizationContext): string {
    authorize(ctx, "store:read");
    return ctx.organizationId;
}

/** Changing them needs `store:write`, like every other catalogue change. */
export function writeCollections(ctx: OrganizationContext): string {
    authorize(ctx, "store:read");
    if (!allows(ctx, "store:write")) {
        throw new ForbiddenException("Your role can't change collections.");
    }
    return ctx.organizationId;
}

/**
 * The business's collections (#516). A collection is hand-picked (its
 * products stored, in order) or automatic by category (its products read
 * from the category and the categories inside it when asked, never stored)
 * — never both. Archived products show in neither; a hand-picked membership
 * is kept while its product is archived, so "Sell again" restores it.
 *
 * Every method takes the organization the caller was proved to belong to;
 * a collection, product or category of another business is not found.
 */
/** Why an add would take a hand-picked collection past its cap. */
export function tooManyProducts(has: number): string {
    const room = Math.max(0, COLLECTION_PRODUCTS_MAX - has);
    return room > 0
        ? `A collection holds up to ${COLLECTION_PRODUCTS_MAX} products; this one has room for ${room} more.`
        : `A collection holds up to ${COLLECTION_PRODUCTS_MAX} products, and this one is full.`;
}

/**
 * Why a hand-picked collection's whole list can't be saved: with the members
 * set to Not sold it keeps (the screen doesn't show them), it would pass
 * the cap.
 */
export function tooManyKept(kept: number): string {
    const room = Math.max(0, COLLECTION_PRODUCTS_MAX - kept);
    return `A collection holds up to ${COLLECTION_PRODUCTS_MAX} products. It keeps ${kept} set to Not sold, so this list can have ${room} at most.`;
}

/**
 * Lock collections, in id order, before reading how full they are: two adds
 * racing for the last places then take them one after the other. FOR NO KEY
 * UPDATE, so a membership insert's key check (FOR KEY SHARE) isn't blocked.
 */
async function lockCollections(
    tx: Prisma.TransactionClient,
    ids: readonly string[],
): Promise<void> {
    const sorted = Array.from(new Set(ids)).sort();
    if (sorted.length === 0) return;
    await tx.$queryRaw`SELECT id FROM "Collection" WHERE id = ANY(${sorted}::text[]) ORDER BY id FOR NO KEY UPDATE`;
}

@Injectable()
export class CollectionsService {
    async list(organizationId: string): Promise<CollectionSummary[]> {
        const rows = await prisma.collection.findMany({
            where: { organizationId },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            select: {
                ...SUMMARY,
                _count: {
                    select: { products: { where: { product: notArchived } } },
                },
            },
        });
        const tree = await categoryTree(organizationId);
        const automatic = rows.flatMap((r) =>
            r.categoryId ? [r.categoryId] : [],
        );
        const counts = automatic.length
            ? await prisma.product.groupBy({
                  by: ["categoryId"],
                  where: {
                      organizationId,
                      ...notArchived,
                      categoryId: {
                          in: [
                              ...new Set(
                                  automatic.flatMap((id) => tree.within(id)),
                              ),
                          ],
                      },
                  },
                  _count: { _all: true },
              })
            : [];
        const byCategory = new Map(
            counts.map((c) => [c.categoryId, c._count._all]),
        );
        return rows.map((r) =>
            summary(
                r,
                r.categoryId
                    ? tree
                          .within(r.categoryId)
                          .reduce((n, id) => n + (byCategory.get(id) ?? 0), 0)
                    : r._count.products,
            ),
        );
    }

    async get(
        organizationId: string,
        collectionId: string,
    ): Promise<CollectionDetail> {
        const row = await this.require(organizationId, collectionId);
        if (row.categoryId) {
            const tree = await categoryTree(organizationId);
            const products = await prisma.product.findMany({
                where: {
                    organizationId,
                    ...notArchived,
                    categoryId: { in: tree.within(row.categoryId) },
                },
                orderBy: [{ name: "asc" }, { id: "asc" }],
                select: PRODUCT_ROW,
            });
            return {
                ...summary(row, products.length),
                products: products.map(productRow),
                hiddenCount: 0,
            };
        }
        const members = await prisma.collectionProduct.findMany({
            where: { collectionId, organizationId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { product: { select: PRODUCT_ROW } },
        });
        const shown = members
            .map((m) => m.product)
            .filter((p) => p.status !== ARCHIVED);
        return {
            ...summary(row, shown.length),
            products: shown.map(productRow),
            hiddenCount: members.length - shown.length,
        };
    }

    async create(
        organizationId: string,
        dto: CreateCollectionDto,
    ): Promise<CollectionDetail> {
        const slug = slugify(dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Use a few letters or numbers in the name.",
                field: "name",
            });
        }
        const productIds = dto.productIds ?? [];
        if (dto.categoryId && productIds.length > 0) {
            throw new BadRequestException({
                message:
                    "An automatic collection fills itself from its category — pick products or a category, not both.",
                field: "productIds",
            });
        }
        await this.assertNameFree(organizationId, dto.name, slug);
        if (dto.categoryId)
            await requireCategory(organizationId, dto.categoryId);
        await requireProducts(organizationId, productIds);

        const created = await prisma
            .$transaction(async (tx) => {
                const collection = await tx.collection.create({
                    data: {
                        organizationId,
                        name: dto.name,
                        slug,
                        description: dto.description ?? null,
                        categoryId: dto.categoryId ?? null,
                    },
                    select: { id: true },
                });
                if (productIds.length > 0) {
                    await tx.collectionProduct.createMany({
                        data: productIds.map((productId, position) => ({
                            collectionId: collection.id,
                            organizationId,
                            productId,
                            position,
                        })),
                    });
                }
                return collection;
            })
            .catch((error: unknown) => {
                // Another request took the name between the check and here.
                if (isUniqueViolation(error)) {
                    throw new ConflictException({
                        message: `There is already a collection called ${dto.name}.`,
                        field: "name",
                    });
                }
                throw error;
            });
        return this.get(organizationId, created.id);
    }

    /**
     * Rename, describe, or (automatic only) point at another category. The
     * kind never changes: a hand-picked collection's picks would be lost, an
     * automatic one has none to keep — make a new one instead.
     */
    async update(
        organizationId: string,
        collectionId: string,
        dto: UpdateCollectionDto,
    ): Promise<CollectionDetail> {
        const current = await this.require(organizationId, collectionId);
        if (dto.categoryId !== undefined && !current.categoryId) {
            throw new ConflictException({
                message: `${current.name} is hand-picked, so it can't fill itself from a category. Make a new collection for that.`,
                field: "categoryId",
            });
        }
        if (dto.categoryId)
            await requireCategory(organizationId, dto.categoryId);
        if (dto.name !== undefined && dto.name !== current.name) {
            await this.assertNameFree(
                organizationId,
                dto.name,
                null,
                collectionId,
            );
        }
        await prisma.collection.update({
            where: { id: collectionId },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.description !== undefined
                    ? { description: dto.description }
                    : {}),
                ...(dto.categoryId ? { categoryId: dto.categoryId } : {}),
            },
        });
        return this.get(organizationId, collectionId);
    }

    /** Delete a collection. Its products stay as they are. */
    async remove(
        organizationId: string,
        collectionId: string,
    ): Promise<{ id: string }> {
        await this.require(organizationId, collectionId);
        await prisma.collection.delete({ where: { id: collectionId } });
        return { id: collectionId };
    }

    /** Add products to the end of a hand-picked collection. */
    async addProducts(
        organizationId: string,
        collectionId: string,
        productIds: string[],
    ): Promise<CollectionDetail> {
        await this.requireHandPicked(organizationId, collectionId);
        await requireProducts(organizationId, productIds);
        await prisma.$transaction(async (tx) => {
            await lockCollections(tx, [collectionId]);
            const members = await tx.collectionProduct.findMany({
                where: { collectionId },
                select: { productId: true, position: true },
            });
            const had = new Set(members.map((m) => m.productId));
            const adding = Array.from(new Set(productIds)).filter(
                (id) => !had.has(id),
            );
            // A hand-picked collection holds COLLECTION_PRODUCTS_MAX at
            // most, so setProducts can always send its whole list.
            if (members.length + adding.length > COLLECTION_PRODUCTS_MAX) {
                throw new BadRequestException({
                    message: tooManyProducts(members.length),
                    field: "productIds",
                });
            }
            const start =
                members.reduce((n, m) => Math.max(n, m.position), -1) + 1;
            await tx.collectionProduct.createMany({
                data: adding.map((productId, i) => ({
                    collectionId,
                    organizationId,
                    productId,
                    position: start + i,
                })),
                skipDuplicates: true,
            });
        });
        return this.get(organizationId, collectionId);
    }

    /**
     * The whole ordered list of a hand-picked collection's products. Archived
     * members the screen doesn't show are kept (after the list), so saving
     * the order never drops what "Sell again" would bring back.
     */
    async setProducts(
        organizationId: string,
        collectionId: string,
        productIds: string[],
    ): Promise<CollectionDetail> {
        await this.requireHandPicked(organizationId, collectionId);
        await requireProducts(organizationId, productIds);
        await prisma.$transaction(async (tx) => {
            await lockCollections(tx, [collectionId]);
            const hidden = await tx.collectionProduct.findMany({
                where: {
                    collectionId,
                    productId: { notIn: productIds },
                    product: { status: ARCHIVED },
                },
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                select: { productId: true },
            });
            const order = [...productIds, ...hidden.map((h) => h.productId)];
            // The members kept count too: the cap holds on every save.
            if (order.length > COLLECTION_PRODUCTS_MAX) {
                throw new BadRequestException({
                    message: tooManyKept(hidden.length),
                    field: "productIds",
                });
            }
            await tx.collectionProduct.deleteMany({ where: { collectionId } });
            if (order.length > 0) {
                await tx.collectionProduct.createMany({
                    data: order.map((productId, position) => ({
                        collectionId,
                        organizationId,
                        productId,
                        position,
                    })),
                });
            }
        });
        return this.get(organizationId, collectionId);
    }

    /** Take one product out of a hand-picked collection. */
    async removeProduct(
        organizationId: string,
        collectionId: string,
        productId: string,
    ): Promise<CollectionDetail> {
        await this.requireHandPicked(organizationId, collectionId);
        await requireProducts(organizationId, [productId]);
        await prisma.collectionProduct.deleteMany({
            where: { collectionId, productId },
        });
        return this.get(organizationId, collectionId);
    }

    /**
     * The collections a product is in and the live website pages that show
     * it — the product page's cards (#516).
     */
    async forProduct(
        organizationId: string,
        productId: string,
    ): Promise<ProductPlacement> {
        return productPlacement(organizationId, productId);
    }

    /**
     * Put a product in exactly these hand-picked collections (the product
     * page's sheet). An automatic one can't be picked: it follows the
     * category.
     */
    async setForProduct(
        organizationId: string,
        productId: string,
        dto: ProductCollectionsDto,
    ): Promise<ProductPlacement> {
        await requireProducts(organizationId, [productId]);
        const wanted = await prisma.collection.findMany({
            where: { organizationId, id: { in: dto.collectionIds } },
            select: {
                id: true,
                name: true,
                category: { select: { name: true } },
            },
        });
        if (wanted.length !== dto.collectionIds.length) {
            throw new NotFoundException("Collection not found");
        }
        const automatic = wanted.find((c) => c.category);
        if (automatic?.category) {
            throw new ConflictException(
                fillsItself(automatic.name, automatic.category.name),
            );
        }
        await prisma.$transaction(async (tx) => {
            // The collections it joins, locked before their sizes are read.
            await lockCollections(tx, dto.collectionIds);
            await tx.collectionProduct.deleteMany({
                where: {
                    organizationId,
                    productId,
                    collectionId: { notIn: dto.collectionIds },
                },
            });
            if (dto.collectionIds.length === 0) return;
            // One read for every collection's size and last place, one write
            // for the new memberships (each goes at the end).
            const [sizes, already] = await Promise.all([
                tx.collectionProduct.groupBy({
                    by: ["collectionId"],
                    where: { collectionId: { in: dto.collectionIds } },
                    _max: { position: true },
                    _count: { _all: true },
                    orderBy: { collectionId: "asc" },
                }),
                tx.collectionProduct.findMany({
                    where: {
                        productId,
                        collectionId: { in: dto.collectionIds },
                    },
                    select: { collectionId: true },
                }),
            ]);
            const inIt = new Set(already.map((m) => m.collectionId));
            const byId = new Map(sizes.map((g) => [g.collectionId, g]));
            const joining = dto.collectionIds.filter((id) => !inIt.has(id));
            const full = joining.find(
                (id) =>
                    (byId.get(id)?._count._all ?? 0) >= COLLECTION_PRODUCTS_MAX,
            );
            if (full) {
                const name = wanted.find((c) => c.id === full)?.name ?? "";
                throw new BadRequestException({
                    message: `${name} already holds ${COLLECTION_PRODUCTS_MAX} products, the most a collection can.`,
                    field: "collectionIds",
                });
            }
            await tx.collectionProduct.createMany({
                data: joining.map((collectionId) => ({
                    collectionId,
                    organizationId,
                    productId,
                    position: (byId.get(collectionId)?._max.position ?? -1) + 1,
                })),
                skipDuplicates: true,
            });
        });
        return this.forProduct(organizationId, productId);
    }

    private async require(organizationId: string, collectionId: string) {
        const row = await prisma.collection.findFirst({
            where: { id: collectionId, organizationId },
            select: SUMMARY,
        });
        if (!row) throw new NotFoundException("Collection not found");
        return row;
    }

    /** Only a hand-picked collection has products to add, order or remove. */
    private async requireHandPicked(
        organizationId: string,
        collectionId: string,
    ): Promise<void> {
        const row = await this.require(organizationId, collectionId);
        if (row.category) {
            throw new ConflictException(
                fillsItself(row.name, row.category.name),
            );
        }
    }

    /** Names are unique per business, ignoring case, and so are addresses. */
    private async assertNameFree(
        organizationId: string,
        name: string,
        slug: string | null,
        exceptId?: string,
    ): Promise<void> {
        const clash = await prisma.collection.findFirst({
            where: {
                organizationId,
                OR: [
                    { name: { equals: name, mode: "insensitive" } },
                    ...(slug ? [{ slug }] : []),
                ],
                ...(exceptId ? { id: { not: exceptId } } : {}),
            },
            select: { name: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `There is already a collection called ${clash.name}.`,
                field: "name",
            });
        }
    }
}

/**
 * A product's collections and the live website pages that show it — shared
 * by the collections route and the product overview.
 */
export async function productPlacement(
    organizationId: string,
    productId: string,
): Promise<ProductPlacement> {
    const collections = await productCollections(organizationId, productId);
    return {
        collections,
        website: await websitePagesFor(organizationId, {
            productId,
            collectionIds: collections
                .filter((c) => c.showing)
                .map((c) => c.id),
        }),
    };
}

/**
 * The collections a product is in: the hand-picked ones that hold it, and
 * the automatic ones whose category (or a category above its own) it is in.
 * An archived product shows in none; its hand-picked ones are listed with
 * `showing: false`, because "Sell again" brings them back.
 */
export async function productCollections(
    organizationId: string,
    productId: string,
): Promise<ProductCollection[]> {
    const product = await prisma.product.findFirst({
        where: { id: productId, organizationId },
        select: {
            status: true,
            categoryId: true,
            collections: {
                select: {
                    collection: {
                        select: { id: true, name: true },
                    },
                },
            },
        },
    });
    if (!product) throw new NotFoundException("Product not found");
    const archived = product.status === ARCHIVED;
    const picked: ProductCollection[] = product.collections.map((m) => ({
        id: m.collection.id,
        name: m.collection.name,
        kind: "HAND_PICKED",
        category: null,
        showing: !archived,
    }));
    let automatic: ProductCollection[] = [];
    if (!archived && product.categoryId) {
        const tree = await categoryTree(organizationId);
        const rows = await prisma.collection.findMany({
            where: {
                organizationId,
                categoryId: { in: tree.above(product.categoryId) },
            },
            select: {
                id: true,
                name: true,
                category: { select: { id: true, name: true } },
            },
        });
        automatic = rows.map((c) => ({
            id: c.id,
            name: c.name,
            kind: "AUTOMATIC",
            category: c.category,
            showing: true,
        }));
    }
    return [...picked, ...automatic].sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "P2002"
    );
}

/** "Fresh bread fills itself from Breads, so … Change its category instead." */
function fillsItself(collection: string, category: string): string {
    return `${collection} fills itself from ${category}, so its products can't be picked by hand. Change its category instead.`;
}

async function requireCategory(
    organizationId: string,
    categoryId: string,
): Promise<void> {
    const found = await prisma.category.findFirst({
        where: { id: categoryId, organizationId },
        select: { id: true },
    });
    if (!found) throw new NotFoundException("Category not found");
}

/** Every id must be one of the business's products; otherwise not found. */
async function requireProducts(
    organizationId: string,
    productIds: string[],
): Promise<void> {
    if (productIds.length === 0) return;
    const found = await prisma.product.count({
        where: { organizationId, id: { in: productIds } },
    });
    if (found !== new Set(productIds).size) {
        throw new NotFoundException("Product not found");
    }
}

/**
 * The business's categories as a tree: a category with the ones inside it
 * (what an automatic collection fills itself from — the same reach a
 * category discount has), and a category with the ones above it.
 */
export async function categoryTree(organizationId: string) {
    const rows = await prisma.category.findMany({
        where: { organizationId },
        select: { id: true, parentId: true },
    });
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    const children = new Map<string, string[]>();
    for (const r of rows) {
        if (!r.parentId) continue;
        children.set(r.parentId, [...(children.get(r.parentId) ?? []), r.id]);
    }
    return {
        within(id: string): string[] {
            const out: string[] = [];
            const queue = [id];
            const seen = new Set<string>();
            while (queue.length > 0) {
                const next = queue.shift();
                if (next === undefined || seen.has(next)) continue;
                seen.add(next);
                out.push(next);
                queue.push(...(children.get(next) ?? []));
            }
            return out;
        },
        above(id: string): string[] {
            const out: string[] = [];
            const seen = new Set<string>();
            let cursor: string | null | undefined = id;
            while (cursor && !seen.has(cursor)) {
                seen.add(cursor);
                out.push(cursor);
                cursor = parentOf.get(cursor);
            }
            return out;
        },
    };
}

function summary(
    row: {
        id: string;
        name: string;
        slug: string;
        description: string | null;
        category: { id: string; name: string } | null;
        createdAt: Date;
        updatedAt: Date;
    },
    productCount: number,
): CollectionSummary {
    return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        kind: row.category ? "AUTOMATIC" : "HAND_PICKED",
        category: row.category,
        productCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function productRow(p: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    status: string;
    price: { toString(): string };
    categoryId: string | null;
}): CollectionProductRow {
    return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: p.image,
        status: p.status,
        price: toMoneyString(p.price),
        categoryId: p.categoryId,
    };
}
