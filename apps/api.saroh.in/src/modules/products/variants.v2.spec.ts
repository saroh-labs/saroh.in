import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { OrderStatus } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { variantHasHistory } from "../stock/stock-words";
import { reverse } from "../stock/stock.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * Products v2 (#462) against a real Postgres: variants with option values,
 * photos and MRP; stock counted per variant; orders that reserve, commit and
 * release against the variant their line names. Integration project.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Variants and stock per variant (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const variants = new VariantsService(products);
    const inventory = new InventoryService(products);
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let customerId = "";
    let dressId = "";
    let sizeOptionId = "";
    const values: Record<string, string> = {};
    const v: Record<string, string> = {};

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `var-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Variants Org", slug: `var-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Variants Store",
                slug: `var-${tag}`,
            })
        ).id;
        const option = await prisma.productOption.create({
            data: {
                storeId,
                organizationId: orgId,
                name: "Size",
                values: {
                    create: ["S", "M", "L"].map((value, position) => ({
                        value,
                        position,
                        organizationId: orgId,
                    })),
                },
            },
            include: { values: true },
        });
        sizeOptionId = option.id;
        for (const val of option.values) values[val.value] = val.id;

        dressId = (
            await products.create(storeId, ownerId, {
                name: "Linen Wrap Dress",
                price: "2499",
                mrp: "3299",
                currency: "INR",
                optionId: sizeOptionId,
            })
        ).id;
        await inventory.upsert(storeId, dressId, ownerId, { quantity: 12 });
        customerId = (
            await customers.create(storeId, ownerId, {
                email: `var-buyer-${tag}@example.com`,
                firstName: "Asha",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.orderItem.deleteMany({ where: { order: { storeId } } });
        await prisma.order.deleteMany({ where: { storeId } });
        await prisma.customer.deleteMany({ where: { storeId } });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    // A variant's shelf at the storefront (#510: StockLevel).
    const stockOf = async (variantId: string) => {
        const row = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, variantId },
            select: { onHand: true, promised: true },
        });
        return { quantity: row.onHand, reserved: row.promised };
    };
    // The product's own shelf at the storefront.
    const ownRow = async (productId: string) => {
        const row = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, productId, variantId: null },
            select: { onHand: true, promised: true },
        });
        return { quantity: row.onHand, reserved: row.promised };
    };

    it("adds variants with a value of the product's option, in order", async () => {
        for (const size of ["S", "M", "L"]) {
            v[size] = (
                await variants.create(storeId, dressId, ownerId, {
                    sku: `LWD-${size}`,
                    title: size,
                    optionValueId: values[size],
                    price: size === "L" ? "2699" : null,
                })
            ).id;
        }
        const list = await variants.list(storeId, dressId, ownerId);
        expect(list.map((x) => [x.title, x.position])).toEqual([
            ["S", 0],
            ["M", 1],
            ["L", 2],
        ]);
        // Still counting as a whole: no variant has its own row yet.
        expect(list.every((x) => x.inventory === null)).toBe(true);
    });

    it("refuses a value from another option, a duplicate SKU and an MRP below price", async () => {
        const other = await prisma.productOption.create({
            data: {
                storeId,
                organizationId: orgId,
                name: "Colour",
                values: { create: [{ value: "Sage", organizationId: orgId }] },
            },
            include: { values: true },
        });
        await expect(
            variants.create(storeId, dressId, ownerId, {
                sku: "LWD-X",
                title: "Sage",
                optionValueId: other.values[0].id,
            }),
        ).rejects.toMatchObject({ response: { field: "optionValueId" } });
        await expect(
            variants.create(storeId, dressId, ownerId, {
                sku: "LWD-S",
                title: "S2",
            }),
        ).rejects.toThrow(ConflictException);
        await expect(
            variants.update(storeId, dressId, v.L, ownerId, {
                sku: "LWD-L",
                title: "L",
                price: "2699",
                mrp: "2500",
            }),
        ).rejects.toThrow(/MRP/);
    });

    it("counts per variant once every variant is given a count", async () => {
        await expect(
            inventory.setVariants(storeId, dressId, ownerId, {
                variants: [{ variantId: v.S, quantity: 5, lowStockAlert: 2 }],
            }),
        ).rejects.toThrow(BadRequestException);

        const view = await inventory.setVariants(storeId, dressId, ownerId, {
            variants: [
                { variantId: v.S, quantity: 5, lowStockAlert: 2 },
                { variantId: v.M, quantity: 4, lowStockAlert: 2 },
                { variantId: v.L, quantity: 3, lowStockAlert: 2 },
            ],
        });
        expect(view.mode).toBe("variant");
        // The product's own row keeps only old promises — none here.
        expect(view.quantity).toBe(0);
        await expect(
            inventory.upsert(storeId, dressId, ownerId, { quantity: 99 }),
        ).rejects.toThrow(/each variant/);
    });

    it("an order for M reserves M only, at the variant's price, and cancelling releases it", async () => {
        const created = await orders.create(storeId, ownerId, {
            customerId,
            items: [
                { productId: dressId, variantId: v.M, quantity: 2 },
                { productId: dressId, variantId: v.L, quantity: 1 },
            ],
        });
        expect(await stockOf(v.M)).toEqual({ quantity: 4, reserved: 2 });
        expect(await stockOf(v.S)).toEqual({ quantity: 5, reserved: 0 });
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: created.id },
            select: { subtotal: true, items: { select: { variantId: true } } },
        });
        // 2 × 2499 + 1 × 2699
        expect(order.subtotal.toString()).toBe("7697");
        expect(order.items.map((i) => i.variantId).sort()).toEqual(
            [v.M, v.L].sort(),
        );

        await orders.updateStatus(storeId, created.id, ownerId, {
            status: "CANCELLED",
        });
        expect(await stockOf(v.M)).toEqual({ quantity: 4, reserved: 0 });
    });

    it("shipping takes the units off that variant's shelf", async () => {
        const created = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: dressId, variantId: v.S, quantity: 2 }],
        });
        await orders.updateStatus(storeId, created.id, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(storeId, created.id, ownerId, {
            status: "SHIPPED",
        });
        expect(await stockOf(v.S)).toEqual({ quantity: 3, reserved: 0 });
    });

    it("refuses an order that doesn't say which variant, and one beyond the shelf", async () => {
        await expect(
            orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: dressId, quantity: 1 }],
            }),
        ).rejects.toThrow(/Choose which one/);
        await expect(
            orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: dressId, variantId: v.L, quantity: 4 }],
            }),
        ).rejects.toThrow(/Only 3 left at Variants Store/);
    });

    it("won't remove a variant with stock promised to an open order", async () => {
        const open = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: dressId, variantId: v.L, quantity: 1 }],
        });
        await expect(
            variants.remove(storeId, dressId, v.L, ownerId),
        ).rejects.toThrow(/promised to open orders/);
        await orders.updateStatus(storeId, open.id, ownerId, {
            status: "CANCELLED",
        });
    });

    it("a new variant starts at 0 once the product counts per variant", async () => {
        v.XL = (
            await variants.create(storeId, dressId, ownerId, {
                sku: "LWD-XL",
                title: "XL",
            })
        ).id;
        expect(await stockOf(v.XL)).toEqual({ quantity: 0, reserved: 0 });
    });

    it("reorders, listing every variant once", async () => {
        await expect(
            variants.reorder(storeId, dressId, ownerId, { ids: [v.L, v.M] }),
        ).rejects.toThrow(BadRequestException);
        const list = await variants.reorder(storeId, dressId, ownerId, {
            ids: [v.XL, v.L, v.M, v.S],
        });
        expect(list.map((x) => x.title)).toEqual(["XL", "L", "M", "S"]);
    });

    async function kurta(name: string, skus: string[]) {
        const id = (
            await products.create(storeId, ownerId, {
                name,
                price: "999",
                currency: "INR",
            })
        ).id;
        const ids: string[] = [];
        for (const sku of skus) {
            ids.push(
                (
                    await variants.create(storeId, id, ownerId, {
                        sku,
                        title: sku,
                    })
                ).id,
            );
        }
        return { id, variants: ids };
    }

    it("the last counted variant hands its stock back to the product (Saroh's switch is not history)", async () => {
        const shirt = await kurta("Cotton Kurta", ["CK-ONE", "CK-SPARE"]);
        const [only, spare] = shirt.variants;
        // Nothing counted it, nothing sold it: it goes.
        await variants.remove(storeId, shirt.id, spare, ownerId);
        // The switch to per-variant stock gives it 7: Saroh's count.
        await inventory.setVariants(storeId, shirt.id, ownerId, {
            variants: [{ variantId: only, quantity: 7, lowStockAlert: 3 }],
        });
        await variants.remove(storeId, shirt.id, only, ownerId);
        const view = await inventory.get(storeId, shirt.id, ownerId);
        expect(view).toMatchObject({
            mode: "product",
            quantity: 7,
            lowStockAlert: 3,
        });
        const whole = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, productId: shirt.id, variantId: null },
            select: { id: true, onHand: true },
        });
        const log = await prisma.stockEntry.findMany({
            where: { stockLevelId: whole.id },
            select: { quantity: true, system: true },
        });
        expect(log.reduce((n, e) => n + e.quantity, 0)).toBe(whole.onHand);
        expect(log.at(-1)).toEqual({ quantity: 7, system: "VARIANT_REMOVED" });
    });

    it("a variant counted only at 0 since the switch can still be removed", async () => {
        const shirt = await kurta("Silk Kurta", ["SK-S", "SK-M"]);
        const [s, m] = shirt.variants;
        const zeros = {
            variants: [
                { variantId: s, quantity: 0, lowStockAlert: 1 },
                { variantId: m, quantity: 0, lowStockAlert: 1 },
            ],
        };
        await inventory.setVariants(storeId, shirt.id, ownerId, zeros);
        // Saved again: a person's counts, each at 0 — nothing moved.
        await inventory.setVariants(storeId, shirt.id, ownerId, zeros);
        await variants.remove(storeId, shirt.id, m, ownerId);
        expect(await prisma.productVariant.count({ where: { id: m } })).toBe(0);
    });

    it("a variant with a real count, or a sale, can't be removed", async () => {
        const shirt = await kurta("Khadi Kurta", ["KK-S", "KK-M"]);
        const [s, m] = shirt.variants;
        await inventory.setVariants(storeId, shirt.id, ownerId, {
            variants: [
                { variantId: s, quantity: 0, lowStockAlert: 1 },
                { variantId: m, quantity: 0, lowStockAlert: 1 },
            ],
        });
        // A person counts 4 of S: real history.
        await inventory.setVariants(storeId, shirt.id, ownerId, {
            variants: [
                { variantId: s, quantity: 4, lowStockAlert: 1 },
                { variantId: m, quantity: 3, lowStockAlert: 1 },
            ],
        });
        await expect(
            variants.remove(storeId, shirt.id, s, ownerId),
        ).rejects.toThrow(new ConflictException(variantHasHistory("KK-S")));

        // M's count is undone: netted out by its Reversed entry, so M goes.
        const counted = await prisma.stockEntry.findFirstOrThrow({
            where: { variantId: m, system: null, quantity: { not: 0 } },
            select: { id: true },
        });
        await prisma.$transaction((tx) =>
            reverse(
                tx,
                { organizationId: orgId, userId: ownerId },
                { entryIds: [counted.id] },
            ),
        );
        await variants.remove(storeId, shirt.id, m, ownerId);

        // S sells one: an order line that sold it is history too.
        const sold = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: shirt.id, variantId: s, quantity: 1 }],
        });
        for (const status of ["PROCESSING", "DELIVERED"] as const) {
            await orders.updateStatus(storeId, sold.id, ownerId, { status });
        }
        await expect(
            variants.remove(storeId, shirt.id, s, ownerId),
        ).rejects.toThrow(new ConflictException(variantHasHistory("KK-S")));
    });

    it("a variant that only sold (its count Saroh's) can't be removed", async () => {
        const shirt = await kurta("Chanderi Kurta", ["CH-S", "CH-M"]);
        const [s, m] = shirt.variants;
        await inventory.setVariants(storeId, shirt.id, ownerId, {
            variants: [
                { variantId: s, quantity: 2, lowStockAlert: 1 },
                { variantId: m, quantity: 0, lowStockAlert: 1 },
            ],
        });
        const sold = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: shirt.id, variantId: s, quantity: 1 }],
        });
        for (const status of ["PROCESSING", "DELIVERED"] as const) {
            await orders.updateStatus(storeId, sold.id, ownerId, { status });
        }
        await expect(
            variants.remove(storeId, shirt.id, s, ownerId),
        ).rejects.toThrow(new ConflictException(variantHasHistory("CH-S")));
    });

    it("a product still counting as a whole moves its own stock, as before", async () => {
        const serum = (
            await products.create(storeId, ownerId, {
                name: "Vitamin C Serum",
                price: "599",
                currency: "INR",
            })
        ).id;
        await inventory.upsert(storeId, serum, ownerId, { quantity: 10 });
        await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: serum, quantity: 3 }],
        });
        expect(await ownRow(serum)).toEqual({ quantity: 10, reserved: 3 });
    });

    describe("switching to a count per variant with orders open", () => {
        let tonerId = "";
        const t: Record<string, string> = {};
        const own = ownRow;

        beforeAll(async () => {
            tonerId = (
                await products.create(storeId, ownerId, {
                    name: "Rose Toner",
                    price: "450",
                    currency: "INR",
                    optionId: sizeOptionId,
                })
            ).id;
            for (const size of ["S", "M"]) {
                t[size] = (
                    await variants.create(storeId, tonerId, ownerId, {
                        sku: `RT-${size}`,
                        title: size,
                        optionValueId: values[size],
                    })
                ).id;
            }
            await inventory.upsert(storeId, tonerId, ownerId, {
                quantity: 10,
            });
        });

        it("an order placed while counting as a whole moves to its variant, counted once", async () => {
            const order = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: tonerId, variantId: t.S, quantity: 2 }],
            });
            expect(await own(tonerId)).toEqual({ quantity: 10, reserved: 2 });
            // What the editor seeds the switch from.
            const detail = await products.get(storeId, tonerId, ownerId);
            expect(detail.variantPromises).toEqual({ [t.S]: 2 });

            // S starts at what was free (8) plus its own promise (2).
            await inventory.setVariants(storeId, tonerId, ownerId, {
                variants: [
                    { variantId: t.S, quantity: 10, lowStockAlert: 2 },
                    { variantId: t.M, quantity: 0, lowStockAlert: 2 },
                ],
            });
            expect(await stockOf(t.S)).toEqual({ quantity: 10, reserved: 2 });
            expect(await own(tonerId)).toEqual({ quantity: 0, reserved: 0 });

            // Shipping it lands on the variant's row, never below zero.
            await orders.updateStatus(storeId, order.id, ownerId, {
                status: "PROCESSING",
            });
            await orders.updateStatus(storeId, order.id, ownerId, {
                status: "SHIPPED",
            });
            expect(await stockOf(t.S)).toEqual({ quantity: 8, reserved: 0 });
            expect(await own(tonerId)).toEqual({ quantity: 0, reserved: 0 });
        });

        it("saves a count below what a variant has promised since (#513)", async () => {
            await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: tonerId, variantId: t.S, quantity: 3 }],
            });
            // The shelf holds what was counted; the gap reads "1 short".
            await inventory.setVariants(storeId, tonerId, ownerId, {
                variants: [
                    { variantId: t.S, quantity: 2, lowStockAlert: 2 },
                    { variantId: t.M, quantity: 0, lowStockAlert: 2 },
                ],
            });
            expect(await stockOf(t.S)).toEqual({ quantity: 2, reserved: 3 });
        });
    });

    describe("each line settles on the row it reserved from", () => {
        const own = ownRow;
        const stockRowOf = async (orderId: string) =>
            (
                await prisma.orderItem.findFirstOrThrow({
                    where: { orderId },
                    select: { stockRow: true },
                })
            ).stockRow;
        const withVariants = async (name: string, sku: string) => {
            const id = (
                await products.create(storeId, ownerId, {
                    name,
                    price: "300",
                    currency: "INR",
                    optionId: sizeOptionId,
                })
            ).id;
            const out: Record<string, string> = {};
            for (const size of ["S", "M"]) {
                out[size] = (
                    await variants.create(storeId, id, ownerId, {
                        sku: `${sku}-${size}`,
                        title: size,
                        optionValueId: values[size],
                    })
                ).id;
            }
            return { id, v: out };
        };
        const move = async (orderId: string, statuses: OrderStatus[]) => {
            for (const status of statuses) {
                await orders.updateStatus(storeId, orderId, ownerId, {
                    status,
                });
            }
        };

        it("an order from before the product counted holds nothing, and releases nothing", async () => {
            const { id, v: sv } = await withVariants("Kajal", "KJ");
            // Untracked: the order for S reserves nothing.
            const early = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: id, variantId: sv.S, quantity: 2 }],
            });
            expect(await stockRowOf(early.id)).toBe("NONE");

            await inventory.upsert(storeId, id, ownerId, { quantity: 10 });
            const later = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: id, variantId: sv.M, quantity: 2 }],
            });
            expect(await stockRowOf(later.id)).toBe("PRODUCT");
            expect(await own(id)).toEqual({ quantity: 10, reserved: 2 });
            // Only M's promise moves — S never reserved.
            const detail = await products.get(storeId, id, ownerId);
            expect(detail.variantPromises).toEqual({ [sv.M]: 2 });

            await inventory.setVariants(storeId, id, ownerId, {
                variants: [
                    { variantId: sv.S, quantity: 5, lowStockAlert: 1 },
                    { variantId: sv.M, quantity: 5, lowStockAlert: 1 },
                ],
            });
            expect(await stockOf(sv.S)).toEqual({ quantity: 5, reserved: 0 });
            expect(await stockOf(sv.M)).toEqual({ quantity: 5, reserved: 2 });
            expect(await own(id)).toEqual({ quantity: 0, reserved: 0 });
            expect(await stockRowOf(later.id)).toBe("VARIANT");

            await move(later.id, ["PROCESSING", "SHIPPED"]);
            await move(early.id, ["CANCELLED"]);
            expect(await stockOf(sv.S)).toEqual({ quantity: 5, reserved: 0 });
            expect(await stockOf(sv.M)).toEqual({ quantity: 3, reserved: 0 });
            expect(await own(id)).toEqual({ quantity: 0, reserved: 0 });
        });

        it("the product's row keeps exactly what lines without a variant promise, however often it's saved", async () => {
            const lip = (
                await products.create(storeId, ownerId, {
                    name: "Lip Tint",
                    price: "300",
                    currency: "INR",
                    optionId: sizeOptionId,
                })
            ).id;
            await inventory.upsert(storeId, lip, ownerId, { quantity: 10 });
            // Placed before the product had variants: names none.
            const whole = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: lip, quantity: 3 }],
            });
            const sv: Record<string, string> = {};
            for (const size of ["S", "M"]) {
                sv[size] = (
                    await variants.create(storeId, lip, ownerId, {
                        sku: `LT-${size}`,
                        title: size,
                        optionValueId: values[size],
                    })
                ).id;
            }
            const forS = await orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: lip, variantId: sv.S, quantity: 2 }],
            });
            expect(await own(lip)).toEqual({ quantity: 10, reserved: 5 });

            const counts = {
                variants: [
                    { variantId: sv.S, quantity: 4, lowStockAlert: 1 },
                    { variantId: sv.M, quantity: 1, lowStockAlert: 1 },
                ],
            };
            await inventory.setVariants(storeId, lip, ownerId, counts);
            expect(await own(lip)).toEqual({ quantity: 3, reserved: 3 });
            expect(await stockOf(sv.S)).toEqual({ quantity: 4, reserved: 2 });

            // A second save is no longer a switch: nothing moves again.
            await inventory.setVariants(storeId, lip, ownerId, counts);
            expect(await own(lip)).toEqual({ quantity: 3, reserved: 3 });
            expect(await stockOf(sv.S)).toEqual({ quantity: 4, reserved: 2 });

            await move(whole.id, ["CANCELLED"]);
            await move(forS.id, ["PROCESSING", "SHIPPED"]);
            expect(await own(lip)).toEqual({ quantity: 3, reserved: 0 });
            expect(await stockOf(sv.S)).toEqual({ quantity: 2, reserved: 0 });
            expect(await stockOf(sv.M)).toEqual({ quantity: 1, reserved: 0 });
        });
    });

    describe("an option for a product from before options", () => {
        it("takes its first option, then refuses a switch", async () => {
            const oil = (
                await products.create(storeId, ownerId, {
                    name: "Hair Oil",
                    price: "350",
                    currency: "INR",
                })
            ).id;
            // A variant from before options: a title, no value.
            await variants.create(storeId, oil, ownerId, {
                sku: "HO-100",
                title: "M",
            });
            const after = await products.patch(storeId, oil, ownerId, {
                optionId: sizeOptionId,
            });
            expect(after.optionId).toBe(sizeOptionId);

            const scent = await prisma.productOption.create({
                data: { storeId, organizationId: orgId, name: "Scent" },
            });
            await expect(
                products.patch(storeId, oil, ownerId, { optionId: scent.id }),
            ).rejects.toThrow(ConflictException);
            await expect(
                products.patch(storeId, oil, ownerId, { optionId: null }),
            ).rejects.toThrow(/without an option/);
        });
    });
});
