import { prisma } from "@saroh/database";

import { CategoriesService } from "../categories/categories.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductsService } from "../products/products.service";
import { VariantsService } from "../products/variants.service";
import { StoresService } from "../stores/stores.service";
import { SkuService } from "./sku.service";

/**
 * The SKU pattern (#484) against a real Postgres: the preview names every
 * variant, a pattern that would give two the same SKU is refused, a saved
 * one is read back with the product's number, and no SKU is rewritten.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("SKU pattern (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const categories = new CategoriesService(stores);
    const products = new ProductsService(stores);
    const variants = new VariantsService(products);
    const sku = new SkuService(stores);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let serumId = "";
    let oilId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `sku-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "SKU Org", slug: `sku-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "SKU Store",
                slug: `sku-${tag}`,
            })
        ).id;
        const serums = (
            await categories.create(storeId, ownerId, { name: "Serums" })
        ).id;
        serumId = (
            await products.create(storeId, ownerId, {
                name: "Vitamin C Serum",
                price: "549",
                currency: "INR",
                categoryId: serums,
            })
        ).id;
        await variants.create(storeId, serumId, ownerId, {
            sku: "OLD-15",
            title: "15 ml",
        });
        await variants.create(storeId, serumId, ownerId, {
            sku: "OLD-30",
            title: "30 ml",
        });
        oilId = (
            await products.create(storeId, ownerId, {
                name: "Vitamin E Oil",
                price: "399",
                currency: "INR",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("previews every variant, and a product with none", async () => {
        const view = await sku.preview(storeId, ownerId, "{NAME3}{N}-{VALUE}");
        expect(view.rows.map((r) => [r.now, r.next])).toEqual([
            ["OLD-15", "VIT01-15ML"],
            ["OLD-30", "VIT01-30ML"],
            ["", "VIT02"],
        ]);
        expect(view.problem).toBe("");
    });

    it("refuses a pattern that would name two variants alike", async () => {
        const view = await sku.preview(storeId, ownerId, "{NAME3}");
        expect(view.problem).toBe(
            "3 variants would share VIT. Add {N} so each one differs.",
        );
        await expect(
            sku.save(storeId, ownerId, { pattern: "{NAME3}", suggest: true }),
        ).rejects.toThrow(/would share VIT/);
        await expect(
            sku.save(storeId, ownerId, { pattern: "{SIZE}", suggest: true }),
        ).rejects.toThrow(/at least one part in braces|Only/);
    });

    it("saves, reads back with the product's number, and rewrites nothing", async () => {
        await sku.save(storeId, ownerId, {
            pattern: "{CAT}-{NAME3}{N}-{VALUE}",
            suggest: false,
        });
        const forOil = await sku.get(storeId, ownerId, oilId);
        expect(forOil).toEqual({
            pattern: "{CAT}-{NAME3}{N}-{VALUE}",
            suggest: false,
            n: 2,
        });
        expect((await sku.get(storeId, ownerId)).n).toBe(3);
        const skus = await prisma.productVariant.findMany({
            where: { productId: serumId },
            orderBy: { sku: "asc" },
            select: { sku: true },
        });
        expect(skus.map((v) => v.sku)).toEqual(["OLD-15", "OLD-30"]);
    });

    it("leaves a stranger out", async () => {
        const strangerId = (
            await prisma.user.create({
                data: { email: `sku-stranger-${tag}@example.com` },
            })
        ).id;
        await expect(
            sku.save(storeId, strangerId, {
                pattern: "{NAME3}{N}",
                suggest: true,
            }),
        ).rejects.toThrow();
        await prisma.user.delete({ where: { id: strangerId } });
    });
});
