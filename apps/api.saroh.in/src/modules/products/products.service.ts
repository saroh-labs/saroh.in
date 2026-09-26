import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import {
    checkProductAllergens,
    productAllergensFor,
    saveProductAllergens,
} from "../catalogue/allergens.service";
import {
    checkProductFieldValues,
    productFieldsFor,
    saveProductFieldValues,
} from "../catalogue/fields.service";
import { isGstRate } from "../invoices/gst";
import { PRODUCT_HAS_STOCK_HISTORY } from "../stock/stock-words";
import { COUNTING_ROWS } from "../stock/tracking";
import {
    assertCurrencyChangeAllowed,
    defaultProductCurrency,
} from "../stores/currency";
import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type {
    CreateProductDto,
    PatchProductDto,
    ProductStatus,
    UpdateProductDto,
} from "./dto";
import { listAt } from "./listings.service";
import { promisesToMove } from "./open-promises";
import type { ProductScope } from "./product-access";
import { ProductAccess } from "./product-access";
import { duplicateProduct } from "./product-duplicate";
import {
    assertDetailsCoherent,
    assertMrpAtOrAbovePrice,
    cleanShopFields,
} from "./product-rules";
import type { CatalogueItemDto } from "./serialize";
import {
    cleanDescription,
    readShopFields,
    serializeCatalogueItem,
    serializeProductDetail,
    serializeProductListItem,
} from "./serialize";
import { lockProduct, lockProductStock } from "./stock-levels";

const STOCK_ROW = {
    select: { onHand: true, promised: true, lowStockAlert: true },
} as const;

/**
 * The business's open storefronts, first made first; a `storefront` that
 * isn't one of them is not found.
 */
export async function openStores(
    organizationId: string,
    storefront?: string,
): Promise<{ id: string; name: string }[]> {
    const stores = await prisma.store.findMany({
        where: { organizationId, deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
    });
    if (storefront && !stores.some((s) => s.id === storefront)) {
        throw new NotFoundException("Store not found");
    }
    return stores;
}

/** Sold at `storeId` (#510): the product has a listing there. */
export function listedAt(storeId: string) {
    return {
        listings: { some: { storeId } },
    } satisfies Prisma.ProductWhereInput;
}

/**
 * Everything a product page or the editor needs about one product, as the
 * storefront `storeId` sees it: its shelf there and which variants it sells.
 */
export const productDetailInclude = (storeId: string) =>
    ({
        category: { select: { id: true, name: true } },
        variants: {
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            include: {
                stockLevels: {
                    where: { storeId, ...COUNTING_ROWS },
                    ...STOCK_ROW,
                },
                listings: {
                    where: { listing: { storeId } },
                    select: { id: true },
                },
            },
        },
        images: { orderBy: { position: "asc" } },
        stockLevels: {
            where: { storeId, variantId: null, ...COUNTING_ROWS },
            ...STOCK_ROW,
        },
        // Where it sells, and where it is marked Sold out by hand (#515).
        listings: {
            where: { store: { deletedAt: null } },
            orderBy: [{ store: { createdAt: "asc" } }, { storeId: "asc" }],
            select: {
                storeId: true,
                soldOutAt: true,
                store: { select: { name: true } },
            },
        },
        option: {
            select: {
                id: true,
                name: true,
                values: {
                    select: { id: true, value: true },
                    orderBy: { position: "asc" },
                },
            },
        },
    }) satisfies Prisma.ProductInclude;

/** Key points are one line each: trimmed, and blank lines dropped. */
/**
 * A product's GST rate (ADR-008): one GST has, or null to clear it. Refused
 * on the rate's own field, so the editor can put the message there.
 */
function checkGstRate(rate: string | null | undefined): string | null {
    if (rate === undefined || rate === null) return null;
    if (!isGstRate(rate)) {
        throw new BadRequestException({
            message: `${rate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
            field: "gstRate",
        });
    }
    return rate;
}

function cleanKeyPoints(points: string[] | undefined): string[] {
    return (points ?? []).map((p) => p.trim()).filter((p) => p !== "");
}

/**
 * Whether a write failed on the one unique a product has besides its id:
 * its address in the store. Anything else is rethrown, not called a clash.
 */
function isSlugClash(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const { code, meta } = error as { code?: unknown; meta?: unknown };
    if (code !== "P2002") return false;
    // Driver adapters don't always name the target; when it is named, it
    // must be the slug.
    return meta === undefined || JSON.stringify(meta).includes("slug");
}

/**
 * Postgres gave up on the transaction over a lock: a deadlock (40P01) or a
 * write conflict, which Prisma reports as P2034, or as a raw query's P2010
 * naming the Postgres code.
 */
function isLockConflict(error: unknown): boolean {
    if (typeof error !== "object" || error === null) return false;
    const { code, meta, message } = error as {
        code?: unknown;
        meta?: unknown;
        message?: unknown;
    };
    if (code === "P2034") return true;
    const text = `${JSON.stringify(meta ?? null)} ${typeof message === "string" ? message : ""}`;
    return text.includes("40P01") || text.includes("deadlock detected");
}

/** Never null over the wire in a patch: a null there means "not sent". */
const REQUIRED_IN_PATCH = new Set<keyof PatchProductDto>([
    "name",
    "slug",
    "price",
    "status",
    "madeHere",
    "returnsMode",
]);

/**
 * The business's catalogue (#531). Every method that does the work takes a
 * `ProductScope` — the business, the storefront whose shelf is read, and
 * what the caller may do — resolved by `ProductAccess` from either the
 * organization route or an old storefront route. The storefront-shaped
 * methods (`list(storeId, userId)`, `get(storeId, productId, userId)`, …)
 * are those routes' aliases: resolve, then call the scoped method. Prices
 * are Decimal in the DB and serialize to strings over HTTP (money stays
 * exact).
 */
@Injectable()
export class ProductsService {
    /** Who may do what; shared by the variants, stock and photos services. */
    readonly access: ProductAccess;

    constructor(
        stores: StoresService,
        // @Optional for the same reason ModuleLifecycleService's is: this
        // service is also constructed directly in DB-backed specs, which pass
        // only what they exercise. Requiring it made every such construction
        // throw on first write. `app.bootstrap.spec` asserts it IS resolved in
        // the real graph, so optional here cannot become silently inert (#176).
        @Optional() private readonly activation?: ActivationEvents,
        @Optional() access?: ProductAccess,
    ) {
        this.access = access ?? new ProductAccess(stores);
    }

    /**
     * The business's catalogue: one row per product, with each storefront
     * that sells it and its stock there. `storefront` narrows it to the
     * products that storefront sells (a filter by listing, not a scope).
     */
    async catalogue(
        organizationId: string,
        filter: { status?: ProductStatus; storefront?: string } = {},
        /**
         * A page of it (#519): narrowed further by `where`, `take` rows after
         * the product `cursor`, in the same order. Left out, all of it.
         */
        page: {
            where?: Prisma.ProductWhereInput;
            take?: number;
            cursor?: string;
        } = {},
    ): Promise<CatalogueItemDto[]> {
        const { status, storefront } = filter;
        const stores = await openStores(organizationId, storefront);
        const open = stores.map((s) => s.id);
        const products = await prisma.product.findMany({
            where: {
                organizationId,
                ...(storefront ? listedAt(storefront) : {}),
                ...(status ? { status } : {}),
                ...(page.where ? { AND: [page.where] } : {}),
            },
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            ...(page.take !== undefined ? { take: page.take } : {}),
            ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
            include: {
                category: { select: { id: true, name: true } },
                _count: { select: { variants: true } },
                listings: {
                    where: { storeId: { in: open } },
                    select: { storeId: true, soldOutAt: true },
                },
                variants: {
                    select: {
                        id: true,
                        sku: true,
                        title: true,
                        price: true,
                        stockLevels: {
                            where: { storeId: { in: open }, ...COUNTING_ROWS },
                            select: { storeId: true, ...STOCK_ROW.select },
                        },
                        listings: {
                            where: { listing: { storeId: { in: open } } },
                            select: { listing: { select: { storeId: true } } },
                        },
                    },
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                },
                stockLevels: {
                    where: {
                        storeId: { in: open },
                        variantId: null,
                        ...COUNTING_ROWS,
                    },
                    select: { storeId: true, ...STOCK_ROW.select },
                },
            },
        });
        return products.map((p) =>
            serializeCatalogueItem(p, stores, storefront),
        );
    }

    /** Store-route alias of `listIn`. */
    async list(storeId: string, userId: string, status?: ProductStatus) {
        return this.listIn(
            await this.access.readViaStore(storeId, userId),
            status,
        );
    }

    /** What one storefront sells, optionally filtered by status. */
    async listIn(scope: ProductScope, status?: ProductStatus) {
        const { storeId } = scope;
        const products = await prisma.product.findMany({
            where: { ...listedAt(storeId), ...(status ? { status } : {}) },
            orderBy: { createdAt: "desc" },
            include: {
                category: { select: { id: true, name: true } },
                // Enough to draw a catalogue row: the variant count, the SKU
                // the product is known by, and its stock.
                _count: { select: { variants: true } },
                // Every variant, briefly: an order is taken for one of them.
                // Its stock here too, for a product that counts per variant,
                // and whether this storefront sells it.
                variants: {
                    select: {
                        id: true,
                        sku: true,
                        title: true,
                        price: true,
                        stockLevels: {
                            where: { storeId, ...COUNTING_ROWS },
                            ...STOCK_ROW,
                        },
                        listings: {
                            where: { listing: { storeId } },
                            select: { id: true },
                        },
                    },
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                },
                stockLevels: {
                    where: { storeId, variantId: null, ...COUNTING_ROWS },
                    ...STOCK_ROW,
                },
                // Marked Sold out by hand here (#515).
                listings: {
                    where: { storeId },
                    select: { storeId: true, soldOutAt: true },
                },
            },
        });
        return products.map((p) => serializeProductListItem(p, storeId));
    }

    /** Store-route alias of `getIn`. */
    async get(storeId: string, productId: string, userId: string) {
        return this.getIn(
            await this.access.readViaStore(storeId, userId, productId),
            productId,
        );
    }

    /** One product with its variants, as the scope's storefront sees it. */
    async getIn(scope: ProductScope, productId: string) {
        const { storeId, organizationId } = scope;
        const product = await prisma.product.findFirst({
            where: { id: productId, organizationId },
            include: productDetailInclude(storeId),
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        const detail = serializeProductDetail(product, storeId);
        const [customFields, allergens, variantPromises] = await Promise.all([
            productFieldsFor(organizationId, product.id, product.categoryId),
            productAllergensFor(product.id),
            // Still counting as a whole: what each variant will take with it
            // when it switches, so the editor can seed the counts.
            detail.stockMode === "product" && product.variants.length > 0
                ? promisesToMove(prisma, product.id, storeId)
                : Promise.resolve({}),
        ]);
        return { ...detail, customFields, allergens, variantPromises };
    }

    /** Store-route alias of `createIn`: made and listed at `storeId`. */
    async create(storeId: string, userId: string, dto: CreateProductDto) {
        return this.createIn(
            await this.access.writeViaStore(storeId, userId),
            dto,
        );
    }

    /** A new catalogue product, listed at the scope's storefront. */
    async createIn(scope: ProductScope, dto: CreateProductDto) {
        const { organizationId, storeId } = scope;
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(organizationId, slug);
        await this.assertCategoryOf(organizationId, dto.categoryId);
        await this.assertOptionOf(organizationId, dto.optionId);
        assertMrpAtOrAbovePrice(dto.price, dto.mrp ?? null);
        assertDetailsCoherent({
            madeHere: dto.madeHere ?? true,
            maker: dto.maker ?? null,
            returnsMode: dto.returnsMode ?? "STOREFRONT",
            returnsText: dto.returnsText ?? null,
        });
        const shopFields = cleanShopFields(dto.shopFields ?? {});
        // Checked before the product exists, so a refused value or allergen
        // never leaves a half-made product behind.
        if (dto.customFields)
            await checkProductFieldValues(organizationId, dto.customFields);
        if (dto.contains || dto.mayContain)
            await checkProductAllergens(organizationId, {
                contains: dto.contains,
                mayContain: dto.mayContain,
            });

        let createdId: string;
        try {
            // The business's product, sold at the storefront it is made at.
            createdId = await prisma.$transaction(async (tx) => {
                // Left out: the storefront's currency, else the business's
                // (DEC-030) — never a USD guess.
                const currency =
                    dto.currency ??
                    (await defaultProductCurrency(tx, {
                        storeId,
                        organizationId,
                    })) ??
                    undefined;
                const product = await tx.product.create({
                    data: {
                        storeId,
                        organizationId,
                        name: dto.name,
                        slug,
                        description: cleanDescription(dto.description),
                        image: dto.image ?? null,
                        categoryId: dto.categoryId ?? null,
                        price: dto.price,
                        mrp: dto.mrp ?? null,
                        currency,
                        status: dto.status ?? "DRAFT",
                        archivedAt:
                            dto.status === "ARCHIVED" ? new Date() : null,
                        howToUse: dto.howToUse ?? null,
                        materials: dto.materials ?? null,
                        keyPoints: cleanKeyPoints(dto.keyPoints),
                        madeHere: dto.madeHere ?? true,
                        maker: dto.maker ?? null,
                        madeIn: dto.madeIn ?? null,
                        supplierCode: dto.supplierCode ?? null,
                        gstRate: checkGstRate(dto.gstRate),
                        hsnCode: dto.hsnCode ?? null,
                        warranty: dto.warranty ?? null,
                        returnsMode: dto.returnsMode ?? "STOREFRONT",
                        returnsText: dto.returnsText ?? null,
                        shopFields,
                        seoTitle: dto.seoTitle ?? null,
                        seoDescription: dto.seoDescription ?? null,
                        optionId: dto.optionId ?? null,
                    },
                    select: { id: true },
                });
                await listAt(tx, {
                    organizationId,
                    productId: product.id,
                    storeId,
                });
                return product.id;
            });
        } catch (error) {
            if (!isSlugClash(error)) throw error;
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
        if (dto.customFields) {
            await saveProductFieldValues(
                organizationId,
                createdId,
                dto.customFields,
            );
        }
        if (dto.contains || dto.mayContain) {
            await saveProductAllergens(organizationId, createdId, {
                contains: dto.contains,
                mayContain: dto.mayContain,
            });
        }
        await this.activation?.firstProductCreated(organizationId, createdId);
        return { id: createdId };
    }

    /** Store-route alias of `updateIn`. */
    async update(
        storeId: string,
        productId: string,
        userId: string,
        dto: UpdateProductDto,
    ) {
        return this.updateIn(
            await this.access.writeViaStore(storeId, userId, productId),
            productId,
            dto,
        );
    }

    async updateIn(
        scope: ProductScope,
        productId: string,
        dto: UpdateProductDto,
    ) {
        const { organizationId } = scope;
        const current = await prisma.product.findFirst({
            where: { id: productId, organizationId },
            select: { slug: true, status: true, currency: true },
        });
        if (!current) {
            throw new NotFoundException("Product not found");
        }
        const slug = slugify(dto.slug);
        // Left out, the product keeps its currency. Changed, every
        // storefront that sells it must sell in the new one (DEC-030).
        if (dto.currency && dto.currency !== current.currency) {
            await assertCurrencyChangeAllowed(prisma, {
                productId,
                name: dto.name,
                currency: dto.currency,
            });
        }
        if (current.slug !== slug) {
            await this.assertSlugFree(organizationId, slug);
        }
        await this.assertCategoryOf(
            organizationId,
            dto.categoryId ?? undefined,
        );

        try {
            await prisma.product.update({
                where: { id: productId },
                data: {
                    name: dto.name,
                    slug,
                    description: cleanDescription(dto.description),
                    image: dto.image ?? null,
                    categoryId: dto.categoryId ?? null,
                    price: dto.price,
                    ...(dto.currency ? { currency: dto.currency } : {}),
                    ...(dto.status
                        ? {
                              status: dto.status,
                              // As patch() does: stamped on the way in,
                              // cleared on the way out.
                              ...(dto.status !== "ARCHIVED"
                                  ? { archivedAt: null }
                                  : current.status !== "ARCHIVED"
                                    ? { archivedAt: new Date() }
                                    : {}),
                          }
                        : {}),
                },
            });
            return { id: productId };
        } catch (error) {
            if (!isSlugClash(error)) throw error;
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /**
     * Save one section of the editor: only the fields present change.
     *
     * Cross-field rules are judged on the product AFTER the patch — an MRP
     * sent alone is compared with the stored price, a returns mode sent alone
     * with the stored text — so saving one section can never leave another
     * incoherent. Returns the whole product so the section can re-baseline.
     */
    async patch(
        storeId: string,
        productId: string,
        userId: string,
        dto: PatchProductDto,
    ) {
        return this.patchIn(
            await this.access.writeViaStore(storeId, userId, productId),
            productId,
            dto,
        );
    }

    /** One editor section's save (see `patch`); returns the whole product. */
    async patchIn(
        scope: ProductScope,
        productId: string,
        dto: PatchProductDto,
    ) {
        const { organizationId } = scope;
        const current = await prisma.product.findFirst({
            where: { id: productId, organizationId },
            select: {
                slug: true,
                price: true,
                mrp: true,
                madeHere: true,
                maker: true,
                returnsMode: true,
                returnsText: true,
                shopFields: true,
                status: true,
                optionId: true,
                _count: { select: { variants: true } },
            },
        });

        if (!current) {
            throw new NotFoundException("Product not found");
        }

        const has = (key: keyof PatchProductDto) =>
            REQUIRED_IN_PATCH.has(key)
                ? dto[key] != null
                : dto[key] !== undefined;
        const data: Record<string, unknown> = {};

        if (has("name")) data.name = dto.name;
        if (has("slug")) {
            const slug = slugify(dto.slug ?? "");
            if (slug !== current.slug)
                await this.assertSlugFree(organizationId, slug);
            data.slug = slug;
        }
        if (has("description"))
            data.description = cleanDescription(dto.description);
        if (has("categoryId")) {
            await this.assertCategoryOf(organizationId, dto.categoryId);
            data.categoryId = dto.categoryId ?? null;
        }
        if (has("optionId")) {
            // Each variant's value belongs to the option it was made under;
            // switching would orphan them all. A product from before options
            // (none set, no variant with a value) may take its first one.
            const next = dto.optionId ?? null;
            // Any variant made under an option ties the product to it;
            // variants from before options (no value) don't.
            const firstOption =
                current.optionId === null &&
                next !== null &&
                (await prisma.productVariant.count({
                    where: { productId, optionValueId: { not: null } },
                })) === 0;
            if (
                next !== current.optionId &&
                current._count.variants > 0 &&
                !firstOption
            ) {
                const option = next
                    ? await prisma.productOption.findFirst({
                          where: { id: next, organizationId },
                          select: { name: true },
                      })
                    : null;
                throw new ConflictException({
                    message: option
                        ? `Remove the variants first to sell it by ${option.name.toLowerCase()} instead.`
                        : "Remove the variants first to sell it without an option.",
                    field: "optionId",
                });
            }
            await this.assertOptionOf(organizationId, dto.optionId);
            data.optionId = dto.optionId ?? null;
        }
        if (has("price")) data.price = dto.price;
        if (has("gstRate")) data.gstRate = checkGstRate(dto.gstRate);
        if (has("hsnCode")) data.hsnCode = dto.hsnCode ?? null;
        if (has("mrp")) data.mrp = dto.mrp ?? null;
        if (has("status")) {
            data.status = dto.status;
            // When it went, for the archived banner; cleared when it leaves.
            if (dto.status === "ARCHIVED" && current.status !== "ARCHIVED")
                data.archivedAt = new Date();
            if (dto.status !== "ARCHIVED") data.archivedAt = null;
        }
        for (const key of [
            "howToUse",
            "materials",
            "maker",
            "madeIn",
            "supplierCode",
            "warranty",
            "returnsText",
            "seoTitle",
            "seoDescription",
        ] as const) {
            if (has(key)) data[key] = dto[key] ?? null;
        }
        if (has("keyPoints")) data.keyPoints = cleanKeyPoints(dto.keyPoints);
        if (has("madeHere")) data.madeHere = dto.madeHere;
        if (has("returnsMode")) data.returnsMode = dto.returnsMode;
        // Merged, not replaced: each section sends only the switches it
        // shows, so two sections saved one after the other never undo each
        // other's.
        if (has("shopFields"))
            data.shopFields = {
                ...readShopFields(current.shopFields),
                ...cleanShopFields(dto.shopFields ?? {}),
            };
        if (has("seoImageId")) {
            if (dto.seoImageId)
                await this.assertImageOfProduct(productId, dto.seoImageId);
            data.seoImageId = dto.seoImageId ?? null;
        }

        const price = dto.price ?? current.price.toString();
        const mrp = has("mrp")
            ? (dto.mrp ?? null)
            : (current.mrp?.toString() ?? null);
        assertMrpAtOrAbovePrice(price, mrp, has("mrp") ? "mrp" : "price");
        assertDetailsCoherent({
            madeHere: dto.madeHere ?? current.madeHere,
            maker: has("maker") ? (dto.maker ?? null) : current.maker,
            returnsMode: dto.returnsMode ?? current.returnsMode,
            returnsText: has("returnsText")
                ? (dto.returnsText ?? null)
                : current.returnsText,
        });

        // Custom field values first: a value its type refuses stops the
        // whole section before anything is written.
        if (dto.customFields) {
            await saveProductFieldValues(
                organizationId,
                productId,
                dto.customFields,
            );
        }
        if (dto.contains || dto.mayContain) {
            await saveProductAllergens(organizationId, productId, {
                contains: dto.contains,
                mayContain: dto.mayContain,
            });
        }
        if (Object.keys(data).length > 0) {
            try {
                await prisma.product.update({ where: { id: productId }, data });
            } catch (error) {
                if (!isSlugClash(error)) throw error;
                throw new ConflictException({
                    message: "That address is already used by another product",
                    field: "slug",
                });
            }
        }
        return this.getIn(scope, productId);
    }

    /** Store-route alias of `duplicateIn`. */
    async duplicate(storeId: string, productId: string, userId: string) {
        return this.duplicateIn(
            await this.access.writeViaStore(storeId, userId, productId),
            productId,
        );
    }

    /**
     * A draft copy of the product (#518; `duplicateProduct` says what is
     * copied), read back at the scope's storefront so the editor can open it.
     */
    async duplicateIn(scope: ProductScope, productId: string) {
        const { organizationId, storeId } = scope;
        let copyId: string;
        try {
            copyId = await prisma.$transaction((tx) =>
                duplicateProduct(tx, { organizationId, productId, storeId }),
            );
        } catch (error) {
            // Another copy took the same suffix in the meantime.
            if (!isSlugClash(error)) throw error;
            throw new ConflictException(
                "Another copy was being made at the same time. Try again.",
            );
        }
        return this.getIn(scope, copyId);
    }

    /**
     * Delete a product; its variants, listings and stock rows cascade
     * (schema onDelete: Cascade).
     */
    async remove(storeId: string, productId: string, userId: string) {
        return this.removeIn(
            await this.access.writeViaStore(storeId, userId, productId),
            productId,
        );
    }

    /** Delete the catalogue product, from every storefront that sells it. */
    async removeIn(scope: ProductScope, productId: string) {
        const product = await prisma.product.findFirst({
            where: { id: productId, organizationId: scope.organizationId },
            select: { id: true },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        // An order line keeps its product (the history of what was sold, and
        // now of what was reviewed), so the database refuses the delete — which
        // used to surface as a bare 500. Say it, and say what to do instead.
        try {
            await prisma.$transaction(async (tx) => {
                // The lock order every stock writer keeps (backend-data-and-
                // money.md): the product FOR NO KEY UPDATE, then its shelves.
                // A count or receive already holding a shelf finishes first —
                // its entry's key check doesn't wait on NO KEY UPDATE — and
                // the checks below then see what it wrote.
                await lockProduct(tx, productId);
                await lockProductStock(tx, productId);
                const sold = await tx.orderItem.count({ where: { productId } });
                if (sold > 0) {
                    throw new ConflictException(
                        "This product has been ordered, so it can't be deleted. Archive it instead — it leaves the storefront and its order history stays.",
                    );
                }
                // The stock log is never edited (DEC-032): deleting the
                // product would take its entries with it, and any units on
                // a shelf would vanish with no entry saying so.
                const [logged, stocked] = await Promise.all([
                    tx.stockEntry.count({ where: { productId } }),
                    tx.stockLevel.count({
                        where: { productId, onHand: { not: 0 } },
                    }),
                ]);
                if (logged > 0 || stocked > 0) {
                    throw new ConflictException(PRODUCT_HAS_STOCK_HISTORY);
                }
                // Its rows go first, under the locks held, and the product
                // last: only that delete takes it FOR UPDATE, once nothing
                // below it is left to wait on.
                await tx.collectionProduct.deleteMany({ where: { productId } });
                await tx.productListing.deleteMany({ where: { productId } });
                await tx.stockLevel.deleteMany({ where: { productId } });
                await tx.product.delete({ where: { id: productId } });
            });
        } catch (error) {
            // An order line written for it right now can still meet the
            // final delete; nothing was changed, so asking again is safe.
            if (!isLockConflict(error)) throw error;
            throw new ConflictException(
                "Someone is changing this product right now. Try deleting it again.",
            );
        }
        return { id: productId };
    }

    /**
     * Product slugs are unique per business (#510,
     * @@unique([organizationId, slug])).
     */
    private async assertSlugFree(
        organizationId: string,
        slug: string,
    ): Promise<void> {
        const existing = await prisma.product.findUnique({
            where: { organizationId_slug: { organizationId, slug } },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** A product picks its option from its business's options (#529). */
    private async assertOptionOf(
        organizationId: string,
        optionId?: string | null,
    ): Promise<void> {
        if (!optionId) return;
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, organizationId },
            select: { id: true },
        });
        if (!option) {
            throw new BadRequestException({
                message: "Unknown option",
                field: "optionId",
            });
        }
    }

    /** The sharing image is one of the product's own photos. */
    private async assertImageOfProduct(
        productId: string,
        imageId: string,
    ): Promise<void> {
        const image = await prisma.productImage.findFirst({
            where: { id: imageId, productId, kind: "photo" },
            select: { id: true },
        });
        if (!image) {
            throw new BadRequestException({
                message: "Pick one of this product's photos",
                field: "seoImageId",
            });
        }
    }

    /** A product's category is one of its business's categories (#529). */
    private async assertCategoryOf(
        organizationId: string,
        categoryId?: string | null,
    ): Promise<void> {
        if (!categoryId) return;
        const category = await prisma.category.findFirst({
            where: { id: categoryId, organizationId },
            select: { id: true },
        });
        if (!category) {
            throw new BadRequestException({
                message: "Unknown category",
                field: "categoryId",
            });
        }
    }
}
