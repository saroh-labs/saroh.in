// The controllers are called directly here; the real guard loads
// better-auth, an ESM build Jest does not transform, and guards do not run
// on a direct call anyway.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import {
    CategoriesController,
    OrganizationCategoriesController,
} from "../categories/categories.controller";
import { CategoriesService } from "../categories/categories.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductsService } from "../products/products.service";
import { VariantsService } from "../products/variants.service";
import { StoresService } from "../stores/stores.service";
import { AllergensService } from "./allergens.service";
import { CatalogueAccess } from "./catalogue-access";
import { OrganizationCatalogueController } from "./catalogue.controller";
import { CatalogueService } from "./catalogue.service";
import { FieldsService } from "./fields.service";
import { OptionsService } from "./options.service";
import { SkuService } from "./sku.service";
import { CatalogueController } from "./store-catalogue.controller";

/**
 * Catalogue settings belong to the business (#529), against a real
 * Postgres. Characterization first: what a one-storefront business read
 * before the move (captured from the per-storefront services at 89ffe2b3)
 * is what it reads now, through the old storefront address and through the
 * new organization one, with the same ids. Then what the move adds: one list
 * for every storefront, slugs unique per business, and another business's
 * settings not found.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Catalogue settings belong to the business (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const access = new CatalogueAccess(stores);
    const categories = new CategoriesService();
    const options = new OptionsService();
    const catalogue = new CatalogueService(options);
    const fields = new FieldsService();
    const allergens = new AllergensService();
    const sku = new SkuService();
    const products = new ProductsService(stores);
    const variants = new VariantsService(products);
    const viaStore = new CatalogueController(
        access,
        catalogue,
        options,
        sku,
        fields,
        allergens,
    );
    const viaOrg = new OrganizationCatalogueController(
        access,
        catalogue,
        options,
        sku,
        fields,
        allergens,
    );
    const categoriesViaStore = new CategoriesController(categories, access);
    const categoriesViaOrg = new OrganizationCategoriesController(
        categories,
        access,
    );

    let owner: AuthUser;
    let ctx: OrganizationContext;
    let orgId = "";
    let storeId = "";
    let otherOrgId = "";
    let otherCategoryId = "";
    const names = new Map<string, string>();
    const idOf = (name: string) =>
        [...names].find(([, n]) => n === name)?.[0] ?? "";

    beforeAll(async () => {
        const ownerId = (
            await prisma.user.create({
                data: { email: `org-scope-owner-${tag}@example.com` },
            })
        ).id;
        owner = { id: ownerId } as AuthUser;
        orgId = (
            await prisma.organization.create({
                data: { name: "Scope Org", slug: `scope-org-${tag}` },
            })
        ).id;
        ctx = { organizationId: orgId, userId: ownerId, role: "OWNER" };
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Scope Store",
                slug: `scope-${tag}`,
            })
        ).id;

        // The same fixture the characterization was captured from, made
        // through the storefront's address as the app made it then.
        const bakery = (
            await categoriesViaStore.create(owner, storeId, { name: "Bakery" })
        ).id;
        const breads = (
            await categoriesViaStore.create(owner, storeId, {
                name: "Breads",
                parentId: bakery,
            })
        ).id;
        names.set(bakery, "cat:Bakery").set(breads, "cat:Breads");
        const size = (
            await viaStore.createOption(owner, storeId, {
                name: "Size",
                values: ["Small", "Large"],
            })
        ).id;
        names.set(size, "opt:Size");
        const values = await prisma.productOptionValue.findMany({
            where: { optionId: size },
        });
        for (const v of values) names.set(v.id, `val:${v.value}`);
        const loaf = (
            await products.create(storeId, ownerId, {
                name: "Sourdough",
                price: "340",
                currency: "INR",
                categoryId: breads,
                optionId: size,
            })
        ).id;
        names.set(loaf, "prod:Sourdough");
        await variants.create(storeId, loaf, ownerId, {
            sku: "SOUR-S",
            title: "Small",
            optionValueId: values.find((v) => v.value === "Small")?.id,
        });
        const keeps = await viaStore.createField(owner, storeId, {
            name: "Keeps for",
            type: "TEXT",
        });
        names.set(keeps.id, "field:Keeps for");
        await viaStore.updateField(owner, storeId, keeps.id, {
            categoryIds: [breads],
        });
        const list = await viaStore.addAllergens(owner, storeId, {
            names: ["Gluten", "Milk"],
        });
        for (const a of list) names.set(a.id, `allergen:${a.name}`);
        await viaStore.saveSkuPattern(owner, storeId, {
            pattern: "{NAME3}-{VALUE}",
            suggest: true,
        });
        await viaStore.saveDefaults(owner, storeId, {
            entries: [
                { key: "all", lowStockAlert: 4, returnsMode: "STOREFRONT" },
                {
                    key: breads,
                    howToUse: "Warm before serving.",
                    lowStockAlert: 2,
                },
            ],
            updateExisting: false,
        });

        otherOrgId = (
            await prisma.organization.create({
                data: { name: "Other Org", slug: `scope-other-${tag}` },
            })
        ).id;
        otherCategoryId = (
            await categories.create(otherOrgId, { name: "Their breads" })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.storeAllergen.deleteMany({
            where: { organizationId: { in: [orgId, otherOrgId] } },
        });
        await prisma.productField.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.productOption.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.category.deleteMany({
            where: { organizationId: { in: [orgId, otherOrgId] } },
        });
        await prisma.store.deleteMany({ where: { organizationId: orgId } });
        await prisma.businessProfile.deleteMany({
            where: { organizationId: orgId },
        });
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({ where: { id: owner.id } });
    });

    /** Ids (as values and as keys) swapped for what they name. */
    const named = (value: unknown): unknown => {
        if (typeof value === "string") return names.get(value) ?? value;
        if (Array.isArray(value)) return value.map(named);
        if (value && typeof value === "object") {
            return Object.fromEntries(
                Object.entries(value).map(([k, v]) => [
                    names.get(k) ?? k,
                    named(v),
                ]),
            );
        }
        return value;
    };

    /** Captured from the per-storefront services before the move. */
    const BEFORE = {
        catalogue: {
            categories: [
                {
                    id: "cat:Bakery",
                    name: "Bakery",
                    slug: "bakery",
                    parentId: null,
                    productCount: 0,
                },
                {
                    id: "cat:Breads",
                    name: "Breads",
                    slug: "breads",
                    parentId: "cat:Bakery",
                    productCount: 1,
                },
            ],
            uncategorizedCount: 0,
            options: [
                {
                    id: "opt:Size",
                    name: "Size",
                    position: 0,
                    productCount: 1,
                    values: [
                        { id: "val:Small", value: "Small", variantCount: 1 },
                        { id: "val:Large", value: "Large", variantCount: 0 },
                    ],
                },
            ],
            defaults: {
                entries: {
                    all: {
                        howToUse: null,
                        lowStockAlert: 4,
                        returnsMode: "STOREFRONT",
                        returnsText: null,
                    },
                    "cat:Breads": {
                        howToUse: "Warm before serving.",
                        lowStockAlert: 2,
                        returnsMode: null,
                        returnsText: null,
                    },
                },
                stillOnDefault: {
                    all: { howToUse: 0, lowStockAlert: 0, returns: 1 },
                    "cat:Bakery": {
                        howToUse: 0,
                        lowStockAlert: 0,
                        returns: 0,
                    },
                    "cat:Breads": {
                        howToUse: 0,
                        lowStockAlert: 0,
                        returns: 1,
                    },
                },
                productCounts: { all: 1, "cat:Bakery": 0, "cat:Breads": 1 },
                suggestions: [],
            },
            canWrite: true,
        },
        categories: [
            {
                id: "cat:Bakery",
                name: "Bakery",
                slug: "bakery",
                parentId: null,
                _count: { products: 0, children: 1 },
            },
            {
                id: "cat:Breads",
                name: "Breads",
                slug: "breads",
                parentId: "cat:Bakery",
                _count: { products: 1, children: 0 },
            },
        ],
        fields: [
            {
                id: "field:Keeps for",
                name: "Keeps for",
                type: "TEXT",
                onShop: false,
                position: 0,
                categoryIds: ["cat:Breads"],
                productCount: 1,
            },
        ],
        allergens: [
            {
                id: "allergen:Gluten",
                name: "Gluten",
                contains: 0,
                mayContain: 0,
            },
            { id: "allergen:Milk", name: "Milk", contains: 0, mayContain: 0 },
        ],
        sku: { pattern: "{NAME3}-{VALUE}", suggest: true, n: 2 },
        effective: {
            howToUse: "Warm before serving.",
            lowStockAlert: 2,
            returns: { mode: "STOREFRONT", text: null },
        },
    };

    it("a one-storefront business reads what it read before, through the storefront's address", async () => {
        const read = {
            catalogue: await viaStore.get(owner, storeId),
            categories: await categoriesViaStore.list(owner, storeId),
            fields: await viaStore.listFields(owner, storeId),
            allergens: await viaStore.listAllergens(owner, storeId),
            sku: await viaStore.skuPattern(owner, storeId),
            effective: await viaStore.effectiveDefaults(
                owner,
                storeId,
                idOf("cat:Breads"),
            ),
        };
        expect(named(read)).toEqual(BEFORE);
    });

    it("and the same, with the same ids, through the business's address", async () => {
        const read = {
            catalogue: await viaOrg.get(ctx),
            categories: await categoriesViaOrg.list(ctx),
            fields: await viaOrg.listFields(ctx),
            allergens: await viaOrg.listAllergens(ctx),
            sku: await viaOrg.skuPattern(ctx),
            effective: await viaOrg.effectiveDefaults(ctx, idOf("cat:Breads")),
        };
        expect(named(read)).toEqual(BEFORE);
    });

    it("gives a second storefront the same settings, not a copy", async () => {
        // Made directly: a business has one storefront until #512 lifts the
        // cap, and the settings must already be ready for the second.
        const second = (
            await prisma.store.create({
                data: {
                    name: "Scope Online",
                    slug: `scope-online-${tag}`,
                    organizationId: orgId,
                    owners: { create: { userId: owner.id } },
                },
            })
        ).id;
        // Made at the business, seen from either storefront.
        const cakes = await categoriesViaOrg.create(ctx, { name: "Cakes" });
        names.set(cakes.id, "cat:Cakes");
        const fromFirst = await categoriesViaStore.list(owner, storeId);
        const fromSecond = await categoriesViaStore.list(owner, second);
        expect(fromSecond).toEqual(fromFirst);
        expect(fromSecond.map((c) => c.name)).toEqual([
            "Bakery",
            "Breads",
            "Cakes",
        ]);
        // A product at the second storefront takes the business's category.
        const tart = await products.create(second, owner.id, {
            name: "Lemon tart",
            price: "220",
            currency: "INR",
            categoryId: cakes.id,
        });
        expect(tart.id).toBeTruthy();
        // A slug is the business's once: the second storefront can't make
        // another "Cakes".
        await expect(
            categoriesViaStore.create(owner, second, { name: "cakes" }),
        ).rejects.toThrow(/already a category called Cakes/);
        await expect(
            categoriesViaOrg.create(ctx, { name: "Cakes 2", slug: "cakes" }),
        ).rejects.toThrow(/slug is already taken/);
        await prisma.product.deleteMany({ where: { storeId: second } });
        await categories.remove(orgId, cakes.id);
    });

    it("does not find another business's categories", async () => {
        await expect(
            categoriesViaOrg.rename(ctx, otherCategoryId, { name: "Mine" }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            categoriesViaStore.merge(owner, storeId, otherCategoryId, {
                intoId: null,
            }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            categoriesViaOrg.merge(ctx, idOf("cat:Bakery"), {
                intoId: otherCategoryId,
            }),
        ).rejects.toThrow(NotFoundException);
        await expect(
            products.create(storeId, owner.id, {
                name: "Borrowed",
                price: "10",
                currency: "INR",
                categoryId: otherCategoryId,
            }),
        ).rejects.toThrow(/Unknown category/);
        expect(
            await prisma.category.findUnique({
                where: { id: otherCategoryId },
                select: { name: true, organizationId: true },
            }),
        ).toEqual({ name: "Their breads", organizationId: otherOrgId });
    });

    it("lets a Member read the settings and not change them", async () => {
        const memberCtx: OrganizationContext = { ...ctx, role: "MEMBER" };
        expect((await viaOrg.get(memberCtx)).canWrite).toBe(false);
        expect(() => viaOrg.createOption(memberCtx, { name: "Shade" })).toThrow(
            /can't change product settings/,
        );
    });
});
