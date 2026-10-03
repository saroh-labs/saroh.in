import { describe, expect, it } from "vitest";

import { isCatalogue, isCatalogueProduct, lookupOf } from "./catalogue-shape";

const card = {
    slug: "sourdough",
    name: "Sourdough",
    currency: "INR",
    price: "250.00",
    mrp: null,
    priceFrom: true,
    image: null,
    variantTitles: ["Small", "Large"],
    blurb: "Slow rye.",
    soldOut: false,
};

const product = {
    slug: "sourdough",
    name: "Sourdough",
    currency: "INR",
    price: "250.00",
    mrp: null,
    categoryName: null,
    description: "<p>Slow rye.</p>",
    keyPoints: [],
    howToUse: null,
    materials: null,
    materialsLabel: "Ingredients or material",
    maker: "Tanvi Studio",
    warranty: null,
    returns: null,
    extras: [],
    images: [{ id: "i1", url: "https://img.test/a.jpg", alt: "" }],
    optionName: "Size",
    variants: [
        {
            id: "v1",
            title: "Small",
            price: "250.00",
            mrp: null,
            imageId: null,
            stock: "LOW",
            left: 2,
        },
    ],
    stock: null,
    rating: null,
    reviews: [],
    seoTitle: null,
    seoDescription: null,
};

describe("the shop's answers (G11)", () => {
    it("accepts the catalogue and a product as the API sends them", () => {
        expect(
            isCatalogue({ storefront: { name: "Online" }, products: [card] }),
        ).toBe(true);
        expect(isCatalogueProduct(product)).toBe(true);
    });

    it("refuses a body that isn't one, rather than drawing half a product", () => {
        expect(isCatalogue(null)).toBe(false);
        expect(
            isCatalogue({
                storefront: { name: "Online" },
                products: [{ ...card, price: 250 }],
            }),
        ).toBe(false);
        expect(
            isCatalogueProduct({
                ...product,
                variants: [{ ...product.variants[0], stock: "LOTS" }],
            }),
        ).toBe(false);
    });

    it("reads a 404 as nothing to show, and anything else wrong as unavailable", async () => {
        await expect(
            lookupOf(new Response(null, { status: 404 }), isCatalogue),
        ).resolves.toEqual({ ok: false, reason: "missing" });
        await expect(
            lookupOf(new Response("oops", { status: 502 }), isCatalogue),
        ).resolves.toEqual({ ok: false, reason: "unavailable" });
        await expect(
            lookupOf(new Response("{}", { status: 200 }), isCatalogue),
        ).resolves.toEqual({ ok: false, reason: "unavailable" });
        const ok = await lookupOf(
            new Response(
                JSON.stringify({
                    storefront: { name: "Online" },
                    products: [card],
                }),
                { status: 200 },
            ),
            isCatalogue,
        );
        expect(ok.ok).toBe(true);
    });
});
