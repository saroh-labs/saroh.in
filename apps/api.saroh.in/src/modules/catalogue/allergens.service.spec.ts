import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import { AllergensService, COMMON_FOOD_ALLERGENS } from "./allergens.service";

/**
 * Allergens (#483) against a real Postgres: a store's list, duplicates
 * refused ignoring case, the common list added in one step, a product's
 * Contains and May contain, and removal refused while in use.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("Allergens (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const allergens = new AllergensService(stores);

    let ownerId = "";
    let orgId = "";
    let storeId = "";
    let loafId = "";
    let otherOrgId = "";
    let otherStoreId = "";

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `allergen-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Allergen Org", slug: `allergen-org-${tag}` },
            })
        ).id;
        storeId = (
            await stores.createForUser(ownerId, orgId, {
                name: "Allergen Store",
                slug: `allergen-${tag}`,
            })
        ).id;
        loafId = (
            await products.create(storeId, ownerId, {
                name: "Sourdough loaf",
                price: "340",
                currency: "INR",
            })
        ).id;
    });

    afterAll(async () => {
        await prisma.product.deleteMany({ where: { storeId } });
        await prisma.storeAllergen.deleteMany({
            where: { storeId: { in: [storeId, otherStoreId] } },
        });
        await prisma.store.deleteMany({
            where: { id: { in: [storeId, otherStoreId] } },
        });
        await prisma.organization.deleteMany({
            where: { id: { in: [orgId, otherOrgId] } },
        });
        await prisma.user.deleteMany({ where: { id: ownerId } });
    });

    it("starts empty, adds one, refuses it again ignoring case, and fills the common list around it", async () => {
        expect(await allergens.list(storeId, ownerId)).toEqual([]);
        await allergens.add(storeId, ownerId, ["Gluten"]);
        await expect(
            allergens.add(storeId, ownerId, ["gluten"]),
        ).rejects.toThrow(/already on the list/);
        const all = await allergens.add(
            storeId,
            ownerId,
            COMMON_FOOD_ALLERGENS,
        );
        expect(all.map((a) => a.name)).toEqual(COMMON_FOOD_ALLERGENS);
    });

    it("says nothing for a product with none, and splits contains from may contain", async () => {
        const none = await products.get(storeId, loafId, ownerId);
        expect(none.allergens).toEqual({ contains: [], mayContain: [] });
        const list = await allergens.list(storeId, ownerId);
        const id = (n: string) => list.find((a) => a.name === n)?.id ?? "";
        const after = await products.patch(storeId, loafId, ownerId, {
            contains: [id("Gluten")],
            // Gluten in both: Contains wins.
            mayContain: [id("Nuts"), id("Sesame"), id("Gluten")],
        });
        expect(after.allergens.contains.map((a) => a.name)).toEqual(["Gluten"]);
        expect(after.allergens.mayContain.map((a) => a.name)).toEqual([
            "Nuts",
            "Sesame",
        ]);
        const counts = await allergens.list(storeId, ownerId);
        expect(counts.find((a) => a.name === "Nuts")).toMatchObject({
            contains: 0,
            mayContain: 1,
        });
    });

    it("refuses to remove one a product lists, and says how many", async () => {
        const list = await allergens.list(storeId, ownerId);
        const gluten = list.find((a) => a.name === "Gluten")?.id ?? "";
        await expect(
            allergens.remove(storeId, gluten, ownerId),
        ).rejects.toThrow("Gluten is on 1 product — take it off them first.");
        const soy = list.find((a) => a.name === "Soy")?.id ?? "";
        await expect(allergens.remove(storeId, soy, ownerId)).resolves.toEqual({
            id: soy,
            name: "Soy",
        });
    });

    it("refuses another storefront's allergen, and creates nothing when it does", async () => {
        // A business has one storefront, so the other list is another's.
        otherOrgId = (
            await prisma.organization.create({
                data: {
                    name: "Allergen Org Two",
                    slug: `allergen-org-two-${tag}`,
                },
            })
        ).id;
        otherStoreId = (
            await stores.createForUser(ownerId, otherOrgId, {
                name: "Allergen Store Two",
                slug: `allergen-two-${tag}`,
            })
        ).id;
        const [mustard] = await allergens.add(otherStoreId, ownerId, [
            "Mustard",
        ]);
        await expect(
            products.patch(storeId, loafId, ownerId, {
                contains: [mustard.id],
            }),
        ).rejects.toThrow(/not on this storefront's list/);
        await expect(
            products.create(storeId, ownerId, {
                name: "Mustard rye",
                price: "380",
                currency: "INR",
                contains: [mustard.id],
            }),
        ).rejects.toThrow(/not on this storefront's list/);
        expect(
            await prisma.product.count({
                where: { storeId, name: "Mustard rye" },
            }),
        ).toBe(0);
    });
});
