import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { rateToBps } from "../invoices/gst";
import type { OrderItemInput } from "./dto";

/** Money helpers — integer-cents math so totals never drift on floats. */
export const toCents = (s: string) => Math.round(Number(s) * 100);
export const fromCents = (c: number) => (c / 100).toFixed(2);

export interface PricedLine {
    productId: string;
    variantId: string | null;
    quantity: number;
    priceCents: number;
    categoryId: string | null;
}

/**
 * The lines with the GST rate each product's price includes (ADR-008), for
 * the informational `Order.tax` of a GST-registered business.
 */
export async function withGstRates(
    lines: readonly {
        productId: string;
        quantity: number;
        priceCents: number;
    }[],
): Promise<{ quantity: number; unitCents: number; rateBps: number | null }[]> {
    const products = await prisma.product.findMany({
        where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
        select: { id: true, gstRate: true },
    });
    const rate = new Map(products.map((p) => [p.id, rateToBps(p.gstRate)]));
    return lines.map((l) => ({
        quantity: l.quantity,
        unitCents: l.priceCents,
        rateBps: rate.get(l.productId) ?? null,
    }));
}

/**
 * Snapshot each line's price from what was bought: the variant's own price
 * when it has one, else the product's. A product with variants is bought as
 * one of them, so its line must say which. Shared by placing an order and
 * adding a line to one before preparing (U6), so the two can never price the
 * same thing differently.
 */
export async function priceOrderLines(
    storeId: string,
    items: readonly OrderItemInput[],
): Promise<PricedLine[]> {
    const lines: PricedLine[] = [];
    for (const item of items) {
        // Sold here (#510): the product is listed at the order's
        // storefront, and a variant only if that storefront sells it.
        const product = await prisma.product.findFirst({
            where: { id: item.productId, listings: { some: { storeId } } },
            // The category too: a collection code matches on it.
            select: {
                name: true,
                price: true,
                categoryId: true,
                variants: {
                    select: {
                        id: true,
                        price: true,
                        listings: {
                            where: { listing: { storeId } },
                            select: { id: true },
                        },
                    },
                },
            },
        });
        if (!product) {
            throw new BadRequestException({
                message: "Unknown product in order",
                field: "items",
            });
        }
        let unitPrice = product.price.toString();
        let variantId: string | null = null;
        if (product.variants.length > 0) {
            const variant = product.variants.find(
                (v) => v.id === item.variantId,
            );
            if (!variant) {
                throw new BadRequestException({
                    message: item.variantId
                        ? `That option of ${product.name} no longer exists.`
                        : `Choose which one of ${product.name} is being bought.`,
                    field: "items",
                });
            }
            if (variant.listings.length === 0) {
                throw new BadRequestException({
                    message: `That option of ${product.name} isn't sold at this storefront.`,
                    field: "items",
                });
            }
            variantId = variant.id;
            if (variant.price) unitPrice = variant.price.toString();
        } else if (item.variantId) {
            throw new BadRequestException({
                message: `${product.name} has no options to choose from.`,
                field: "items",
            });
        }
        lines.push({
            productId: item.productId,
            variantId,
            quantity: item.quantity,
            priceCents: toCents(unitPrice),
            categoryId: product.categoryId,
        });
    }
    return lines;
}
