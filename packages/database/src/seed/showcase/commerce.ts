import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { listProductAt, setStockLevel } from "../helpers";
import type { CatalogProduct } from "./data";
import { addMinutes, daysBetween, earliest, istAt, istWeekday } from "./people";
import type { Rng } from "./random";

/**
 * Catalogue and orders, with money handled the way the API handles it.
 *
 * Everything is integer paise until the moment it is written, then formatted
 * with `toFixed(2)` — exactly `orders.service.ts`'s `toCents`/`fromCents`. A
 * line is priced from its PRODUCT, not its variant, because that is what the
 * order form snapshots; and total = subtotal + tax + shipping − discount, with
 * tax and shipping as the amounts the merchant typed.
 */

export const toPaise = (rupees: string) => Math.round(Number(rupees) * 100);
export const fromPaise = (paise: number) => (paise / 100).toFixed(2);

export interface SellableProduct {
    id: string;
    priceCents: number;
    bulk: readonly [number, number, number];
    weight: number;
}

/**
 * Upsert products with their variants, their listing at the storefront and
 * their stock there, keyed on the business and slug as the base seed keys
 * them — so a product the base seed already wrote is never duplicated.
 */
export async function upsertCatalog(
    prisma: Db,
    options: {
        storeId: string;
        orgId: string;
        currency: string;
        categoryId: (slug: string) => string;
        products: readonly CatalogProduct[];
        productId: (i: number) => string;
        variantId: (i: number, v: number) => string;
        listingId: (i: number) => string;
        listingVariantId: (i: number, v: number) => string;
        stockLevelId: (i: number) => string;
        createdAt: (i: number) => Date;
    },
): Promise<SellableProduct[]> {
    const { storeId, orgId } = options;
    const out: SellableProduct[] = [];
    // Small concurrent batches: one product is five or six round trips.
    const CHUNK = 8;
    for (let k = 0; k < options.products.length; k += CHUNK) {
        const batch = options.products.slice(k, k + CHUNK);
        const written = await Promise.all(
            batch.map(async (p, j) => {
                const i = k + j;
                const product = await prisma.product.upsert({
                    where: {
                        organizationId_slug: {
                            organizationId: orgId,
                            slug: p.slug,
                        },
                    },
                    update: {
                        name: p.name,
                        price: p.price,
                        status: "PUBLISHED",
                        categoryId: options.categoryId(p.category),
                    },
                    create: {
                        id: options.productId(i),
                        storeId,
                        organizationId: orgId,
                        categoryId: options.categoryId(p.category),
                        name: p.name,
                        slug: p.slug,
                        description: p.description,
                        price: p.price,
                        currency: options.currency,
                        status: "PUBLISHED",
                        createdAt: options.createdAt(i),
                    },
                });
                const variantIds: string[] = [];
                for (let v = 0; v < p.variants.length; v++) {
                    const variant = p.variants[v];
                    const row = await prisma.productVariant.upsert({
                        where: {
                            productId_sku: {
                                productId: product.id,
                                sku: variant.sku,
                            },
                        },
                        update: { title: variant.title, price: variant.price },
                        create: {
                            id: options.variantId(i, v),
                            productId: product.id,
                            sku: variant.sku,
                            title: variant.title,
                            price: variant.price,
                        },
                    });
                    variantIds.push(row.id);
                }
                await listProductAt(prisma, {
                    id: options.listingId(i),
                    orgId,
                    storeId,
                    productId: product.id,
                    variants: variantIds.map((variantId, v) => ({
                        id: options.listingVariantId(i, v),
                        variantId,
                    })),
                });
                // Counted as a whole, as the base seed counts its products.
                // `stock` is what the storefront can sell; the caller's open
                // orders hold on top of it (holdOpenLines).
                await setStockLevel(prisma, {
                    id: options.stockLevelId(i),
                    orgId,
                    storeId,
                    productId: product.id,
                    onHand: p.stock,
                    promised: 0,
                });
                return {
                    id: product.id,
                    priceCents: toPaise(p.price),
                    bulk: p.bulk,
                    weight: p.weight,
                };
            }),
        );
        out.push(...written);
    }
    return out;
}

export type OrderStatus =
    "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";

export interface OrderPlanOptions {
    now: Date;
    count: number;
    /** How far back the orders go. */
    days: number;
    products: readonly SellableProduct[];
    customers: number;
    /** Lines per order, weighted: index 0 is a one-line order. */
    lineWeights: readonly number[];
    /** Relative order volume by weekday, Sunday first. */
    weekdayWeights: readonly number[];
    /** How much busier the newest day is than the oldest. */
    growth: number;
    /** Opening hours on the Kolkata clock, as minutes of the day. */
    openMinute: number;
    closeMinute: number;
    taxRate: number;
    shipping: (subtotalPaise: number, rng: Rng) => number;
    discount: (subtotalPaise: number, rng: Rng) => number;
    /**
     * Where an order of this age has got to. Handed two numbers drawn for
     * every order, rather than the generator, so the draws never depend on
     * the branch taken — which depends on the clock.
     */
    status: (
        daysAgo: number,
        r1: number,
        r2: number,
    ) => [OrderStatus, PaymentStatus];
    /** The per-store order number, from the order's place in time. */
    orderNumber: (n: number) => string;
    orderId: (n: number) => string;
    itemId: (n: number, line: number) => string;
    storeId: string;
    orgId: string;
    currency: string;
}

export interface PlannedOrders {
    orders: Prisma.OrderCreateManyInput[];
    items: Prisma.OrderItemCreateManyInput[];
    /** Each order's customer, by index into the caller's customer list. */
    customerOf: number[];
    /** When each customer first ordered, by index. */
    firstOrderAt: Map<number, Date>;
}

/**
 * Orders spread over the window the way a small business's are: quieter on a
 * Sunday, growing slowly, a few regulars placing most of them. Numbered in
 * time order, so ORD numbers climb with the date as they do in the product.
 */
export function planOrders(rng: Rng, o: OrderPlanOptions): PlannedOrders {
    const dayOffsets = Array.from(
        { length: o.days },
        (_, i) => -(o.days - 1) + i,
    );
    const dayWeight = (offset: number) => {
        const progress = (offset + o.days) / o.days; // 0 → oldest, 1 → today
        return (
            o.weekdayWeights[istWeekday(o.now, offset)] *
            (1 + o.growth * progress)
        );
    };

    const times: Date[] = [];
    while (times.length < o.count) {
        const offset = rng.weighted(dayOffsets, dayWeight);
        const minute = rng.int(o.openMinute, o.closeMinute - 1);
        const when = istAt(o.now, offset, minute);
        // Today's orders have happened already, not later this evening — a
        // time still ahead moves to the day before. Moved rather than redrawn,
        // so how many random numbers are used never depends on the hour the
        // seed runs, and a re-run the same day writes the same rows.
        times.push(
            when.getTime() > o.now.getTime()
                ? istAt(o.now, offset - 1, minute)
                : when,
        );
    }
    times.sort((a, b) => a.getTime() - b.getTime());

    const orders: Prisma.OrderCreateManyInput[] = [];
    const items: Prisma.OrderItemCreateManyInput[] = [];
    const customerOf: number[] = [];
    const firstOrderAt = new Map<number, Date>();

    for (let n = 0; n < times.length; n++) {
        const createdAt = times[n];
        const customer = rng.skewed(o.customers, 1.8);
        customerOf.push(customer);
        const seen = firstOrderAt.get(customer);
        firstOrderAt.set(
            customer,
            seen ? earliest(seen, createdAt) : createdAt,
        );

        const lineCount =
            1 +
            rng.weighted(
                o.lineWeights.map((_, i) => i),
                (i) => o.lineWeights[i],
            );
        const chosen = new Set<SellableProduct>();
        while (chosen.size < Math.min(lineCount, o.products.length)) {
            chosen.add(rng.weighted(o.products, (p) => p.weight));
        }

        let subtotal = 0;
        Array.from(chosen).forEach((p, line) => {
            const [min, max, step] = p.bulk;
            const quantity =
                min + step * rng.int(0, Math.floor((max - min) / step));
            subtotal += p.priceCents * quantity;
            items.push({
                id: o.itemId(n, line),
                orderId: o.orderId(n),
                productId: p.id,
                quantity,
                price: fromPaise(p.priceCents),
            });
        });

        const discount = Math.min(subtotal, o.discount(subtotal, rng));
        const tax = Math.round((subtotal - discount) * o.taxRate);
        const shipping = o.shipping(subtotal, rng);
        const total = Math.max(0, subtotal + tax + shipping - discount);
        const daysAgo = daysBetween(createdAt, o.now);
        const [status, paymentStatus] = o.status(
            daysAgo,
            rng.next(),
            rng.next(),
        );
        const touchedAfter = rng.int(60, 60 * 24 * 5);

        orders.push({
            id: o.orderId(n),
            storeId: o.storeId,
            organizationId: o.orgId,
            orderId: o.orderNumber(n),
            customerId: "", // filled in by the caller once customers exist
            subtotal: fromPaise(subtotal),
            tax: fromPaise(tax),
            shipping: fromPaise(shipping),
            discount: fromPaise(discount),
            total: fromPaise(total),
            currency: o.currency,
            status,
            paymentStatus,
            createdAt,
            // Last touched when it moved on: a delivered order was updated
            // days after it was placed, never after "now".
            updatedAt: earliest(
                o.now,
                addMinutes(createdAt, status === "PENDING" ? 5 : touchedAfter),
            ),
        });
    }

    return { orders, items, customerOf, firstOrderAt };
}
