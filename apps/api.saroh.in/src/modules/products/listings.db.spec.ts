import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CustomersService } from "../customers/customers.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ListingsService } from "./listings.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * Listings and stock per storefront (#510): a business's catalogue product
 * sold at Hill Road and Online, each with its own shelf.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Listings and StockLevel per storefront (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const variants = new VariantsService(products);
    const customers = new CustomersService(stores);
    const orders = new OrdersService(stores);
    const listings = new ListingsService();

    let ownerId = "";
    let orgId = "";
    let hill = "";
    let online = "";
    let otherOrgId = "";
    let otherStore = "";
    const buyer: Record<string, string> = {};

    /** A storefront of the business, owned by the owner (the cap is U3's). */
    async function storefront(organizationId: string, name: string) {
        const store = await prisma.store.create({
            data: {
                name,
                slug: `ls-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                organizationId,
            },
        });
        await prisma.storeOwner.create({
            data: { storeId: store.id, userId: ownerId },
        });
        return store.id;
    }

    const shelf = async (storeId: string, productId: string) => {
        const row = await prisma.stockLevel.findFirst({
            where: { storeId, productId, variantId: null },
            select: { id: true, onHand: true, promised: true },
        });
        return row;
    };
    const variantShelf = async (storeId: string, variantId: string) => {
        const row = await prisma.stockLevel.findFirstOrThrow({
            where: { storeId, variantId },
            select: { onHand: true, promised: true },
        });
        return { onHand: row.onHand, promised: row.promised };
    };

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `ls-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `ls-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `ls-else-${tag}` },
            })
        ).id;
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        otherStore = await storefront(otherOrgId, "Elsewhere");
        for (const store of [hill, online]) {
            buyer[store] = (
                await customers.create(store, ownerId, {
                    email: `ls-buyer-${store}@example.com`,
                })
            ).id;
        }
    });

    it("lists at a second storefront at 0, keeps the shelf when unlisted, and reuses it when listed again", async () => {
        const { id } = await products.create(hill, ownerId, {
            name: "Sourdough",
            price: "120.00",
        });
        await inventory.upsert(hill, id, ownerId, { quantity: 8 });
        // Only Hill Road sells it so far.
        await expect(products.get(online, id, ownerId)).rejects.toThrow(
            NotFoundException,
        );

        const listed = await listings.list(orgId, id, online);
        expect(listed).toMatchObject({
            storeId: online,
            listed: true,
            stock: { quantity: 0, reserved: 0 },
        });
        const first = await shelf(online, id);
        expect(first).toMatchObject({ onHand: 0, promised: 0 });
        // Hill Road's shelf is its own.
        expect(await shelf(hill, id)).toMatchObject({ onHand: 8 });
        expect(
            (await products.get(online, id, ownerId)).inventory,
        ).toMatchObject({ quantity: 0 });

        await inventory.upsert(online, id, ownerId, { quantity: 5 });
        const unlisted = await listings.unlist(orgId, id, online);
        expect(unlisted.listed).toBe(false);
        // Unlisting keeps the row and its stock ("Not sold here · 5 on hand").
        expect(unlisted.stock).toMatchObject({ quantity: 5 });
        expect(await shelf(online, id)).toMatchObject({
            id: first?.id,
            onHand: 5,
        });
        await expect(products.get(online, id, ownerId)).rejects.toThrow(
            NotFoundException,
        );
        await expect(
            orders.create(online, ownerId, {
                customerId: buyer[online],
                items: [{ productId: id, quantity: 1 }],
            }),
        ).rejects.toThrow(BadRequestException);

        await listings.list(orgId, id, online);
        expect(await shelf(online, id)).toMatchObject({
            id: first?.id,
            onHand: 5,
        });
        expect(
            await prisma.stockLevel.count({
                where: { storeId: online, productId: id },
            }),
        ).toBe(1);

        const everywhere = await listings.storefronts(orgId, id);
        expect(
            everywhere.map((s) => [s.storeName, s.listed, s.stock?.quantity]),
        ).toEqual([
            ["Hill Road", true, 8],
            ["Online", true, 5],
        ]);
    });

    it("a variant left out at a storefront reads Not sold here and can't be ordered there", async () => {
        const { id } = await products.create(hill, ownerId, {
            name: "Tee",
            price: "500.00",
        });
        const small = await variants.create(hill, id, ownerId, {
            sku: `LS-TEE-S-${tag}`,
            title: "Small",
        });
        const large = await variants.create(hill, id, ownerId, {
            sku: `LS-TEE-L-${tag}`,
            title: "Large",
        });
        await inventory.setVariants(hill, id, ownerId, {
            variants: [
                { variantId: small.id, quantity: 4, lowStockAlert: 1 },
                { variantId: large.id, quantity: 4, lowStockAlert: 1 },
            ],
        });

        const view = await listings.list(orgId, id, online, [small.id]);
        expect(view.variants).toEqual([
            {
                variantId: small.id,
                soldHere: true,
                stock: { quantity: 0, reserved: 0, lowStockAlert: 1 },
            },
            // No shelf made for a variant the storefront doesn't sell.
            { variantId: large.id, soldHere: false, stock: null },
        ]);

        const detail = await products.get(online, id, ownerId);
        expect(detail.variants.map((v) => [v.title, v.soldHere])).toEqual([
            ["Small", true],
            ["Large", false],
        ]);
        const row = (await products.list(online, ownerId)).find(
            (p) => p.id === id,
        );
        expect(row?.variants.map((v) => v.id)).toEqual([small.id]);

        await expect(
            orders.create(online, ownerId, {
                customerId: buyer[online],
                items: [{ productId: id, variantId: large.id, quantity: 1 }],
            }),
        ).rejects.toThrow("isn't sold at this storefront");
        // Hill Road still sells both.
        await orders.create(hill, ownerId, {
            customerId: buyer[hill],
            items: [{ productId: id, variantId: large.id, quantity: 1 }],
        });

        // Selling it again makes its shelf at 0.
        const both = await listings.setVariants(orgId, id, online, [
            small.id,
            large.id,
        ]);
        expect(both.variants.every((v) => v.soldHere)).toBe(true);
        expect(await variantShelf(online, large.id)).toEqual({
            onHand: 0,
            promised: 0,
        });
        // A variant added now is sold at both, and counted at both.
        const medium = await variants.create(hill, id, ownerId, {
            sku: `LS-TEE-M-${tag}`,
            title: "Medium",
        });
        for (const store of [hill, online]) {
            expect(await variantShelf(store, medium.id)).toEqual({
                onHand: 0,
                promised: 0,
            });
            const at = await listings.at(orgId, id, store);
            expect(
                at.variants.find((v) => v.variantId === medium.id)?.soldHere,
            ).toBe(true);
        }
    });

    it("switching to variants with open orders at two storefronts moves each storefront's held units", async () => {
        const { id } = await products.create(hill, ownerId, {
            name: "Scarf",
            price: "300.00",
        });
        const red = await variants.create(hill, id, ownerId, {
            sku: `LS-SC-R-${tag}`,
            title: "Red",
        });
        const blue = await variants.create(hill, id, ownerId, {
            sku: `LS-SC-B-${tag}`,
            title: "Blue",
        });
        await inventory.upsert(hill, id, ownerId, { quantity: 10 });
        await listings.list(orgId, id, online);
        await inventory.upsert(online, id, ownerId, { quantity: 6 });

        const atHill = await orders.create(hill, ownerId, {
            customerId: buyer[hill],
            items: [{ productId: id, variantId: red.id, quantity: 2 }],
        });
        const atOnline = await orders.create(online, ownerId, {
            customerId: buyer[online],
            items: [
                { productId: id, variantId: red.id, quantity: 1 },
                { productId: id, variantId: blue.id, quantity: 3 },
            ],
        });
        expect(await shelf(hill, id)).toMatchObject({
            onHand: 10,
            promised: 2,
        });
        expect(await shelf(online, id)).toMatchObject({
            onHand: 6,
            promised: 4,
        });
        // What the editor at Online seeds the switch from: its own promises.
        expect(
            (await products.get(online, id, ownerId)).variantPromises,
        ).toEqual({ [red.id]: 1, [blue.id]: 3 });

        // The switch is made at Hill Road, with Hill Road's counts.
        await inventory.setVariants(hill, id, ownerId, {
            variants: [
                { variantId: red.id, quantity: 7, lowStockAlert: 2 },
                { variantId: blue.id, quantity: 3, lowStockAlert: 2 },
            ],
        });
        expect(await variantShelf(hill, red.id)).toEqual({
            onHand: 7,
            promised: 2,
        });
        expect(await variantShelf(hill, blue.id)).toEqual({
            onHand: 3,
            promised: 0,
        });
        // Online: each variant holds what its open lines there promise;
        // the first also takes what was free to sell (6 − 4 = 2).
        expect(await variantShelf(online, red.id)).toEqual({
            onHand: 3,
            promised: 1,
        });
        expect(await variantShelf(online, blue.id)).toEqual({
            onHand: 3,
            promised: 3,
        });
        expect(await shelf(hill, id)).toMatchObject({ onHand: 0, promised: 0 });
        expect(await shelf(online, id)).toMatchObject({
            onHand: 0,
            promised: 0,
        });

        // Each line now sits on its own storefront's variant row.
        const lines = await prisma.orderItem.findMany({
            where: { orderId: { in: [atHill.id, atOnline.id] } },
            select: {
                stockRow: true,
                heldQuantity: true,
                quantity: true,
                variantId: true,
                stockLevel: { select: { storeId: true, variantId: true } },
                order: { select: { storeId: true } },
            },
        });
        for (const line of lines) {
            expect(line.stockRow).toBe("VARIANT");
            expect(line.heldQuantity).toBe(line.quantity);
            expect(line.stockLevel).toEqual({
                storeId: line.order.storeId,
                variantId: line.variantId,
            });
        }

        // Fulfilling at Online takes from Online's rows only.
        await orders.updateStatus(online, atOnline.id, ownerId, {
            status: "PROCESSING",
        });
        await orders.updateStatus(online, atOnline.id, ownerId, {
            status: "SHIPPED",
        });
        expect(await variantShelf(online, blue.id)).toEqual({
            onHand: 0,
            promised: 0,
        });
        expect(await variantShelf(online, red.id)).toEqual({
            onHand: 2,
            promised: 0,
        });
        expect(await variantShelf(hill, red.id)).toEqual({
            onHand: 7,
            promised: 2,
        });
    });

    it("refuses a listing at another business's storefront, and the database refuses a shelf pairing two businesses", async () => {
        const { id } = await products.create(hill, ownerId, {
            name: "Rye loaf",
            price: "90.00",
        });
        await expect(listings.list(orgId, id, otherStore)).rejects.toThrow(
            NotFoundException,
        );
        await expect(listings.list(otherOrgId, id, otherStore)).rejects.toThrow(
            NotFoundException,
        );
        await expect(listings.storefronts(otherOrgId, id)).rejects.toThrow(
            NotFoundException,
        );

        // Straight to the database: a shelf at another business's storefront.
        await expect(
            prisma.stockLevel.create({
                data: {
                    organizationId: orgId,
                    storeId: otherStore,
                    productId: id,
                },
            }),
        ).rejects.toThrow();
        await expect(
            prisma.stockLevel.create({
                data: {
                    organizationId: otherOrgId,
                    storeId: otherStore,
                    productId: id,
                },
            }),
        ).rejects.toThrow();
        await expect(
            prisma.productListing.create({
                data: {
                    organizationId: otherOrgId,
                    storeId: otherStore,
                    productId: id,
                },
            }),
        ).rejects.toThrow();
        // A variant of another product can't be shelved under this one.
        const other = await products.create(hill, ownerId, {
            name: "Baguette",
            price: "60.00",
        });
        const stick = await variants.create(hill, other.id, ownerId, {
            sku: `LS-BAG-${tag}`,
            title: "Stick",
        });
        await expect(
            prisma.stockLevel.create({
                data: {
                    organizationId: orgId,
                    storeId: hill,
                    productId: id,
                    variantId: stick.id,
                },
            }),
        ).rejects.toThrow();
        // And one storefront has one whole-product shelf per product.
        await inventory.upsert(hill, id, ownerId, { quantity: 1 });
        await expect(
            prisma.stockLevel.create({
                data: { organizationId: orgId, storeId: hill, productId: id },
            }),
        ).rejects.toThrow();
    });

    it("gives a product an address unique in its business, whichever storefront made it", async () => {
        await products.create(hill, ownerId, {
            name: "Focaccia",
            price: "150.00",
        });
        await expect(
            products.create(online, ownerId, {
                name: "Focaccia",
                price: "150.00",
            }),
        ).rejects.toThrow("That slug is already taken");
    });
});
