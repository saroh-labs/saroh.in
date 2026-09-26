import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CategoriesService } from "../categories/categories.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductAccess } from "../products/product-access";
import { ProductOverviewService } from "../products/product-overview.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { CollectionsService, tooManyKept } from "./collections.service";
import type { ProductBlockReader } from "./website-pages";
import { websitePagesFor } from "./website-pages";

/**
 * Collections (#516) against a real database: hand-picked ones keep their
 * products in order, automatic ones follow their category, archived
 * products show in neither, and another business's rows are not found.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Collections (DB)", () => {
    const flags = {
        isEnabled: () => Promise.resolve(true),
    } as unknown as FeatureFlagService;
    const stores = new StoresService(flags);
    const access = new ProductAccess(stores);
    const products = new ProductsService(stores, undefined, access);
    const overview = new ProductOverviewService(products);
    const collections = new CollectionsService();
    const categories = new CategoriesService();

    let orgId = "";
    let ownerId = "";
    let storeId = "";
    let otherOrgId = "";
    let otherProduct = "";
    let otherCategory = "";
    let breads = "";
    let sourdoughs = "";
    let cakes = "";

    const ctx = (): OrganizationContext => ({
        organizationId: orgId,
        userId: ownerId,
        role: "OWNER",
    });

    /** A product sold at the storefront, in `categoryId`. */
    async function product(name: string, categoryId: string | null = null) {
        const scope = await access.write(ctx(), undefined, storeId);
        const { id } = await products.createIn(scope, {
            name: `${name} ${tag}`,
            price: "120.00",
        });
        await prisma.product.update({
            where: { id },
            data: { categoryId, status: "PUBLISHED" },
        });
        return id;
    }

    const setStatus = (id: string, status: string) =>
        prisma.product.update({
            where: { id },
            data: {
                status,
                archivedAt: status === "ARCHIVED" ? new Date() : null,
            },
        });

    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `col-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Rye & Co.", slug: `col-rye-${tag}` },
            })
        ).id;
        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Elsewhere", slug: `col-else-${tag}` },
            })
        ).id;
        await prisma.membership.create({
            data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
        });
        storeId = (
            await prisma.store.create({
                data: {
                    name: "Hill Road",
                    slug: `col-hill-${tag}`,
                    organizationId: orgId,
                },
            })
        ).id;
        const cat = async (organizationId: string, name: string) =>
            (
                await prisma.category.create({
                    data: {
                        organizationId,
                        name,
                        slug: `${name.toLowerCase()}-${tag}`,
                    },
                })
            ).id;
        breads = await cat(orgId, "Breads");
        cakes = await cat(orgId, "Cakes");
        sourdoughs = (
            await prisma.category.create({
                data: {
                    organizationId: orgId,
                    name: "Sourdoughs",
                    slug: `sourdoughs-${tag}`,
                    parentId: breads,
                },
            })
        ).id;
        otherCategory = await cat(otherOrgId, "Their breads");
        otherProduct = (
            await prisma.product.create({
                data: {
                    organizationId: otherOrgId,
                    name: "Their loaf",
                    slug: `their-loaf-${tag}`,
                    price: "90.00",
                    status: "PUBLISHED",
                },
            })
        ).id;
    });

    // The integration setup truncates every table after each file.

    it("a hand-picked collection lists its products in order; add, reorder and remove work", async () => {
        const rye = await product("Rye");
        const bun = await product("Bun");
        const tart = await product("Tart");

        const made = await collections.create(orgId, {
            name: "Weekend",
            productIds: [tart, rye],
        });
        expect(made.kind).toBe("HAND_PICKED");
        expect(made.category).toBeNull();
        expect(ids(made.products)).toEqual([tart, rye]);

        const added = await collections.addProducts(orgId, made.id, [bun, rye]);
        expect(ids(added.products)).toEqual([tart, rye, bun]);

        const reordered = await collections.setProducts(orgId, made.id, [
            bun,
            tart,
            rye,
        ]);
        expect(ids(reordered.products)).toEqual([bun, tart, rye]);

        const removed = await collections.removeProduct(orgId, made.id, tart);
        expect(ids(removed.products)).toEqual([bun, rye]);

        const listed = await collections.list(orgId);
        expect(listed.find((c) => c.id === made.id)).toMatchObject({
            name: "Weekend",
            kind: "HAND_PICKED",
            productCount: 2,
        });
    });

    it("an automatic Breads collection follows products moving into and out of Breads", async () => {
        const loaf = await product("Loaf", breads);
        const starter = await product("Starter", sourdoughs);
        const cake = await product("Cake", cakes);

        const auto = await collections.create(orgId, {
            name: "Fresh bread",
            categoryId: breads,
        });
        expect(auto.kind).toBe("AUTOMATIC");
        expect(auto.category).toEqual({ id: breads, name: "Breads" });
        // The categories inside Breads count, as they do for a discount.
        expect(ids(auto.products).sort()).toEqual([loaf, starter].sort());
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: auto.id },
            }),
        ).toBe(0);

        await prisma.product.update({
            where: { id: cake },
            data: { categoryId: breads },
        });
        await prisma.product.update({
            where: { id: loaf },
            data: { categoryId: cakes },
        });
        const after = await collections.get(orgId, auto.id);
        expect(ids(after.products).sort()).toEqual([cake, starter].sort());
        expect(
            (await collections.list(orgId)).find((c) => c.id === auto.id)
                ?.productCount,
        ).toBe(2);

        const placed = await collections.forProduct(orgId, starter);
        expect(placed.collections).toEqual([
            expect.objectContaining({
                id: auto.id,
                kind: "AUTOMATIC",
                showing: true,
            }),
        ]);

        // Pointed at another category, it follows that one.
        const moved = await collections.update(orgId, auto.id, {
            categoryId: cakes,
        });
        expect(ids(moved.products)).toEqual([loaf]);
    });

    it("an archived product leaves both kinds; Sell again restores its hand-picked place", async () => {
        const scone = await product("Scone", cakes);
        const muffin = await product("Muffin", cakes);
        const picked = await collections.create(orgId, {
            name: "Tea time",
            productIds: [scone, muffin],
        });
        const auto = await collections.create(orgId, {
            name: "All cakes",
            categoryId: cakes,
        });

        await setStatus(scone, "ARCHIVED");
        const hidden = await collections.get(orgId, picked.id);
        expect(ids(hidden.products)).toEqual([muffin]);
        expect(hidden.hiddenCount).toBe(1);
        expect(
            ids((await collections.get(orgId, auto.id)).products),
        ).not.toContain(scone);
        expect(
            (await collections.list(orgId)).find((c) => c.id === picked.id)
                ?.productCount,
        ).toBe(1);

        // Saving the order the screen shows keeps the hidden one.
        await collections.setProducts(orgId, picked.id, [muffin]);
        const placed = await collections.forProduct(orgId, scone);
        expect(placed.collections).toEqual([
            expect.objectContaining({
                id: picked.id,
                kind: "HAND_PICKED",
                showing: false,
            }),
        ]);

        await setStatus(scone, "PUBLISHED");
        expect(ids((await collections.get(orgId, picked.id)).products)).toEqual(
            [muffin, scone],
        );
        expect(ids((await collections.get(orgId, auto.id)).products)).toContain(
            scone,
        );
    });

    it("an automatic collection can't be edited by hand, and its category can't be deleted", async () => {
        const buns = (
            await prisma.category.create({
                data: {
                    organizationId: orgId,
                    name: "Buns",
                    slug: `buns-${tag}`,
                },
            })
        ).id;
        const roll = await product("Roll", buns);
        const auto = await collections.create(orgId, {
            name: "Bread basket",
            categoryId: buns,
        });

        const fills =
            "Bread basket fills itself from Buns, so its products can't be picked by hand. Change its category instead.";
        await expect(
            collections.addProducts(orgId, auto.id, [roll]),
        ).rejects.toThrow(fills);
        await expect(
            collections.setProducts(orgId, auto.id, [roll]),
        ).rejects.toThrow(ConflictException);
        await expect(
            collections.removeProduct(orgId, auto.id, roll),
        ).rejects.toThrow(ConflictException);
        await expect(
            collections.setForProduct(orgId, roll, {
                collectionIds: [auto.id],
            }),
        ).rejects.toThrow(fills);

        // Never both, and never a change of kind.
        await expect(
            collections.create(orgId, {
                name: "Both",
                categoryId: buns,
                productIds: [roll],
            }),
        ).rejects.toThrow(BadRequestException);
        const picked = await collections.create(orgId, { name: "Gifts" });
        await expect(
            collections.update(orgId, picked.id, { categoryId: buns }),
        ).rejects.toThrow(ConflictException);

        await expect(categories.remove(orgId, buns)).rejects.toThrow(
            "The Bread basket collection fills itself from Buns. Change it or delete it in Collections first.",
        );
        await expect(
            categories.merge(orgId, buns, { intoId: cakes }),
        ).rejects.toThrow(ConflictException);
        expect(await prisma.category.count({ where: { id: buns } })).toBe(1);
        expect(
            (await prisma.product.findUniqueOrThrow({ where: { id: roll } }))
                .categoryId,
        ).toBe(buns);

        // Once no collection uses it, it goes.
        await collections.remove(orgId, auto.id);
        await categories.remove(orgId, buns);
        expect(await prisma.category.count({ where: { id: buns } })).toBe(0);
    });

    it("the key itself refuses to delete a category a collection uses", async () => {
        const seasonal = await prisma.category.create({
            data: {
                organizationId: orgId,
                name: "Seasonal",
                slug: `seasonal-${tag}`,
            },
        });
        await collections.create(orgId, {
            name: "This season",
            categoryId: seasonal.id,
        });
        await expect(
            prisma.category.delete({ where: { id: seasonal.id } }),
        ).rejects.toThrow();
    });

    it("another business's product, category or collection is not found", async () => {
        const mine = await collections.create(orgId, { name: "Mine" });
        await expect(
            collections.addProducts(orgId, mine.id, [otherProduct]),
        ).rejects.toThrow(NotFoundException);
        await expect(
            collections.create(orgId, {
                name: "Theirs picked",
                productIds: [otherProduct],
            }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            collections.create(orgId, {
                name: "Theirs automatic",
                categoryId: otherCategory,
            }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            collections.update(orgId, mine.id, { categoryId: otherCategory }),
        ).rejects.toThrow(ConflictException);
        await expect(
            collections.forProduct(orgId, otherProduct),
        ).rejects.toThrow(NotFoundException);

        const theirs = await collections.create(otherOrgId, {
            name: "Their picks",
            productIds: [otherProduct],
        });
        await expect(collections.get(orgId, theirs.id)).rejects.toThrow(
            NotFoundException,
        );
        await expect(collections.remove(orgId, theirs.id)).rejects.toThrow(
            NotFoundException,
        );
        const mineProduct = await product("Mine only");
        await expect(
            collections.setForProduct(orgId, mineProduct, {
                collectionIds: [theirs.id],
            }),
        ).rejects.toThrow(NotFoundException);
        expect((await collections.list(orgId)).map((c) => c.id)).not.toContain(
            theirs.id,
        );

        // The composite key: a membership can't cross businesses even if
        // written directly.
        await expect(
            prisma.collectionProduct.create({
                data: {
                    collectionId: mine.id,
                    organizationId: orgId,
                    productId: otherProduct,
                    position: 0,
                },
            }),
        ).rejects.toThrow();
    });

    it("names are unique in the business, ignoring case", async () => {
        await collections.create(orgId, { name: "Gift boxes" });
        await expect(
            collections.create(orgId, { name: "gift boxes" }),
        ).rejects.toThrow("There is already a collection called Gift boxes.");
    });

    it("a product's page picks its hand-picked collections", async () => {
        const jam = await product("Jam");
        const a = await collections.create(orgId, { name: "Pantry" });
        const b = await collections.create(orgId, { name: "Presents" });
        const set = await collections.setForProduct(orgId, jam, {
            collectionIds: [a.id, b.id],
        });
        expect(set.collections.map((c) => c.name)).toEqual([
            "Pantry",
            "Presents",
        ]);
        const fewer = await collections.setForProduct(orgId, jam, {
            collectionIds: [b.id],
        });
        expect(fewer.collections.map((c) => c.id)).toEqual([b.id]);
        expect(ids((await collections.get(orgId, a.id)).products)).toEqual([]);
    });

    it("a hand-picked collection holds 500 products at most", async () => {
        const many = Array.from({ length: 501 }, (_, i) => ({
            id: `cap-${i}-${tag}`,
            organizationId: orgId,
            storeId,
            name: `Cap ${i}`,
            slug: `cap-${i}-${tag}`,
            price: "10.00",
            status: "PUBLISHED",
        }));
        await prisma.product.createMany({ data: many });
        const made = await collections.create(orgId, { name: "Everything" });
        await prisma.collectionProduct.createMany({
            data: many.slice(0, 499).map((p, position) => ({
                collectionId: made.id,
                organizationId: orgId,
                productId: p.id,
                position,
            })),
        });
        const [p499, p500] = [many[499].id, many[500].id];
        const refused = await collections
            .addProducts(orgId, made.id, [p499, p500])
            .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(BadRequestException);
        expect((refused as BadRequestException).getResponse()).toMatchObject({
            field: "productIds",
            message:
                "A collection holds up to 500 products; this one has room for 1 more.",
        });
        // One more fits; naming one it has already adds nothing.
        await collections.addProducts(orgId, made.id, [p499, many[0].id]);
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: made.id },
            }),
        ).toBe(500);
        const last = await prisma.collectionProduct.findUniqueOrThrow({
            where: {
                collectionId_productId: {
                    collectionId: made.id,
                    productId: p499,
                },
            },
            select: { position: true },
        });
        expect(last.position).toBe(499);
        // Nor can the product page put a 501st in it.
        await expect(
            collections.setForProduct(orgId, p500, {
                collectionIds: [made.id],
            }),
        ).rejects.toThrow(
            "Everything already holds 500 products, the most a collection can.",
        );
    });

    it("saving the whole list counts the Not sold members it keeps against the 500", async () => {
        const many = Array.from({ length: 501 }, (_, i) => ({
            id: `keep-${i}-${tag}`,
            organizationId: orgId,
            storeId,
            name: `Keep ${i}`,
            slug: `keep-${i}-${tag}`,
            price: "10.00",
            status: i === 0 ? "ARCHIVED" : "PUBLISHED",
            archivedAt: i === 0 ? new Date() : null,
        }));
        await prisma.product.createMany({ data: many });
        const made = await collections.create(orgId, { name: "Kept" });
        // One member is set to Not sold: the screen doesn't show it, and
        // saving keeps it.
        await prisma.collectionProduct.create({
            data: {
                collectionId: made.id,
                organizationId: orgId,
                productId: many[0].id,
                position: 0,
            },
        });
        const shown = many.slice(1).map((p) => p.id);
        const refused = await collections
            .setProducts(orgId, made.id, shown)
            .catch((e: unknown) => e);
        expect(refused).toBeInstanceOf(BadRequestException);
        expect((refused as BadRequestException).getResponse()).toMatchObject({
            field: "productIds",
            message: tooManyKept(1),
        });
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: made.id },
            }),
        ).toBe(1);
        // 499 shown and the one kept: 500, saved.
        await collections.setProducts(orgId, made.id, shown.slice(0, 499));
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: made.id },
            }),
        ).toBe(500);
    });

    it("two adds racing for the last places never take a collection past 500", async () => {
        const many = Array.from({ length: 502 }, (_, i) => ({
            id: `race-${i}-${tag}`,
            organizationId: orgId,
            storeId,
            name: `Race ${i}`,
            slug: `race-${i}-${tag}`,
            price: "10.00",
            status: "PUBLISHED",
        }));
        await prisma.product.createMany({ data: many });
        const made = await collections.create(orgId, { name: "Racing" });
        await prisma.collectionProduct.createMany({
            data: many.slice(0, 499).map((p, position) => ({
                collectionId: made.id,
                organizationId: orgId,
                productId: p.id,
                position,
            })),
        });
        // Another add has locked the collection and put the 500th in, and
        // hasn't committed yet. Each add below waits for it, then finds
        // the collection full.
        let took!: () => void;
        const tookLast = new Promise<void>((r) => (took = r));
        const first = prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Collection" WHERE id = ${made.id} FOR NO KEY UPDATE`;
                await tx.collectionProduct.create({
                    data: {
                        collectionId: made.id,
                        organizationId: orgId,
                        productId: many[499].id,
                        position: 499,
                    },
                });
                took();
                await new Promise((r) => setTimeout(r, 400));
            },
            { timeout: 10_000 },
        );
        await tookLast;
        const results = await Promise.allSettled([
            collections.addProducts(orgId, made.id, [many[500].id]),
            collections.setForProduct(orgId, many[501].id, {
                collectionIds: [made.id],
            }),
            first,
        ]);
        expect(results.map((r) => r.status)).toEqual([
            "rejected",
            "rejected",
            "fulfilled",
        ]);
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: made.id },
            }),
        ).toBe(500);
        // The same product added twice at once: added once, no error.
        const again = await collections.create(orgId, { name: "Twice" });
        const twice = await Promise.allSettled([
            collections.addProducts(orgId, again.id, [many[0].id]),
            collections.addProducts(orgId, again.id, [many[0].id]),
        ]);
        expect(twice.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(
            await prisma.collectionProduct.count({
                where: { collectionId: again.id },
            }),
        ).toBe(1);
    });

    it("the product page puts a product at the end of each collection it joins", async () => {
        const [a, b, c] = await Promise.all(
            ["Honey", "Ghee", "Oats"].map((n) => product(n)),
        );
        const first = await collections.create(orgId, {
            name: "Morning shelf",
            productIds: [a, b],
        });
        const second = await collections.create(orgId, {
            name: "Pantry staples",
        });
        await collections.setForProduct(orgId, c, {
            collectionIds: [first.id, second.id],
        });
        expect(ids((await collections.get(orgId, first.id)).products)).toEqual([
            a,
            b,
            c,
        ]);
        expect(ids((await collections.get(orgId, second.id)).products)).toEqual(
            [c],
        );
        // Saving it again moves nothing.
        await collections.setForProduct(orgId, c, {
            collectionIds: [first.id, second.id],
        });
        expect(ids((await collections.get(orgId, first.id)).products)).toEqual([
            a,
            b,
            c,
        ]);
    });

    it("the product overview lists its collections and the (empty) website pages", async () => {
        const bagel = await product("Bagel", cakes);
        const picked = await collections.create(orgId, {
            name: "Breakfast",
            productIds: [bagel],
        });
        const site = await prisma.site.create({
            data: { organizationId: orgId, name: "Rye", slug: `rye-${tag}` },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: orgId,
                templateId: "bakery",
                templateVersion: 1,
                snapshot: {
                    pages: [
                        {
                            path: "/breakfast",
                            title: "Breakfast",
                            isHome: false,
                            sections: [
                                {
                                    type: "productGrid",
                                    contractVersion: 1,
                                    content: { collectionId: picked.id },
                                },
                            ],
                        },
                    ],
                },
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });

        const read = await overview.getIn(
            await access.read(ctx(), bagel),
            bagel,
        );
        expect(read.placement.status).toBe("ok");
        if (read.placement.status !== "ok") return;
        expect(read.placement.data.collections.map((c) => c.id)).toEqual(
            expect.arrayContaining([picked.id]),
        );
        expect(read.placement.data.website).toEqual({
            showsProducts: false,
            pages: [],
        });

        // Once a block can show products (#473), the live snapshot is read.
        const grid: ProductBlockReader = (content) => ({
            productIds: [],
            collectionIds: [(content as { collectionId: string }).collectionId],
        });
        await expect(
            websitePagesFor(
                orgId,
                { productId: bagel, collectionIds: [picked.id] },
                { productGrid: grid },
            ),
        ).resolves.toEqual({
            showsProducts: true,
            pages: [
                {
                    siteId: site.id,
                    siteName: "Rye",
                    path: "/breakfast",
                    title: "Breakfast",
                },
            ],
        });
    });

    it("deleting a collection leaves its products alone", async () => {
        const pie = await product("Pie");
        const gone = await collections.create(orgId, {
            name: "Short-lived",
            productIds: [pie],
        });
        await collections.remove(orgId, gone.id);
        await expect(collections.get(orgId, gone.id)).rejects.toThrow(
            NotFoundException,
        );
        expect(await prisma.product.count({ where: { id: pie } })).toBe(1);
    });
});
