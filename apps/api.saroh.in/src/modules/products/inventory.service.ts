import { Injectable } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { UpdateInventoryDto } from "./inventory.dto";
import { ProductsService } from "./products.service";

/**
 * Per-product inventory (1:1 with Product). `reserved` is owned by the Orders
 * flow and is read-only here; this slice manages on-hand quantity and the
 * low-stock threshold. The row is created lazily the first time stock is set.
 */
@Injectable()
export class InventoryService {
    constructor(private readonly products: ProductsService) {}

    /** Current inventory, or a zeroed default when none exists yet. */
    async get(storeId: string, productId: string, userId: string) {
        await this.products.assertProductReadable(storeId, productId, userId);
        const inventory = await prisma.inventory.findUnique({
            where: { productId },
        });
        return (
            inventory ?? {
                productId,
                quantity: 0,
                reserved: 0,
                lowStockAlert: 10,
            }
        );
    }

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
}
