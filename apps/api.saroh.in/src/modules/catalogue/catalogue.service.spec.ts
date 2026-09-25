import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { CategoriesService } from "../categories/categories.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { InventoryService } from "../products/inventory.service";
import { ProductsService } from "../products/products.service";
import { VariantsService } from "../products/variants.service";
import { StoresService } from "../stores/stores.service";
import { CatalogueService } from "./catalogue.service";
import { OptionsService } from "./options.service";

/**
 * Catalogue settings (#463) against a real Postgres: categories renamed,
 * merged, deleted and restored; options and values guarded while in use;
 * defaults saved, applied to products still on the old value, and undone.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Catalogue settings (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const categories = new CategoriesService(stores);
    const options = new OptionsService(stores);
    const catalogue = new CatalogueService(stores, options);
    const products = new ProductsService(stores);
    const variants = new VariantsService(products);
    const inventory = new InventoryService(products);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let faceCare = "";
    let serums = "";
    let dresses = "";
    const serumIds: string[] = [];

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `cat-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Catalogue Org", slug: `cat-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Catalogue Store",
                slug: `cat-${tag}`,
            })
        ).id;
        faceCare = (
            await categories.create(storeId, ownerId, { name: "Face care" })
        ).id;
        serums = (await categories.create(storeId, ownerId, { name: "Serums" }))
            .id;
        dresses = (
            await categories.create(storeId, ownerId, { name: "Dresses" })
        ).id;
        for (let i = 0; i < 4; i++) {
            serumIds.push(
                (
                    await products.create(storeId, ownerId, {
                        name: `Serum ${i}`,
                        price: "599",
                        currency: "INR",
                        categoryId: serums,
                    })
                ).id,
            );
        }
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.discount.deleteMany({ where: { organizationId: orgId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    describe("categories", () => {
        it("refuses a name another category has, ignoring case", async () => {
            await expect(
                categories.create(storeId, ownerId, { name: "serums" }),
            ).rejects.toThrow(/already a category called Serums/);
            await expect(
                categories.rename(storeId, faceCare, ownerId, {
                    name: "SERUMS",
                }),
            ).rejects.toThrow(/use Merge/);
        });

        it("allows a case-only rename of itself, and reports the old name", async () => {
            const res = await categories.rename(storeId, faceCare, ownerId, {
                name: "Face Care",
            });
            expect(res).toEqual({
                id: faceCare,
                name: "Face Care",
                previousName: "Face care",
            });
        });

        it("merges Serums into Face care, and Undo puts the same four back", async () => {
            const removal = await categories.merge(storeId, serums, ownerId, {
                intoId: faceCare,
            });
            expect(removal.productIds.sort()).toEqual([...serumIds].sort());
            expect(
                await prisma.product.count({
                    where: { storeId, categoryId: faceCare },
                }),
            ).toBe(4);
            expect(await prisma.category.count({ where: { id: serums } })).toBe(
                0,
            );

            const restored = await categories.restore(storeId, ownerId, {
                name: removal.name,
                slug: removal.slug,
                parentId: removal.parentId,
                movedTo: removal.movedTo,
                productIds: removal.productIds,
            });
            expect(restored.moved).toBe(4);
            serums = restored.id;
            expect(
                await prisma.product.count({
                    where: { storeId, categoryId: serums },
                }),
            ).toBe(4);
        });

        it("Undo leaves a product that was moved again since", async () => {
            const removal = await categories.remove(storeId, serums, ownerId);
            expect(removal.movedTo).toBeNull();
            // Someone files one serum under Dresses before pressing Undo.
            await prisma.product.update({
                where: { id: serumIds[0] },
                data: { categoryId: dresses },
            });
            const restored = await categories.restore(storeId, ownerId, {
                name: removal.name,
                slug: removal.slug,
                movedTo: null,
                productIds: removal.productIds,
            });
            expect(restored.moved).toBe(3);
            serums = restored.id;
        });

        it("won't delete a category a discount code reaches", async () => {
            await prisma.discount.create({
                data: {
                    organizationId: orgId,
                    code: `DRESS${tag.replace(/\D/g, "").slice(-6)}`,
                    kind: "PERCENTAGE",
                    percentBps: 1000,
                    appliesTo: "COLLECTION",
                    categories: { create: { categoryId: dresses } },
                },
            });
            await expect(
                categories.remove(storeId, dresses, ownerId),
            ).rejects.toThrow(/discount code applies to Dresses/);
        });

        it("refuses a category as its own parent, and a loop", async () => {
            await expect(
                categories.update(storeId, faceCare, ownerId, {
                    name: "Face Care",
                    slug: "face-care",
                    parentId: faceCare,
                }),
            ).rejects.toThrow(/its own parent/);
            const toners = (
                await categories.create(storeId, ownerId, {
                    name: "Toners",
                    parentId: faceCare,
                })
            ).id;
            await expect(
                categories.update(storeId, faceCare, ownerId, {
                    name: "Face Care",
                    slug: "face-care",
                    parentId: toners,
                }),
            ).rejects.toThrow(/category loop/);
            await expect(
                categories.remove(storeId, faceCare, ownerId),
            ).rejects.toThrow(/sub-categories first/);
        });

        it("Undo of a delete brings back its defaults and its custom fields", async () => {
            const toners = await prisma.category.findFirstOrThrow({
                where: { storeId, name: "Toners" },
                select: { id: true },
            });
            await prisma.catalogueDefaults.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    key: toners.id,
                    categoryId: toners.id,
                    howToUse: "Pat onto clean skin.",
                    lowStockAlert: 4,
                },
            });
            const field = await prisma.productField.create({
                data: {
                    storeId,
                    organizationId: orgId,
                    name: "Skin type",
                    categories: { create: { categoryId: toners.id } },
                },
            });

            const removal = await categories.remove(
                storeId,
                toners.id,
                ownerId,
            );
            expect(removal.defaults).toMatchObject({
                howToUse: "Pat onto clean skin.",
                lowStockAlert: 4,
            });
            expect(removal.fieldIds).toEqual([field.id]);

            const restored = await categories.restore(storeId, ownerId, {
                name: removal.name,
                slug: removal.slug,
                parentId: removal.parentId,
                movedTo: removal.movedTo,
                productIds: removal.productIds,
                defaults: removal.defaults,
                // One that is not this store's field is left out.
                fieldIds: [...removal.fieldIds, "not-a-field"],
            });
            expect(
                await prisma.catalogueDefaults.findFirst({
                    where: { storeId, key: restored.id },
                    select: { howToUse: true, lowStockAlert: true },
                }),
            ).toEqual({ howToUse: "Pat onto clean skin.", lowStockAlert: 4 });
            expect(
                await prisma.productFieldCategory.findMany({
                    where: { categoryId: restored.id },
                    select: { fieldId: true },
                }),
            ).toEqual([{ fieldId: field.id }]);
        });
    });

    describe("options", () => {
        let sizeId = "";

        it("creates an option with values, refusing duplicates ignoring case", async () => {
            sizeId = (
                await options.create(storeId, ownerId, {
                    name: "Size",
                    values: ["S", "M", " m ", "L", ""],
                })
            ).id;
            const [size] = await options.list(storeId, ownerId);
            expect(size.values.map((v) => v.value)).toEqual(["S", "M", "L"]);
            await expect(
                options.create(storeId, ownerId, { name: "size" }),
            ).rejects.toThrow(ConflictException);
            await expect(
                options.addValue(storeId, sizeId, ownerId, { value: "l" }),
            ).rejects.toThrow(/already a value/);
        });

        it("guards a value a variant uses and an option a product uses", async () => {
            const [size] = await options.list(storeId, ownerId);
            const m = size.values.find((v) => v.value === "M");
            const dress = (
                await products.create(storeId, ownerId, {
                    name: "Wrap Dress",
                    price: "2499",
                    currency: "INR",
                    categoryId: dresses,
                    optionId: sizeId,
                })
            ).id;
            await variants.create(storeId, dress, ownerId, {
                sku: "WD-M",
                title: "M",
                optionValueId: m?.id,
            });
            await expect(
                options.removeValue(storeId, sizeId, m?.id ?? "", ownerId),
            ).rejects.toThrow(/used by a variant/);
            await expect(
                options.remove(storeId, sizeId, ownerId),
            ).rejects.toThrow(/Used by 1 product —/);

            const s = size.values.find((v) => v.value === "S");
            const removed = await options.removeValue(
                storeId,
                sizeId,
                s?.id ?? "",
                ownerId,
            );
            expect(removed.value).toBe("S");
        });

        it("hands back a deleted option's values for Undo", async () => {
            const shade = (
                await options.create(storeId, ownerId, {
                    name: "Shade",
                    values: ["Ivory", "Honey"],
                })
            ).id;
            const removed = await options.remove(storeId, shade, ownerId);
            expect(removed).toMatchObject({
                name: "Shade",
                values: ["Ivory", "Honey"],
            });
            await options.create(storeId, ownerId, {
                name: removed.name,
                values: removed.values,
            });
            const names = (await options.list(storeId, ownerId)).map(
                (o) => o.name,
            );
            expect(names).toContain("Shade");
        });
    });

    describe("defaults", () => {
        it("reads counts, still-on-default totals and a suggestion", async () => {
            for (const id of serumIds.slice(1)) {
                await products.patch(storeId, id, ownerId, {
                    howToUse: "Two drops, morning and night.",
                });
            }
            const view = await catalogue.get(storeId, ownerId);
            expect(view.canWrite).toBe(true);
            expect(
                view.categories.find((c) => c.id === serums)?.productCount,
            ).toBe(3);
            expect(view.uncategorizedCount).toBe(0);
            expect(view.defaults.suggestions).toContainEqual({
                key: serums,
                field: "howToUse",
                value: "Two drops, morning and night.",
                count: 3,
                total: 3,
            });
        });

        it("updates only products still on the old default, and Undo restores them", async () => {
            // Every product starts on the built-in warn-at of 10…
            for (const id of serumIds) {
                await inventory.upsert(storeId, id, ownerId, { quantity: 20 });
            }
            // …but one serum set its own level.
            await inventory.upsert(storeId, serumIds[1], ownerId, {
                quantity: 20,
                lowStockAlert: 2,
            });

            const saved = await catalogue.saveDefaults(storeId, ownerId, {
                entries: [
                    { key: "all", lowStockAlert: 5, returnsMode: "STOREFRONT" },
                    { key: serums, lowStockAlert: 3 },
                ],
                updateExisting: true,
            });
            const alerts = await prisma.inventory.findMany({
                where: { productId: { in: serumIds } },
                select: { productId: true, lowStockAlert: true },
            });
            const byId = Object.fromEntries(
                alerts.map((a) => [a.productId, a.lowStockAlert]),
            );
            expect(byId[serumIds[1]]).toBe(2);
            // serumIds[0] sits in Dresses now; it takes All products' 5.
            expect(byId[serumIds[0]]).toBe(5);
            expect(byId[serumIds[2]]).toBe(3);
            expect(byId[serumIds[3]]).toBe(3);
            expect(saved.updatedCount).toBe(3);

            await catalogue.undoDefaults(storeId, ownerId, {
                entries: saved.previous,
                products: saved.updated.products,
                stock: saved.updated.stock,
            });
            const back = await prisma.inventory.findMany({
                where: { productId: { in: serumIds } },
                select: { lowStockAlert: true },
            });
            expect(back.map((b) => b.lowStockAlert).sort()).toEqual(
                [10, 10, 10, 2].sort(),
            );
            const view = await catalogue.get(storeId, ownerId);
            expect(view.defaults.entries.all).toMatchObject({
                lowStockAlert: null,
            });
        });

        it("leaves products alone when not asked to update them", async () => {
            const saved = await catalogue.saveDefaults(storeId, ownerId, {
                entries: [
                    { key: "all", lowStockAlert: 7, returnsMode: "STOREFRONT" },
                ],
            });
            expect(saved.updatedCount).toBe(0);
            const view = await catalogue.get(storeId, ownerId);
            expect(view.defaults.entries.all.lowStockAlert).toBe(7);
        });

        it("refuses All products without a warning level, and an own rule without text", async () => {
            await expect(
                catalogue.saveDefaults(storeId, ownerId, {
                    entries: [{ key: "all", lowStockAlert: null }],
                }),
            ).rejects.toThrow(/Warn at/);
            await expect(
                catalogue.saveDefaults(storeId, ownerId, {
                    entries: [{ key: dresses, returnsMode: "OWN" }],
                }),
            ).rejects.toThrow(/returns rule/);
        });

        it("gives the editor's prefill to someone who can read the store, and no one else", async () => {
            for (const categoryId of [serums, dresses, null]) {
                expect(
                    await catalogue.effectiveForUser(
                        storeId,
                        ownerId,
                        categoryId,
                    ),
                ).toEqual(await catalogue.effective(storeId, categoryId));
            }
            const strangerId = (
                await prisma.user.create({
                    data: { email: `cat-stranger-${tag}@example.com` },
                })
            ).id;
            try {
                await expect(
                    catalogue.effectiveForUser(storeId, strangerId, serums),
                ).rejects.toThrow(NotFoundException);
            } finally {
                await prisma.user.delete({ where: { id: strangerId } });
            }
        });
    });
});
