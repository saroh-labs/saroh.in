import {
    BadRequestException,
    ConflictException,
    Injectable,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type {
    UpdateInventoryDto,
    UpdateVariantStockDto,
} from "./inventory.dto";
import { linesToMove, promisesToMove } from "./open-promises";
import { ProductsService } from "./products.service";
import type { StockLevelRow } from "./stock-levels";
import {
    countsPerVariant,
    firstRow,
    lockProduct,
    lockProductStock,
    lockStockLevels,
} from "./stock-levels";

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
 * Stock at one storefront (#510: StockLevel rows, one per storefront ×
 * product × variant). A product counts either as a whole (its row with no
 * variant) or per variant (a row each) — never both for the same units.
 * `reserved` (StockLevel.promised) belongs to Orders and is read-only here;
 * this service sets on-hand counts and warning levels.
 *
 * Switching to per-variant stock is one save of every variant's count at the
 * storefront the editor is open at, and every unit is counted once. It
 * switches the product everywhere: at every storefront that counts it, open
 * orders that name a variant take their promise with them — it becomes that
 * variant's `reserved` at the same storefront. Here, inside the count the
 * merchant gives; elsewhere, inside a count of what was promised, the first
 * variant also taking what was free to sell. The product's row at each
 * storefront is kept for lines that name no variant, holding exactly what
 * they promise (quantity = reserved), so releasing or fulfilling any open
 * order lands on the row it now sits on. The editor seeds the counts to
 * match: each variant starts at what it promises, the first also at what was
 * free to sell.
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
        return this.view(storeId, productId);
    }

    /** Set the product's own count here; refused once it counts per variant. */
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
        if (await countsPerVariant(prisma, productId)) {
            throw new ConflictException({
                message:
                    "This product counts stock for each variant. Set each variant's count instead.",
                field: "quantity",
            });
        }
        const row = await prisma.$transaction(async (tx) => {
            const rows = await lockProductStock(tx, productId, storeId);
            const own = firstRow(rows);
            if (own) {
                return tx.stockLevel.update({
                    where: { id: own.id },
                    data: {
                        onHand: dto.quantity,
                        ...(dto.lowStockAlert != null
                            ? { lowStockAlert: dto.lowStockAlert }
                            : {}),
                    },
                });
            }
            return tx.stockLevel.create({
                data: {
                    organizationId,
                    storeId,
                    productId,
                    onHand: dto.quantity,
                    lowStockAlert: dto.lowStockAlert ?? 10,
                },
            });
        });
        return {
            productId,
            quantity: row.onHand,
            reserved: row.promised,
            lowStockAlert: row.lowStockAlert,
        };
    }

    /**
     * Set every variant's on-hand count and warning level here at once. The
     * list must name each variant of the product exactly once, so no variant
     * is left uncounted. A count below what that variant already promises to
     * open orders here is refused.
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
        const variants = await prisma.productVariant.findMany({
            where: { productId },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            select: { id: true, title: true },
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

        await prisma.$transaction(async (tx) => {
            // Lock order: the open Orders whose lines may move, then the
            // product, then its StockLevel rows — so an order settling on
            // the product's row and this switch wait for each other.
            const orders = await tx.orderItem.findMany({
                where: linesToMove(productId),
                select: { orderId: true },
            });
            const orderIds = Array.from(
                new Set(orders.map((o) => o.orderId)),
            ).sort();
            if (orderIds.length > 0) {
                await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ANY(${orderIds}::text[]) ORDER BY id FOR UPDATE`;
            }
            await lockProduct(tx, productId);
            const rows = await lockProductStock(tx, productId);
            const firstSwitch = !rows.some((r) => r.variantId !== null);

            const here = rows.filter((r) => r.storeId === storeId);
            const moving = firstSwitch
                ? await promisesToMove(tx, productId, storeId)
                : {};
            const promisedNow = new Map(
                here.map((r) => [r.variantId, r.promised] as const),
            );
            const counts = new Map<string, { onHand: number; warn: number }>();
            for (const input of dto.variants) {
                const promised = firstSwitch
                    ? (moving[input.variantId] ?? 0)
                    : (promisedNow.get(input.variantId) ?? 0);
                if (input.quantity < promised) {
                    throw new BadRequestException({
                        message: `${byId.get(input.variantId)?.title ?? "A variant"} has ${promised} promised to open orders — on hand can't go below that.`,
                        field: "variants",
                    });
                }
                counts.set(input.variantId, {
                    onHand: input.quantity,
                    warn: input.lowStockAlert,
                });
            }

            if (!firstSwitch) {
                for (const [variantId, count] of Array.from(counts)) {
                    const row = here.find((r) => r.variantId === variantId);
                    if (row) {
                        await tx.stockLevel.update({
                            where: { id: row.id },
                            data: {
                                onHand: count.onHand,
                                lowStockAlert: count.warn,
                            },
                        });
                    } else {
                        await tx.stockLevel.create({
                            data: {
                                organizationId,
                                storeId,
                                productId,
                                variantId,
                                onHand: count.onHand,
                                lowStockAlert: count.warn,
                            },
                        });
                    }
                }
                return;
            }

            // The first switch: here with the merchant's counts, and at every
            // other storefront that counts the product, with what its open
            // orders promise (the first variant also taking what was free).
            const stores = new Set([
                storeId,
                ...rows
                    .filter((r) => r.variantId === null)
                    .map((r) => r.storeId),
            ]);
            for (const store of Array.from(stores)) {
                const own = rows.find(
                    (r) => r.storeId === store && r.variantId === null,
                );
                const promises =
                    store === storeId
                        ? moving
                        : await promisesToMove(tx, productId, store);
                const free = own ? Math.max(0, own.onHand - own.promised) : 0;
                const created = await this.switchStore(tx, {
                    organizationId,
                    storeId: store,
                    productId,
                    own,
                    promises,
                    counts:
                        store === storeId
                            ? counts
                            : new Map(
                                  variants.map((v, i) => [
                                      v.id,
                                      {
                                          onHand:
                                              (promises[v.id] ?? 0) +
                                              (i === 0 ? free : 0),
                                          warn: own?.lowStockAlert ?? 10,
                                      },
                                  ]),
                              ),
                });
                await lockStockLevels(tx, created);
            }
        });
        return this.view(storeId, productId);
    }

    /**
     * One storefront's side of the first switch: a row per variant holding
     * what its open lines here promise, those lines moved onto it, and the
     * product's own row left holding only what lines without a variant
     * promise. Returns the rows it made.
     */
    private async switchStore(
        tx: Prisma.TransactionClient,
        input: {
            organizationId: string;
            storeId: string;
            productId: string;
            own: StockLevelRow | undefined;
            promises: Record<string, number>;
            counts: Map<string, { onHand: number; warn: number }>;
        },
    ): Promise<string[]> {
        const { organizationId, storeId, productId, own, promises } = input;
        const made: string[] = [];
        for (const [variantId, count] of Array.from(input.counts)) {
            const row = await tx.stockLevel.create({
                data: {
                    organizationId,
                    storeId,
                    productId,
                    variantId,
                    onHand: count.onHand,
                    promised: promises[variantId] ?? 0,
                    lowStockAlert: count.warn,
                },
                select: { id: true },
            });
            made.push(row.id);
            await tx.orderItem.updateMany({
                where: { ...linesToMove(productId, storeId), variantId },
                data: { stockRow: "VARIANT", stockLevelId: row.id },
            });
        }
        if (own) {
            const moved = Object.values(promises).reduce((n, q) => n + q, 0);
            // Never below zero, even if a line from before rows were
            // recorded was guessed wrong.
            const left = Math.max(0, own.promised - moved);
            await tx.stockLevel.update({
                where: { id: own.id },
                data: { onHand: left, promised: left },
            });
        }
        return made;
    }

    private async view(storeId: string, productId: string): Promise<StockView> {
        const [rows, perVariant] = await Promise.all([
            prisma.stockLevel.findMany({
                where: { storeId, productId },
                orderBy: { id: "asc" },
                select: {
                    variantId: true,
                    onHand: true,
                    promised: true,
                    lowStockAlert: true,
                },
            }),
            countsPerVariant(prisma, productId),
        ]);
        const own = rows.find((r) => r.variantId === null);
        return {
            productId,
            mode: perVariant ? "variant" : "product",
            quantity: own?.onHand ?? 0,
            reserved: own?.promised ?? 0,
            lowStockAlert: own?.lowStockAlert ?? 10,
            variants: rows.flatMap((r) =>
                r.variantId
                    ? [
                          {
                              variantId: r.variantId,
                              quantity: r.onHand,
                              reserved: r.promised,
                              lowStockAlert: r.lowStockAlert,
                          },
                      ]
                    : [],
            ),
        };
    }
}
