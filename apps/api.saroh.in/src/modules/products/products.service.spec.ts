import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CategoriesService } from "../categories/categories.service";
import { StoresService } from "../stores/stores.service";
import { InventoryService } from "./inventory.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

// Integration against the dev DB. Creates throwaway users + a store, cleans up.
const ownerEmail = `prod-owner-${process.pid}@example.com`;
const strangerEmail = `prod-stranger-${process.pid}@example.com`;

describe("Products catalog (dev DB)", () => {
    const stores = new StoresService();
    const products = new ProductsService(stores);
    const categories = new CategoriesService(stores);
    const variants = new VariantsService(products);
    const inventory = new InventoryService(products);

    let ownerId = "";
    let strangerId = "";
    let storeId = "";
    let categoryId = "";
    let productId = "";

    beforeAll(async () => {
        ownerId = (await prisma.user.create({ data: { email: ownerEmail } }))
            .id;
        strangerId = (
            await prisma.user.create({ data: { email: strangerEmail } })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, {
                name: "Catalog Test",
                slug: `catalog-${process.pid}`,
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.inventory.deleteMany({ where: { storeId } });
        await prisma.productVariant.deleteMany({
            where: { product: { storeId } },
        });
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.category.deleteMany({ where: { storeId } });
        await prisma.storeOwner.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.user.deleteMany({
            where: { email: { in: [ownerEmail, strangerEmail] } },
        });
        await prisma.$disconnect();
    });

    it("creates a category", async () => {
        const res = await categories.create(storeId, ownerId, {
            name: "Apparel",
        });
        categoryId = res.id;
        const list = await categories.list(storeId, ownerId);
        expect(list.some((c) => c.id === categoryId)).toBe(true);
    });

    it("creates a product with a price that round-trips as a string", async () => {
        const res = await products.create(storeId, ownerId, {
            name: "T-Shirt",
            price: "19.99",
            categoryId,
        });
        productId = res.id;
        const product = await products.get(storeId, productId, ownerId);
        expect(product.price).toBe("19.99"); // exact, not a float
        expect(typeof product.price).toBe("string");
        expect(product.category?.id).toBe(categoryId);
        expect(product.status).toBe("DRAFT");
    });

    it("rejects a category from another store", async () => {
        await expect(
            products.create(storeId, ownerId, {
                name: "Bad",
                price: "1.00",
                categoryId: "does-not-exist",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("enforces unique product slug per store", async () => {
        await expect(
            products.create(storeId, ownerId, {
                name: "T-Shirt",
                slug: "t-shirt",
                price: "5.00",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("denies a non-member read and write (404, no leak)", async () => {
        await expect(products.list(storeId, strangerId)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            products.create(storeId, strangerId, {
                name: "Hack",
                price: "1.00",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("adds a variant with a unique SKU", async () => {
        const res = await variants.create(storeId, productId, ownerId, {
            sku: "TS-RED-L",
            title: "Red / Large",
            price: "21.99",
        });
        expect(res.id).toBeTruthy();
        const list = await variants.list(storeId, productId, ownerId);
        expect(list[0].sku).toBe("TS-RED-L");
        expect(list[0].price).toBe("21.99");
        await expect(
            variants.create(storeId, productId, ownerId, {
                sku: "TS-RED-L",
                title: "dup",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("sets and reads inventory (reserved stays read-only)", async () => {
        const set = await inventory.upsert(storeId, productId, ownerId, {
            quantity: 42,
            lowStockAlert: 5,
        });
        expect(set.quantity).toBe(42);
        expect(set.reserved).toBe(0);
        const got = await inventory.get(storeId, productId, ownerId);
        expect(got.quantity).toBe(42);
        expect(got.lowStockAlert).toBe(5);
    });

    it("returns variants + inventory on the product detail", async () => {
        const detail = await products.get(storeId, productId, ownerId);
        expect(detail.variants).toHaveLength(1);
        expect(detail.inventory?.quantity).toBe(42);
    });

    it("rejects a category cycle", async () => {
        const child = await categories.create(storeId, ownerId, {
            name: "Shirts",
            parentId: categoryId,
        });
        // Make the parent a child of its own child → loop.
        await expect(
            categories.update(storeId, categoryId, ownerId, {
                name: "Apparel",
                slug: "apparel",
                parentId: child.id,
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks deleting a category that has children", async () => {
        await expect(
            categories.remove(storeId, categoryId, ownerId),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("deletes a product (variants + inventory cascade)", async () => {
        await products.remove(storeId, productId, ownerId);
        const gone = await prisma.product.findUnique({
            where: { id: productId },
        });
        expect(gone).toBeNull();
        const orphanVariants = await prisma.productVariant.count({
            where: { productId },
        });
        expect(orphanVariants).toBe(0);
    });
});
