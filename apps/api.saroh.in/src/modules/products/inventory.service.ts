import {
    BadRequestException,
    ConflictException,
    Injectable,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    UpdateInventoryDto,
    UpdateVariantStockDto,
} from "./inventory.dto";
import { ProductsService } from "./products.service";

export interface StockView {
    productId: string;
    mode: "product" | "variant";
    /** The product's own row: all its stock, or (per variant) old promises. */
    quantity: number;
    reserved: number;
    lowStockAlert: number;
    variants: {
        variantId: string;
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    }[];
}

/**
 * Stock. A product counts either as a whole (its one Inventory row) or per
 * variant (a VariantInventory row each) — never both for the same units.
 * `reserved` belongs to Orders and is read-only here; this service sets
 * on-hand counts and warning levels.
 *
 * Switching to per-variant stock is one save of every variant's count. The
 * product's row is kept, holding exactly what open orders from before the
 * switch still promise (quantity = reserved), so releasing or fulfilling
 * those orders lands on stock that exists.
 */
@Injectable()
export class InventoryService {
    constructor(private readonly products: ProductsService) {}

    async get(
        storeId: string,
        productId: string,
        userId: string,
    ): Promise<StockView> {
        await this.products.assertProductReadable(storeId, productId, userId);
        return this.view(productId);
    }

    /** Set the product's own count; refused once it counts per variant. */
    async upsert(
        storeId: string,
        productId: string,
        userId: string,
        dto: UpdateInventoryDto,
    ) {
        const organizationId = await this.products.assertProductWritable(
            storeId,
            productId,
            userId,
        );
        if (
            (await prisma.variantInventory.count({ where: { productId } })) > 0
        ) {
            throw new ConflictException({
                message:
                    "This product counts stock for each variant. Set each variant's count instead.",
                field: "quantity",
            });
        }
        const inventory = await prisma.inventory.upsert({
            where: { productId },
            create: {
                storeId,
                organizationId,
                productId,
                quantity: dto.quantity,
                lowStockAlert: dto.lowStockAlert ?? 10,
            },
            update: {
                quantity: dto.quantity,
                ...(dto.lowStockAlert != null
                    ? { lowStockAlert: dto.lowStockAlert }
                    : {}),
            },
        });
        return {
            productId,
            quantity: inventory.quantity,
            reserved: inventory.reserved,
            lowStockAlert: inventory.lowStockAlert,
        };
    }

    /**
     * Set every variant's on-hand count and warning level at once. The list
     * must name each variant of the product exactly once, so no variant is
     * left uncounted. A count below what that variant already promises to
     * open orders is refused.
     */
    async setVariants(
        storeId: string,
        productId: string,
        userId: string,
        dto: UpdateVariantStockDto,
    ): Promise<StockView> {
        const organizationId = await this.products.assertProductWritable(
            storeId,
            productId,
            userId,
        );
        if (!organizationId) {
            throw new BadRequestException(
                "This storefront is not attached to a business, so it can't count stock per variant.",
            );
        }
        const variants = await prisma.productVariant.findMany({
            where: { productId },
            select: {
                id: true,
                title: true,
                inventory: { select: { reserved: true } },
            },
        });
        if (variants.length === 0) {
            throw new BadRequestException({
                message: "Add variants first, or set the product's own count.",
                field: "variants",
            });
        }
        const byId = new Map(variants.map((v) => [v.id, v]));
        const named = new Set(dto.variants.map((v) => v.variantId));
        if (
            named.size !== dto.variants.length ||
            named.size !== variants.length ||
            dto.variants.some((v) => !byId.has(v.variantId))
        ) {
            throw new BadRequestException({
                message: "Give a count for every variant, each once.",
                field: "variants",
            });
        }
        for (const input of dto.variants) {
            const current = byId.get(input.variantId);
            const promised = current?.inventory?.reserved ?? 0;
            if (input.quantity < promised) {
                throw new BadRequestException({
                    message: `${current?.title ?? "A variant"} has ${promised} promised to open orders — on hand can't go below that.`,
                    field: "variants",
                });
            }
        }

        await prisma.$transaction(async (tx) => {
            for (const input of dto.variants) {
                await tx.variantInventory.upsert({
                    where: { variantId: input.variantId },
                    create: {
                        variantId: input.variantId,
                        productId,
                        organizationId,
                        quantity: input.quantity,
                        lowStockAlert: input.lowStockAlert,
                    },
                    update: {
                        quantity: input.quantity,
                        lowStockAlert: input.lowStockAlert,
                    },
                });
            }
            // The product's own row now holds only what old orders promise.
            const own = await tx.inventory.findUnique({
                where: { productId },
                select: { reserved: true },
            });
            if (own) {
                await tx.inventory.update({
                    where: { productId },
                    data: { quantity: own.reserved },
                });
            }
        });
        return this.view(productId);
    }

    private async view(productId: string): Promise<StockView> {
        const [own, perVariant] = await Promise.all([
            prisma.inventory.findUnique({ where: { productId } }),
            prisma.variantInventory.findMany({
                where: { productId },
                select: {
                    variantId: true,
                    quantity: true,
                    reserved: true,
                    lowStockAlert: true,
                },
            }),
        ]);
        return {
            productId,
            mode: perVariant.length > 0 ? "variant" : "product",
            quantity: own?.quantity ?? 0,
            reserved: own?.reserved ?? 0,
            lowStockAlert: own?.lowStockAlert ?? 10,
            variants: perVariant,
        };
    }
}
