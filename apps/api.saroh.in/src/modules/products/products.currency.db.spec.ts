import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { ImportsService } from "../imports/imports.service";
import { StoresService } from "../stores/stores.service";
import { ProductsService } from "./products.service";

/**
 * A business sells in one currency (DEC-030, amended 2026-09-26). Saving a
 * product without a currency keeps the one it has; changing it while a
 * storefront that sells it uses another is refused, from the editor's PUT,
 * a CSV import or a duplicate. A new product takes the storefront's, else
 * the business's — never a USD guess.
 */
const tag = `${process.pid}-${Date.now()}`;

describe("A product's currency (DB)", () => {
    const stores = new StoresService(new FeatureFlagService());
    const products = new ProductsService(stores);
    const imports = new ImportsService(stores);

    let ownerId = "";
    let orgId = "";
    /** Settled on INR. */
    let market = "";
    /** Never saved its settings. */
    let stall = "";

    async function storefront(name: string) {
        const store = await prisma.store.create({
            data: {
                name,
                slug: `pc-${name.toLowerCase().replace(/\s+/g, "-")}-${tag}`,
                organizationId: orgId,
            },
        });
        await prisma.storeOwner.create({
            data: { storeId: store.id, userId: ownerId },
        });
        return store.id;
    }

    const currencyOf = async (id: string) =>
        (
            await prisma.product.findUniqueOrThrow({
                where: { id },
                select: { currency: true },
            })
        ).currency;

    const csv = (rows: string[][]) => rows.map((r) => r.join(",")).join("\n");

    beforeAll(async () => {
        ownerId = (
            await prisma.user.create({
                data: { email: `pc-owner-${tag}@example.com` },
            })
        ).id;
        orgId = (
            await prisma.organization.create({
                data: { name: "Chai Co.", slug: `pc-chai-${tag}` },
            })
        ).id;
        market = await storefront("Chai Market");
        await prisma.storeSettings.create({
            data: { storeId: market, currency: "INR" },
        });
        stall = await storefront("Chai Stall");
    });

    it("a new product takes the storefront's currency, else the business's", async () => {
        const atMarket = await products.create(market, ownerId, {
            name: "Masala chai",
            price: "40.00",
        });
        expect(await currencyOf(atMarket.id)).toBe("INR");

        // The stall never saved its settings: the business's currency.
        const atStall = await products.create(stall, ownerId, {
            name: "Cutting chai",
            price: "20.00",
        });
        expect(await currencyOf(atStall.id)).toBe("INR");
    });

    it("a PUT without a currency keeps the product's", async () => {
        const { id } = await products.create(market, ownerId, {
            name: "Ginger chai",
            price: "45.00",
            currency: "INR",
        });
        await products.update(market, id, ownerId, {
            name: "Ginger chai",
            slug: "ginger-chai",
            price: "50.00",
        });
        expect(await currencyOf(id)).toBe("INR");
    });

    it("a PUT to another currency is refused while a storefront sells it in its own", async () => {
        const { id } = await products.create(market, ownerId, {
            name: "Kesar chai",
            price: "60.00",
        });
        await expect(
            products.update(market, id, ownerId, {
                name: "Kesar chai",
                slug: "kesar-chai",
                price: "60.00",
                currency: "USD",
            }),
        ).rejects.toThrow(ConflictException);
        expect(await currencyOf(id)).toBe("INR");
    });

    it("an import at a storefront with settings prices a new product in its currency", async () => {
        await imports.apply(market, ownerId, "products", {
            csv: csv([
                ["name", "price"],
                ["Tulsi chai", "35.00"],
            ]),
            mapping: { name: "name", price: "price" },
        });
        const made = await prisma.product.findFirstOrThrow({
            where: { organizationId: orgId, slug: "tulsi-chai" },
            select: { currency: true },
        });
        expect(made.currency).toBe("INR");
    });

    it("an import update without a currency column keeps the product's", async () => {
        const { id } = await products.create(market, ownerId, {
            name: "Elaichi chai",
            price: "40.00",
        });
        // At the storefront with no settings, whose currency is unknown.
        await imports.apply(stall, ownerId, "products", {
            csv: csv([
                ["name", "price"],
                ["Elaichi chai", "42.00"],
            ]),
            mapping: { name: "name", price: "price" },
            policy: "UPDATE",
        });
        const after = await prisma.product.findUniqueOrThrow({
            where: { id },
            select: { currency: true, price: true },
        });
        expect(after.currency).toBe("INR");
        expect(after.price.toString()).toBe("42");
    });

    it("an import update changing a listed product's currency is refused", async () => {
        const { id } = await products.create(market, ownerId, {
            name: "Kashmiri kahwa",
            price: "80.00",
        });
        await expect(
            imports.apply(market, ownerId, "products", {
                csv: csv([
                    ["name", "price", "currency"],
                    ["Kashmiri kahwa", "1.00", "USD"],
                ]),
                mapping: {
                    name: "name",
                    price: "price",
                    currency: "currency",
                },
                policy: "UPDATE",
            }),
        ).rejects.toThrow(ConflictException);
        expect(await currencyOf(id)).toBe("INR");
    });

    it("a duplicate isn't listed at a storefront in another currency", async () => {
        // Listed before the check existed: priced in USD, sold at an INR
        // storefront.
        const legacy = await prisma.product.create({
            data: {
                storeId: market,
                organizationId: orgId,
                name: "Dollar tin",
                slug: `pc-dollar-tin-${tag}`,
                price: "5.00",
                currency: "USD",
            },
        });
        await prisma.productListing.create({
            data: {
                organizationId: orgId,
                storeId: market,
                productId: legacy.id,
            },
        });
        await expect(
            products.duplicate(market, legacy.id, ownerId),
        ).rejects.toThrow(ConflictException);
        expect(
            await prisma.product.count({
                where: { organizationId: orgId, name: "Dollar tin (copy)" },
            }),
        ).toBe(0);
    });
});
