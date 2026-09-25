import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { assertMrpAtOrAbovePrice } from "./product-rules";
import { ProductsService } from "./products.service";
import { serializeVariant } from "./serialize";
import { lockProduct, lockProductStock } from "./stock-levels";
import type {
    CreateVariantDto,
    ReorderVariantsDto,
    UpdateVariantDto,
} from "./variants.dto";

const SKU_TAKEN = {
    message: "Another variant already has this SKU.",
    field: "sku",
};

/**
 * Product variants (SKUs). Scoped to a product within a store; authorization
 * and product-existence are delegated to ProductsService. SKU is unique per
 * product (@@unique([productId, sku])).
 *
 * Products v2 (#462): a variant can carry its value of the product's option,
 * one of the product's photos, its own MRP and a position. Once the product
 * counts stock per variant, a new variant starts with its own count of 0, and
 * a variant with stock promised to open orders cannot be removed.
 *
 * #510: a new variant is sold wherever its product is listed, and counted
 * at every storefront that counts the product per variant.
 */
@Injectable()
export class VariantsService {
    constructor(private readonly products: ProductsService) {}

    async list(storeId: string, productId: string, userId: string) {
        await this.products.assertProductReadable(storeId, productId, userId);
        const variants = await prisma.productVariant.findMany({
            where: { productId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            include: {
                stockLevels: {
                    where: { storeId },
                    select: {
                        onHand: true,
                        promised: true,
                        lowStockAlert: true,
                    },
                },
                listings: {
                    where: { listing: { storeId } },
                    select: { id: true },
                },
            },
        });
        return variants.map(serializeVariant);
    }

    async create(
        storeId: string,
        productId: string,
        userId: string,
        dto: CreateVariantDto,
    ) {
        const organizationId = await this.products.assertProductWritable(
            storeId,
            productId,
            userId,
        );
        await this.assertCoherent(productId, dto);

        const last = await prisma.productVariant.findFirst({
            where: { productId },
            orderBy: { position: "desc" },
            select: { position: true },
        });
        try {
            const variant = await prisma.$transaction(async (tx) => {
                // Lock order: the product, then its stock rows.
                await lockProduct(tx, productId);
                const created = await tx.productVariant.create({
                    data: {
                        productId,
                        sku: dto.sku,
                        title: dto.title,
                        price: dto.price ?? null,
                        mrp: dto.mrp ?? null,
                        image: dto.image ?? null,
                        optionValueId: dto.optionValueId ?? null,
                        imageId: dto.imageId ?? null,
                        position: (last?.position ?? -1) + 1,
                    },
                });
                // Sold wherever the product is listed.
                const listings = await tx.productListing.findMany({
                    where: { productId },
                    select: { id: true },
                });
                if (listings.length > 0) {
                    await tx.productListingVariant.createMany({
                        data: listings.map((l) => ({
                            organizationId,
                            listingId: l.id,
                            productId,
                            variantId: created.id,
                        })),
                    });
                }
                // A product counting per variant counts every variant: at
                // each storefront that counts it so, a new one starts at
                // nothing on hand rather than untracked.
                const rows = await lockProductStock(tx, productId);
                const stores = new Set(
                    rows.filter((r) => r.variantId).map((r) => r.storeId),
                );
                for (const storeId of Array.from(stores)) {
                    await tx.stockLevel.create({
                        data: {
                            organizationId,
                            storeId,
                            productId,
                            variantId: created.id,
                        },
                    });
                }
                return created;
            });
            return { id: variant.id };
        } catch (error) {
            if (isUniqueViolation(error))
                throw new ConflictException(SKU_TAKEN);
            throw error;
        }
    }

    async update(
        storeId: string,
        productId: string,
        variantId: string,
        userId: string,
        dto: UpdateVariantDto,
    ) {
        await this.products.assertProductWritable(storeId, productId, userId);
        const variant = await prisma.productVariant.findFirst({
            where: { id: variantId, productId },
            select: { id: true },
        });
        if (!variant) {
            throw new NotFoundException("Variant not found");
        }
        await this.assertCoherent(productId, dto);
        try {
            await prisma.productVariant.update({
                where: { id: variantId },
                data: {
                    sku: dto.sku,
                    title: dto.title,
                    price: dto.price ?? null,
                    mrp: dto.mrp ?? null,
                    image: dto.image ?? null,
                    optionValueId: dto.optionValueId ?? null,
                    imageId: dto.imageId ?? null,
                },
            });
            return { id: variantId };
        } catch (error) {
            if (isUniqueViolation(error))
                throw new ConflictException(SKU_TAKEN);
            throw error;
        }
    }

    /** Put the variants in the order given; every variant, each once. */
    async reorder(
        storeId: string,
        productId: string,
        userId: string,
        dto: ReorderVariantsDto,
    ) {
        await this.products.assertProductWritable(storeId, productId, userId);
        const current = await prisma.productVariant.findMany({
            where: { productId },
            select: { id: true },
        });
        const known = new Set(current.map((v) => v.id));
        const given = new Set(dto.ids);
        if (
            given.size !== dto.ids.length ||
            given.size !== known.size ||
            dto.ids.some((id) => !known.has(id))
        ) {
            throw new BadRequestException({
                message: "List every variant of this product once.",
                field: "ids",
            });
        }
        await prisma.$transaction(
            dto.ids.map((id, position) =>
                prisma.productVariant.update({
                    where: { id },
                    data: { position },
                }),
            ),
        );
        return this.list(storeId, productId, userId);
    }

    async remove(
        storeId: string,
        productId: string,
        variantId: string,
        userId: string,
    ) {
        const organizationId = await this.products.assertProductWritable(
            storeId,
            productId,
            userId,
        );
        const variant = await prisma.productVariant.findFirst({
            where: { id: variantId, productId },
            select: { id: true, title: true },
        });
        if (!variant) {
            throw new NotFoundException("Variant not found");
        }

        await prisma.$transaction(async (tx) => {
            // Lock order: the product, then its stock rows.
            await lockProduct(tx, productId);
            const rows = await lockProductStock(tx, productId);
            const own = rows.filter((r) => r.variantId === variantId);
            // Stock promised to an open order is a promise to a customer:
            // the variant stays until those orders are fulfilled or
            // cancelled, at every storefront.
            const promised = own.reduce((n, r) => n + r.promised, 0);
            if (promised > 0) {
                throw new ConflictException({
                    message: `${variant.title} has ${promised} promised to open orders, so it can't be removed yet.`,
                    field: "variantId",
                });
            }
            await tx.productVariant.delete({ where: { id: variantId } });
            // At each storefront, the last variant counting its own stock
            // takes its count back to the product, so the product does not
            // silently lose its stock.
            for (const row of own) {
                const others = rows.some(
                    (r) =>
                        r.storeId === row.storeId &&
                        r.variantId !== null &&
                        r.variantId !== variantId,
                );
                if (others) continue;
                const whole = rows.find(
                    (r) => r.storeId === row.storeId && r.variantId === null,
                );
                if (whole) {
                    await tx.stockLevel.update({
                        where: { id: whole.id },
                        data: {
                            onHand: { increment: row.onHand },
                            lowStockAlert: row.lowStockAlert,
                        },
                    });
                } else {
                    await tx.stockLevel.create({
                        data: {
                            organizationId,
                            storeId: row.storeId,
                            productId,
                            onHand: row.onHand,
                            lowStockAlert: row.lowStockAlert,
                        },
                    });
                }
            }
        });
        return { id: variantId };
    }

    /**
     * A variant's option value belongs to the product's option, its photo is
     * one of the product's own, and its MRP is not below what it sells for.
     */
    private async assertCoherent(
        productId: string,
        dto: CreateVariantDto,
    ): Promise<void> {
        const product = await prisma.product.findUniqueOrThrow({
            where: { id: productId },
            select: { price: true, mrp: true, optionId: true },
        });
        if (dto.optionValueId) {
            const value = await prisma.productOptionValue.findFirst({
                where: {
                    id: dto.optionValueId,
                    optionId: product.optionId ?? "__none__",
                },
                select: { id: true },
            });
            if (!value) {
                throw new BadRequestException({
                    message: product.optionId
                        ? "Pick one of this product's option values."
                        : "Choose what customers pick by first (Size, Shade…).",
                    field: "optionValueId",
                });
            }
        }
        if (dto.imageId) {
            const image = await prisma.productImage.findFirst({
                where: { id: dto.imageId, productId, kind: "photo" },
                select: { id: true },
            });
            if (!image) {
                throw new BadRequestException({
                    message: "Pick one of this product's photos.",
                    field: "imageId",
                });
            }
        }
        const price = dto.price ?? product.price.toString();
        const mrp = dto.mrp ?? product.mrp?.toString() ?? null;
        assertMrpAtOrAbovePrice(price, mrp, dto.mrp ? "mrp" : "price");
    }
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: unknown }).code === "P2002"
    );
}
