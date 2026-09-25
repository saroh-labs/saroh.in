import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { variantHasHistory } from "../stock/stock-words";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * Characterization (#510): what a one-storefront business sees of its
 * products and their stock, pinned before listings and StockLevel replaced
 * Product.storeId and Inventory. Everything goes through the services, so
 * the same assertions hold on either storage.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Products at one storefront (characterization, DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const variants = new VariantsService(products);
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let customerId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `char-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Char Org", slug: `char-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Char Store",
                slug: `char-${tag}`,
            })
        ).id;
        customerId = (
            await customers.create(storeId, ownerId, {
                email: `char-buyer-${tag}@example.com`,
            })
        ).id;
    });

    it("lists, reads and edits a product counted as a whole", async () => {
        const { id } = await products.create(storeId, ownerId, {
            name: "Sourdough",
            price: "120.00",
        });
        await inventory.upsert(storeId, id, ownerId, {
            quantity: 8,
            lowStockAlert: 3,
        });

        const row = (await products.list(storeId, ownerId)).find(
            (p) => p.id === id,
        );
        expect(row).toMatchObject({
            storeId,
            name: "Sourdough",
            slug: "sourdough",
            price: "120.00",
            variantCount: 0,
            sku: null,
            variants: [],
            inventory: { quantity: 8, lowStockAlert: 3 },
        });

        const detail = await products.get(storeId, id, ownerId);
        expect(detail).toMatchObject({
            storeId,
            stockMode: "product",
            inventory: { quantity: 8, reserved: 0, lowStockAlert: 3 },
            variants: [],
            variantPromises: {},
        });

        const patched = await products.patch(storeId, id, ownerId, {
            name: "Country sourdough",
        });
        expect(patched.name).toBe("Country sourdough");
        expect(patched.inventory).toEqual({
            quantity: 8,
            reserved: 0,
            lowStockAlert: 3,
        });

        expect(await inventory.get(storeId, id, ownerId)).toEqual({
            productId: id,
            tracked: true,
            mode: "product",
            quantity: 8,
            reserved: 0,
            lowStockAlert: 3,
            variants: [],
        });
    });

    it("holds, sells and releases a whole product's stock through orders", async () => {
        const { id } = await products.create(storeId, ownerId, {
            name: "Rye loaf",
            price: "90.00",
        });
        await inventory.upsert(storeId, id, ownerId, { quantity: 5 });

        const a = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: id, quantity: 2 }],
        });
        expect(await inventory.get(storeId, id, ownerId)).toMatchObject({
            quantity: 5,
            reserved: 2,
        });
        await expect(
            orders.create(storeId, ownerId, {
                customerId,
                items: [{ productId: id, quantity: 4 }],
            }),
        ).rejects.toBeInstanceOf(ConflictException);

        await orders.updateStatus(storeId, a.id, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(storeId, a.id, ownerId, {
            status: "SHIPPED",
        });
        expect(await inventory.get(storeId, id, ownerId)).toMatchObject({
            quantity: 3,
            reserved: 0,
        });

        const b = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: id, quantity: 3 }],
        });
        await orders.updateStatus(storeId, b.id, ownerId, {
            status: "CANCELLED",
        });
        expect(await inventory.get(storeId, id, ownerId)).toMatchObject({
            quantity: 3,
            reserved: 0,
        });

        // Setting the count never touches what is promised.
        const c = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: id, quantity: 1 }],
        });
        await inventory.upsert(storeId, id, ownerId, { quantity: 9 });
        expect(await inventory.get(storeId, id, ownerId)).toMatchObject({
            quantity: 9,
            reserved: 1,
        });
        await orders.updateStatus(storeId, c.id, ownerId, {
            status: "CANCELLED",
        });
    });

    it("switches to per-variant stock, taking open promises with it", async () => {
        const { id } = await products.create(storeId, ownerId, {
            name: "Tee",
            price: "500.00",
        });
        const small = await variants.create(storeId, id, ownerId, {
            sku: `TEE-S-${tag}`,
            title: "Small",
        });
        const large = await variants.create(storeId, id, ownerId, {
            sku: `TEE-L-${tag}`,
            title: "Large",
            price: "550.00",
        });
        await inventory.upsert(storeId, id, ownerId, { quantity: 10 });

        const open = await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: id, variantId: small.id, quantity: 2 }],
        });
        expect(await inventory.get(storeId, id, ownerId)).toMatchObject({
            mode: "product",
            quantity: 10,
            reserved: 2,
        });
        expect(
            (await products.get(storeId, id, ownerId)).variantPromises,
        ).toEqual({ [small.id]: 2 });

        const view = await inventory.setVariants(storeId, id, ownerId, {
            variants: [
                { variantId: small.id, quantity: 4, lowStockAlert: 1 },
                { variantId: large.id, quantity: 6, lowStockAlert: 2 },
            ],
        });
        expect(view.mode).toBe("variant");
        expect(view.quantity).toBe(0);
        expect(view.reserved).toBe(0);
        expect(
            [...view.variants].sort((x, y) => x.quantity - y.quantity),
        ).toEqual([
            {
                variantId: small.id,
                quantity: 4,
                reserved: 2,
                lowStockAlert: 1,
            },
            {
                variantId: large.id,
                quantity: 6,
                reserved: 0,
                lowStockAlert: 2,
            },
        ]);

        const row = (await products.list(storeId, ownerId)).find(
            (p) => p.id === id,
        );
        expect(row).toMatchObject({
            variantCount: 2,
            sku: `TEE-S-${tag}`,
            inventory: { quantity: 10, lowStockAlert: 1 },
        });
        const detail = await products.get(storeId, id, ownerId);
        expect(detail.stockMode).toBe("variant");
        expect(
            detail.variants.map((v) => [v.title, v.inventory?.quantity]),
        ).toEqual([
            ["Small", 4],
            ["Large", 6],
        ]);

        // The moved line fulfils from its variant's row.
        await orders.updateStatus(storeId, open.id, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(storeId, open.id, ownerId, {
            status: "SHIPPED",
        });
        const after = await inventory.get(storeId, id, ownerId);
        expect(after.variants.find((v) => v.variantId === small.id)).toEqual({
            variantId: small.id,
            quantity: 2,
            reserved: 0,
            lowStockAlert: 1,
        });

        // A variant added now starts counted at nothing.
        const medium = await variants.create(storeId, id, ownerId, {
            sku: `TEE-M-${tag}`,
            title: "Medium",
        });
        const withMedium = await inventory.get(storeId, id, ownerId);
        expect(
            withMedium.variants.find((v) => v.variantId === medium.id),
        ).toMatchObject({ quantity: 0, reserved: 0 });

        // A variant never counted or sold can be removed; one with a stock
        // log can't — removing it would erase its history (DEC-032).
        await variants.remove(storeId, id, medium.id, ownerId);
        await expect(
            variants.remove(storeId, id, large.id, ownerId),
        ).rejects.toThrow(variantHasHistory("Large"));
        await expect(
            variants.remove(storeId, id, small.id, ownerId),
        ).rejects.toThrow(variantHasHistory("Small"));
        const still = await inventory.get(storeId, id, ownerId);
        expect(still.mode).toBe("variant");
        expect(still.variants.map((v) => v.variantId).sort()).toEqual(
            [small.id, large.id].sort(),
        );
    });

    it("refuses to remove a variant with stock promised to an open order", async () => {
        const { id } = await products.create(storeId, ownerId, {
            name: "Scarf",
            price: "300.00",
        });
        const red = await variants.create(storeId, id, ownerId, {
            sku: `SCARF-R-${tag}`,
            title: "Red",
        });
        await inventory.setVariants(storeId, id, ownerId, {
            variants: [{ variantId: red.id, quantity: 3, lowStockAlert: 1 }],
        });
        await orders.create(storeId, ownerId, {
            customerId,
            items: [{ productId: id, variantId: red.id, quantity: 1 }],
        });
        await expect(
            variants.remove(storeId, id, red.id, ownerId),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
