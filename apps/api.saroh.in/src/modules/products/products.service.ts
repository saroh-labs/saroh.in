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
    productAllergensFor,
    saveProductAllergens,
} from "../catalogue/allergens.service";
import {
    productFieldsFor,
    saveProductFieldValues,
} from "../catalogue/fields.service";
import { sanitizeRichHtml } from "../sites/sanitize";
import { slugify } from "../stores/slug";
import { StoresService } from "../stores/stores.service";
import type {
    CreateProductDto,
    PatchProductDto,
    ProductStatus,
    UpdateProductDto,
} from "./dto";
import {
    assertDetailsCoherent,
    assertMrpAtOrAbovePrice,
    cleanShopFields,
} from "./product-rules";
import {
    readShopFields,
    serializeProductDetail,
    serializeProductListItem,
} from "./serialize";

/** Everything a product page or the editor needs about one product. */
export const PRODUCT_DETAIL_INCLUDE = {
    category: { select: { id: true, name: true } },
    variants: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { inventory: true },
    },
    images: { orderBy: { position: "asc" } },
    inventory: true,
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
} satisfies Prisma.ProductInclude;

/** Key points are one line each: trimmed, and blank lines dropped. */
function cleanKeyPoints(points: string[] | undefined): string[] {
    return (points ?? []).map((p) => p.trim()).filter((p) => p !== "");
}

/** The description is merchant HTML: kept to what the shop can render. */
function cleanDescription(value: string | null | undefined): string | null {
    if (value == null) return null;
    const clean = sanitizeRichHtml(value).trim();
    return clean === "" ? null : clean;
}

/**
 * Product catalog data layer. Authorization is delegated to StoresService so
 * the same membership rules apply everywhere: reads require store access
 * (getForUser throws 404 for non-members — no existence leak), writes require
 * canWrite (owner or a write-capable member). Prices are Decimal in the DB and
 * serialize to strings over HTTP (money stays exact).
 */
@Injectable()
export class ProductsService {
    constructor(
        private readonly stores: StoresService,
        // @Optional for the same reason ModuleLifecycleService's is: this
        // service is also constructed directly in DB-backed specs, which pass
        // only what they exercise. Requiring it made every such construction
        // throw on first write. `app.bootstrap.spec` asserts it IS resolved in
        // the real graph, so optional here cannot become silently inert (#176).
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    /** Catalog for a store the caller can access, optionally filtered by status. */
    async list(storeId: string, userId: string, status?: ProductStatus) {
        await this.stores.getForUser(storeId, userId); // assert read access
        const products = await prisma.product.findMany({
            where: { storeId, ...(status ? { status } : {}) },
            orderBy: { createdAt: "desc" },
            include: {
                category: { select: { id: true, name: true } },
                // Enough to draw a catalogue row: the variant count, the SKU
                // the product is known by, and its stock.
                _count: { select: { variants: true } },
                // Every variant, briefly: an order is taken for one of them.
                variants: {
                    select: { id: true, sku: true, title: true, price: true },
                    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                },
                inventory: { select: { quantity: true, lowStockAlert: true } },
            },
        });
        return products.map(serializeProductListItem);
    }

    /** A single product with variants + inventory; 404 if no store access. */
    async get(storeId: string, productId: string, userId: string) {
        await this.stores.getForUser(storeId, userId);
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            include: PRODUCT_DETAIL_INCLUDE,
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        const [customFields, allergens] = await Promise.all([
            productFieldsFor(storeId, product.id, product.categoryId),
            productAllergensFor(product.id),
        ]);
        return { ...serializeProductDetail(product), customFields, allergens };
    }

    async create(storeId: string, userId: string, dto: CreateProductDto) {
        const organizationId = await this.requireWrite(storeId, userId);
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        await this.assertSlugFree(storeId, slug);
        await this.assertCategoryInStore(storeId, dto.categoryId);
        await this.assertOptionInStore(storeId, dto.optionId);
        assertMrpAtOrAbovePrice(dto.price, dto.mrp ?? null);
        assertDetailsCoherent({
            madeHere: dto.madeHere ?? true,
            maker: dto.maker ?? null,
            returnsMode: dto.returnsMode ?? "STOREFRONT",
            returnsText: dto.returnsText ?? null,
        });
        const shopFields = cleanShopFields(dto.shopFields ?? {});

        let createdId: string;
        try {
            const product = await prisma.product.create({
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
                    currency: dto.currency ?? "USD",
                    status: dto.status ?? "DRAFT",
                    archivedAt: dto.status === "ARCHIVED" ? new Date() : null,
                    howToUse: dto.howToUse ?? null,
                    materials: dto.materials ?? null,
                    keyPoints: cleanKeyPoints(dto.keyPoints),
                    madeHere: dto.madeHere ?? true,
                    maker: dto.maker ?? null,
                    madeIn: dto.madeIn ?? null,
                    supplierCode: dto.supplierCode ?? null,
                    warranty: dto.warranty ?? null,
                    returnsMode: dto.returnsMode ?? "STOREFRONT",
                    returnsText: dto.returnsText ?? null,
                    shopFields,
                    seoTitle: dto.seoTitle ?? null,
                    seoDescription: dto.seoDescription ?? null,
                    optionId: dto.optionId ?? null,
                },
            });
            createdId = product.id;
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
        if (organizationId) {
            if (dto.customFields) {
                await saveProductFieldValues(
                    storeId,
                    createdId,
                    organizationId,
                    dto.customFields,
                );
            }
            if (dto.contains || dto.mayContain) {
                await saveProductAllergens(storeId, createdId, organizationId, {
                    contains: dto.contains,
                    mayContain: dto.mayContain,
                });
            }
            await this.activation?.firstProductCreated(
                organizationId,
                createdId,
            );
        }
        return { id: createdId };
    }

    async update(
        storeId: string,
        productId: string,
        userId: string,
        dto: UpdateProductDto,
    ) {
        await this.requireWrite(storeId, userId);
        const current = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { slug: true },
        });
        if (!current) {
            throw new NotFoundException("Product not found");
        }
        const slug = slugify(dto.slug);
        if (current.slug !== slug) {
            await this.assertSlugFree(storeId, slug);
        }
        await this.assertCategoryInStore(storeId, dto.categoryId ?? undefined);

        try {
            await prisma.product.update({
                where: { id: productId },
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    image: dto.image ?? null,
                    categoryId: dto.categoryId ?? null,
                    price: dto.price,
                    currency: dto.currency ?? "USD",
                    ...(dto.status
                        ? {
                              status: dto.status,
                              ...(dto.status === "ARCHIVED"
                                  ? {}
                                  : { archivedAt: null }),
                          }
                        : {}),
                },
            });
            return { id: productId };
        } catch {
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
        const organizationId = await this.requireWrite(storeId, userId);
        const current = await prisma.product.findFirst({
            where: { id: productId, storeId },
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

        const has = (key: keyof PatchProductDto) => dto[key] !== undefined;
        const data: Record<string, unknown> = {};

        if (has("name")) data.name = dto.name;
        if (has("slug")) {
            const slug = slugify(dto.slug ?? "");
            if (slug !== current.slug) await this.assertSlugFree(storeId, slug);
            data.slug = slug;
        }
        if (has("description"))
            data.description = cleanDescription(dto.description);
        if (has("categoryId")) {
            await this.assertCategoryInStore(storeId, dto.categoryId);
            data.categoryId = dto.categoryId ?? null;
        }
        if (has("optionId")) {
            // Each variant's value belongs to the option it was made under;
            // switching would orphan them all.
            if (
                (dto.optionId ?? null) !== current.optionId &&
                current._count.variants > 0
            ) {
                const next = dto.optionId
                    ? await prisma.productOption.findFirst({
                          where: { id: dto.optionId, storeId },
                          select: { name: true },
                      })
                    : null;
                throw new ConflictException({
                    message: next
                        ? `Remove the variants first to sell it by ${next.name.toLowerCase()} instead.`
                        : "Remove the variants first to sell it without an option.",
                    field: "optionId",
                });
            }
            await this.assertOptionInStore(storeId, dto.optionId);
            data.optionId = dto.optionId ?? null;
        }
        if (has("price")) data.price = dto.price;
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
        if (dto.customFields && organizationId) {
            await saveProductFieldValues(
                storeId,
                productId,
                organizationId,
                dto.customFields,
            );
        }
        if ((dto.contains || dto.mayContain) && organizationId) {
            await saveProductAllergens(storeId, productId, organizationId, {
                contains: dto.contains,
                mayContain: dto.mayContain,
            });
        }
        if (Object.keys(data).length > 0) {
            try {
                await prisma.product.update({ where: { id: productId }, data });
            } catch {
                throw new ConflictException({
                    message: "That address is already used by another product",
                    field: "slug",
                });
            }
        }
        return this.get(storeId, productId, userId);
    }

    /** Delete a product; variants + inventory cascade (schema onDelete: Cascade). */
    async remove(storeId: string, productId: string, userId: string) {
        await this.requireWrite(storeId, userId);
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
        // An order line keeps its product (the history of what was sold, and
        // now of what was reviewed), so the database refuses the delete — which
        // used to surface as a bare 500. Say it, and say what to do instead.
        const sold = await prisma.orderItem.count({ where: { productId } });
        if (sold > 0) {
            throw new ConflictException(
                "This product has been ordered, so it can't be deleted. Archive it instead — it leaves the storefront and its order history stays.",
            );
        }
        await prisma.product.delete({ where: { id: productId } });
        return { id: productId };
    }

    /**
     * Assert write access AND return the owning Organization id, so every
     * create in this service can stamp `organizationId` (#173). Returning it
     * here rather than looking it up at each call site makes the stamp hard to
     * forget: the guard you must call already hands you the value.
     */
    private async requireWrite(
        storeId: string,
        userId: string,
    ): Promise<string | null> {
        const writable = await this.stores.writableOrganization(
            storeId,
            userId,
        );
        if (writable === null) {
            throw new NotFoundException("Store not found");
        }
        return writable.organizationId;
    }

    /** Assert the caller can read the store AND the product lives in it. */
    async assertProductReadable(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<void> {
        await this.stores.getForUser(storeId, userId);
        await this.assertProductInStore(storeId, productId);
    }

    /** Assert the caller can write the store AND the product lives in it. */
    async assertProductWritable(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<string | null> {
        const organizationId = await this.requireWrite(storeId, userId);
        await this.assertProductInStore(storeId, productId);
        return organizationId;
    }

    private async assertProductInStore(
        storeId: string,
        productId: string,
    ): Promise<void> {
        const product = await prisma.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true },
        });
        if (!product) {
            throw new NotFoundException("Product not found");
        }
    }

    /** Product slugs are unique per store (@@unique([storeId, slug])). */
    private async assertSlugFree(storeId: string, slug: string): Promise<void> {
        const existing = await prisma.product.findUnique({
            where: { storeId_slug: { storeId, slug } },
        });
        if (existing) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** A product picks its option from its own store's options. */
    private async assertOptionInStore(
        storeId: string,
        optionId?: string | null,
    ): Promise<void> {
        if (!optionId) return;
        const option = await prisma.productOption.findFirst({
            where: { id: optionId, storeId },
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
            where: { id: imageId, productId },
            select: { id: true },
        });
        if (!image) {
            throw new BadRequestException({
                message: "Pick one of this product's photos",
                field: "seoImageId",
            });
        }
    }

    /** A category attached to a product must belong to the same store. */
    private async assertCategoryInStore(
        storeId: string,
        categoryId?: string | null,
    ): Promise<void> {
        if (!categoryId) return;
        const category = await prisma.category.findFirst({
            where: { id: categoryId, storeId },
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
