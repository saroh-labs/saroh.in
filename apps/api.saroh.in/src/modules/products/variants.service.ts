import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ProductsService } from "./products.service";
import { serializeVariant } from "./serialize";
import type { CreateVariantDto, UpdateVariantDto } from "./variants.dto";

/**
 * Product variants (SKUs). Scoped to a product within a store; authorization
 * and product-existence are delegated to ProductsService. SKU is unique per
 * product (@@unique([productId, sku])).
 */
@Injectable()
export class VariantsService {
    constructor(private readonly products: ProductsService) {}

    async list(storeId: string, productId: string, userId: string) {
        await this.products.assertProductReadable(storeId, productId, userId);
        const variants = await prisma.productVariant.findMany({
            where: { productId },
            orderBy: { createdAt: "asc" },
        });
        return variants.map(serializeVariant);
    }

    async create(
        storeId: string,
        productId: string,
        userId: string,
        dto: CreateVariantDto,
    ) {
        await this.products.assertProductWritable(storeId, productId, userId);
        try {
            const variant = await prisma.productVariant.create({
                data: {
                    productId,
                    sku: dto.sku,
                    title: dto.title,
                    price: dto.price || null,
                    image: dto.image || null,
                },
            });
            return { id: variant.id };
        } catch {
            throw new ConflictException({
                message: "That SKU already exists for this product",
                field: "sku",
            });
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
        try {
            await prisma.productVariant.update({
                where: { id: variantId },
                data: {
                    sku: dto.sku,
                    title: dto.title,
                    price: dto.price || null,
                    image: dto.image || null,
                },
            });
            return { id: variantId };
        } catch {
            throw new ConflictException({
                message: "That SKU already exists for this product",
                field: "sku",
            });
        }
    }

    async remove(
        storeId: string,
        productId: string,
        variantId: string,
        userId: string,
    ) {
        await this.products.assertProductWritable(storeId, productId, userId);
        const variant = await prisma.productVariant.findFirst({
            where: { id: variantId, productId },
            select: { id: true },
        });
        if (!variant) {
            throw new NotFoundException("Variant not found");
        }
        await prisma.productVariant.delete({ where: { id: variantId } });
        return { id: variantId };
    }
}
