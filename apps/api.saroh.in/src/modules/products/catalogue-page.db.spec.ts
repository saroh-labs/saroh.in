import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CollectionsService } from "../collections/collections.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { readLevels } from "../stock/levels-read";
import type { StockReader } from "../stock/stock-access";
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

    it("says what needs restocking across the catalogue, shelf by shelf, as Stock does", async () => {
        const { needs } = await page({ limit: 1 });
        // Bun: 4 at Hill Road (low) but 0 Online — sold out there. The
        // draft focaccia counts, as it does on Stock; an archived product
        // never would. Rye: nothing on its one shelf.
        expect(needs.map((n) => [n.productId, n.kind, n.where])).toEqual([
            [bun, "out", ["Online"]],
            [draft, "out", null],
            [rye, "out", null],
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
            where: ["Hill Road"],
        });
        expect(short.items.map((i) => i.id)).toEqual([draft, rye, bun]);
        await prisma.stockLevel.updateMany({
            where: { productId: bun, storeId: hill },
            data: { promised: 0 },
        });
    });

    it("agrees with the Stock screen's Needs you, and leaves archived products out", async () => {
        const reader: StockReader = {
            organizationId: orgId,
            canWrite: true,
            seesPeople: true,
            seesOrders: true,
        };
        const stockNeeds = async () =>
            new Set(
                (await readLevels(reader, { needs: true })).rows.map(
                    (r) => r.productId,
                ),
            );
        const listNeeds = async () =>
            new Set((await page({ limit: 1 })).needs.map((n) => n.productId));
        expect(await listNeeds()).toEqual(await stockNeeds());

        await prisma.product.update({
            where: { id: rye },
            data: { status: "ARCHIVED" },
        });
        try {
            expect(await listNeeds()).not.toContain(rye);
            expect(await stockNeeds()).not.toContain(rye);
            expect((await readLevels(reader, {})).needsYou).toBe(2);
        } finally {
            await prisma.product.update({
                where: { id: rye },
                data: { status: "PUBLISHED" },
            });
        }
    });

    it("never drops a product when the one a page ended on has left the view", async () => {
        const first = await page({ view: "needs", limit: 1 });
        expect(first.items.map((i) => i.id)).toEqual([draft]);
        // Restocked from the list: the focaccia no longer needs anyone.
        await prisma.stockLevel.updateMany({
            where: { productId: draft },
            data: { onHand: 40 },
        });
        try {
            const next = await page({
                view: "needs",
                limit: 1,
                cursor: first.nextCursor ?? "",
            });
            expect(next.items.map((i) => i.id)).toEqual([rye]);
        } finally {
            await prisma.stockLevel.updateMany({
                where: { productId: draft },
                data: { onHand: 0 },
            });
        }
    });

    it("pages products made at the same moment by id, none twice and none lost", async () => {
        const same = new Date("2026-01-01T00:00:00Z");
        const was = await prisma.product.findMany({
            where: { id: { in: [rye, bun, sourdough] } },
            select: { id: true, createdAt: true },
        });
        await prisma.product.updateMany({
            where: { id: { in: [rye, bun, sourdough] } },
            data: { createdAt: same },
        });
        try {
            const seen: string[] = [];
            let cursor: string | undefined;
            do {
                const p = await page({ view: "all", limit: 1, cursor });
                seen.push(...p.items.map((i) => i.id));
                cursor = p.nextCursor ?? undefined;
            } while (cursor);
            expect(seen).toHaveLength(5);
            expect(new Set(seen).size).toBe(5);
            expect(seen.slice(2)).toEqual([rye, bun, sourdough].sort());
        } finally {
            for (const p of was) {
                await prisma.product.update({
                    where: { id: p.id },
                    data: { createdAt: p.createdAt },
                });
            }
        }
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
