import { prisma } from "@saroh/database";

import { CategoriesService } from "../categories/categories.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { FieldsService } from "./fields.service";

/**
 * Custom fields (#482) against a real Postgres: a field is asked of the
 * categories it names, its values are checked by type, a field taken out
 * of a category stops being asked but keeps its values, and a delete is
 * undone with everything typed into it.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Custom fields (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const categories = new CategoriesService();
    const products = new ProductsService(stores);
    const fields = new FieldsService();

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let serums = "";
    let dresses = "";
    let serumId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `fields-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Fields Org", slug: `fields-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Fields Store",
                slug: `fields-${tag}`,
            })
        ).id;
        serums = (await categories.create(orgId, { name: "Serums" })).id;
        dresses = (await categories.create(orgId, { name: "Dresses" })).id;
        serumId = (
            await products.create(storeId, ownerId, {
                name: "Vitamin C Serum",
                price: "549",
                currency: "INR",
                categoryId: serums,
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.productField.deleteMany({ where: { storeId } });
        await prisma.store.deleteMany({ where: { id: storeId } });
        await prisma.organization.deleteMany({ where: { id: orgId } });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("adds a field team only and in no category, and refuses a duplicate name", async () => {
        const f = await fields.create(orgId, {
            name: "Skin type",
            type: "TEXT",
        });
        expect(f).toMatchObject({
            name: "Skin type",
            onShop: false,
            categoryIds: [],
            productCount: 0,
        });
        await expect(
            fields.create(orgId, {
                name: "skin TYPE",
                type: "TEXT",
            }),
        ).rejects.toThrow(/already a field called/);
    });

    it("is asked of its categories, and checks each value by type", async () => {
        const shelf = await fields.create(orgId, {
            name: "Opened shelf life (months)",
            type: "NUMBER",
        });
        const skin = (await fields.views(orgId)).find(
            (f) => f.name === "Skin type",
        );
        expect(skin).toBeDefined();
        for (const id of [shelf.id, skin?.id ?? ""]) {
            await fields.update(orgId, id, {
                categoryIds: [serums],
            });
        }
        const after = await fields.update(orgId, shelf.id, {
            onShop: true,
        });
        expect(after).toMatchObject({ onShop: true, productCount: 1 });

        await expect(
            products.patch(storeId, serumId, ownerId, {
                customFields: { [shelf.id]: "twelve" },
            }),
        ).rejects.toThrow(/is a number/);
        const saved = await products.patch(storeId, serumId, ownerId, {
            customFields: { [shelf.id]: "12", [skin?.id ?? ""]: "All" },
        });
        expect(
            saved.customFields.map((f) => [f.name, f.value, f.onShop]),
        ).toEqual([
            ["Skin type", "All", false],
            ["Opened shelf life (months)", "12", true],
        ]);
    });

    it("stops asking once out of the category, and keeps the value", async () => {
        const skin = (await fields.views(orgId)).find(
            (f) => f.name === "Skin type",
        );
        await fields.update(orgId, skin?.id ?? "", {
            categoryIds: [dresses],
        });
        const now = await products.get(storeId, serumId, ownerId);
        expect(now.customFields.map((f) => f.name)).toEqual([
            "Opened shelf life (months)",
        ]);
        const kept = await prisma.productFieldValue.count({
            where: { productId: serumId, fieldId: skin?.id },
        });
        expect(kept).toBe(1);
    });

    it("undoes a delete with the values typed into it", async () => {
        const shelf = (await fields.views(orgId)).find((f) =>
            f.name.startsWith("Opened"),
        );
        await fields.remove(orgId, shelf?.id ?? "");
        expect(
            (await products.get(storeId, serumId, ownerId)).customFields,
        ).toEqual([]);
        await fields.restore(orgId, shelf?.id ?? "");
        const back = await products.get(storeId, serumId, ownerId);
        expect(back.customFields[0]?.value).toBe("12");
    });
});
