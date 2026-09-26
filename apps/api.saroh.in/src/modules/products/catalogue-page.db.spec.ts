import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CollectionsService } from "../collections/collections.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { cataloguePage } from "./catalogue-page";
import { InventoryService } from "./inventory.service";
import { ListingsService } from "./listings.service";
import { ProductsService } from "./products.service";
import { VariantsService } from "./variants.service";

/**
 * The Products list, a page at a time (#519): the catalogue read with
 * `limit` pages, searches and narrows server-side, counts its chips and
 * says what needs restocking — for the whole catalogue, not the page.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Catalogue page (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const inventory = new InventoryService(products);
    const variants = new VariantsService(products);
    const listings = new ListingsService();
    const collections = new CollectionsService();

    let ownerId = "";
    let orgId = "";
    let otherOrgId = "";
    let hill = "";
    let online = "";
    let breads = "";
    let otherProduct = "";

    async function storefront(organizationId: string, name: string) {
        const store = await prisma.store.create({
            data: {
                name,
                slug: `cp-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                organizationId,
            },
        });
        await prisma.storeOwner.create({
            data: { storeId: store.id, userId: ownerId },
        });
        return store.id;
    }

    /** A published product at Hill Road with `quantity` on its shelf. */
    async function product(
        name: string,
        quantity: number | null,
        extra: { categoryId?: string; status?: string } = {},
    ) {
        const { id } = await products.create(hill, ownerId, {
            name,
            price: "120.00",
        });
        await prisma.product.update({
            where: { id },
            data: {
                status: extra.status ?? "PUBLISHED",
                categoryId: extra.categoryId ?? null,
            },
        });
        if (quantity !== null) {
            await inventory.upsert(hill, id, ownerId, {
                quantity,
                lowStockAlert: 5,
            });
        }
        return id;
    }

    const page = (query: Parameters<typeof cataloguePage>[2]) =>
        cataloguePage(products, orgId, { limit: 50, ...query });

    let sourdough = "";
    let bun = "";
    let rye = "";
    let draft = "";
    let mug = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `cp-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `cp-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `cp-else-${tag}` },
            })
        ).id;
        hill = await storefront(orgId, "Hill Road");
        online = await storefront(orgId, "Online");
        breads = (
            await prisma.category.create({
                data: {
                    organizationId: orgId,
                    name: "Breads",
                    slug: `breads-${tag}`,
                },
            })
        ).id;
        otherProduct = (
            await prisma.product.create({
                data: {
                    organizationId: otherOrgId,
                    name: "Their loaf",
                    slug: `their-loaf-${tag}`,
                    price: "90.00",
                },
            })
        ).id;

        // Made oldest first; the list reads newest first.
        sourdough = await product("Sourdough loaf", 30, {
            categoryId: breads,
        });
        await variants.create(hill, sourdough, ownerId, {
            sku: `SD-800-${tag}`,
            title: "Large",
        });
        bun = await product("Cinnamon bun", 4);
        rye = await product("Rye loaf", 0, { categoryId: breads });
        draft = await product("Focaccia", 0, { status: "DRAFT" });
        mug = await product("Mug", null);
        await prisma.product.update({
            where: { id: mug },
            data: { stockTracked: false },
        });
        // The bun sells Online too, where its shelf is empty.
        await listings.list(orgId, bun, online);
    });

    // The integration setup truncates every table after each file.

    it("pages newest first with a cursor, and says how many match", async () => {
        const first = await page({ limit: 2 });
        expect(first.items.map((i) => i.id)).toEqual([mug, draft]);
        expect(first.total).toBe(5);
        expect(first.nextCursor).toBe(draft);

        const second = await page({ limit: 2, cursor: first.nextCursor ?? "" });
        expect(second.items.map((i) => i.id)).toEqual([rye, bun]);
        const last = await page({ limit: 2, cursor: second.nextCursor ?? "" });
        expect(last.items.map((i) => i.id)).toEqual([sourdough]);
        expect(last.nextCursor).toBeNull();
    });

    it("searches names and SKUs, any case", async () => {
        expect((await page({ q: "LOAF" })).items.map((i) => i.id)).toEqual([
            rye,
            sourdough,
        ]);
        const bySku = await page({ q: `sd-800-${tag}` });
        expect(bySku.items.map((i) => i.id)).toEqual([sourdough]);
        expect(bySku.total).toBe(1);
        // The chips count the catalogue, not the search.
        expect(bySku.counts.all).toBe(5);
    });

    it("counts the chips, and narrows to collections and to what counts stock", async () => {
        await collections.create(orgId, { name: "Mugs", productIds: [mug] });
        await collections.create(orgId, {
            name: "Fresh bread",
            categoryId: breads,
        });
        const all = await page({});
        expect(all.counts).toEqual({ all: 5, collections: 3, inventory: 4 });

        const inColl = await page({ view: "collections" });
        expect(new Set(inColl.items.map((i) => i.id))).toEqual(
            new Set([mug, rye, sourdough]),
        );
        const tracked = await page({ view: "inventory" });
        expect(tracked.items.map((i) => i.id)).not.toContain(mug);
        expect(tracked.total).toBe(4);

        const bread = await collections.list(orgId);
        const fresh = bread.find((c) => c.name === "Fresh bread");
        expect(
            (await page({ collection: fresh?.id })).items.map((i) => i.id),
        ).toEqual([rye, sourdough]);
        expect(
            (await page({ category: breads })).items.map((i) => i.id),
        ).toEqual([rye, sourdough]);
    });

    it("says what needs restocking across the catalogue, published only", async () => {
        const { needs } = await page({ limit: 1 });
        // Rye: nothing on the shelf. Bun: 4 at Hill Road, 0 Online — low.
        // The draft focaccia is out too, but nobody can buy it yet.
        expect(needs.map((n) => [n.productId, n.kind])).toEqual([
            [rye, "out"],
            [bun, "low"],
        ]);

        await prisma.stockLevel.updateMany({
            where: { productId: bun, storeId: hill },
            data: { promised: 6 },
        });
        const short = await page({ view: "needs" });
        expect(short.needs[0]).toMatchObject({
            productId: bun,
            kind: "short",
            short: 2,
            canSell: 0,
        });
        expect(short.items.map((i) => i.id)).toEqual([rye, bun]);
        await prisma.stockLevel.updateMany({
            where: { productId: bun, storeId: hill },
            data: { promised: 0 },
        });
    });

    it("reads one storefront's shelf when narrowed to it", async () => {
        const at = await page({ storefront: online });
        expect(at.items.map((i) => i.id)).toEqual([bun]);
        expect(at.counts.all).toBe(1);
        // The storefront filter still counts the whole business.
        expect(at.storefronts).toEqual({
            everywhere: 5,
            byStorefront: [
                { id: hill, name: "Hill Road", count: 5 },
                { id: online, name: "Online", count: 1 },
            ],
        });
        // Online has nothing of the bun on its shelf.
        expect(at.needs).toEqual([
            expect.objectContaining({ productId: bun, kind: "out" }),
        ]);
    });

    it("refuses ids from another business", async () => {
        await expect(page({ cursor: otherProduct })).rejects.toThrow(
            NotFoundException,
        );
        await expect(page({ collection: "nope" })).rejects.toThrow(
            NotFoundException,
        );
        await expect(page({ category: "nope" })).rejects.toThrow(
            NotFoundException,
        );
        await expect(
            cataloguePage(products, otherOrgId, { storefront: hill, limit: 5 }),
        ).rejects.toThrow(NotFoundException);
    });

    it("keeps the unpaged read an array for older callers", async () => {
        const all = await products.catalogue(orgId);
        expect(all.map((i) => i.id)).toEqual([mug, draft, rye, bun, sourdough]);
    });
});
