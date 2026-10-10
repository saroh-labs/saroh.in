import { describe, expect, it } from "vitest";

import type { CatalogueProduct } from "./catalogue-shape";
import {
    jsonLdScript,
    plainText,
    productJsonLd,
    productJsonLdScript,
} from "./product-json-ld";

const base: CatalogueProduct = {
    slug: "sourdough",
    name: "Sourdough loaf",
    currency: "INR",
    price: "250.00",
    mrp: "300.00",
    categoryName: "Breads",
    description: "<p>Slow rye &amp; wheat.</p><ul><li>800g</li></ul>",
    keyPoints: [],
    howToUse: null,
    materials: null,
    maker: "Rye &amp; Co.",
    warranty: null,
    returns: null,
    extras: [],
    images: [
        { id: "i1", url: "https://img.test/a.jpg", alt: "" },
        { id: "i2", url: "/media/b.jpg", alt: "" },
        { id: "v", url: "https://img.test/clip.mp4", alt: "", kind: "video" },
    ],
    optionName: "Size",
    variants: [
        {
            id: "v1",
            title: "800g",
            price: null,
            mrp: null,
            imageId: null,
            stock: "IN_STOCK",
            left: null,
        },
        {
            id: "v2",
            title: "400g",
            price: "140.00",
            mrp: "140.00",
            imageId: null,
            stock: "LOW",
            left: 2,
        },
        {
            id: "v3",
            title: "1kg",
            price: "320.00",
            mrp: null,
            imageId: null,
            stock: "SOLD_OUT",
            left: null,
        },
    ],
    stock: null,
    rating: { average: 4.5, count: 12 },
    reviews: [],
    seoTitle: null,
    seoDescription: null,
    productId: "prod_1",
    listingId: "lst_1",
};

const build = (product: CatalogueProduct = base) =>
    productJsonLd({
        product,
        origin: "https://rye.saroh.app",
        business: "Rye & Co.",
    });

describe("productJsonLd (#473)", () => {
    it("describes the product from what the page shows", () => {
        const ld = build();
        expect(ld["@context"]).toBe("https://schema.org");
        expect(ld["@type"]).toBe("Product");
        expect(ld.name).toBe("Sourdough loaf");
        expect(ld.url).toBe("https://rye.saroh.app/shop/sourdough");
        expect(ld.category).toBe("Breads");
        expect(ld.description).toBe("Slow rye & wheat. 800g");
        // Photos only, made absolute; never the video.
        expect(ld.image).toEqual([
            "https://img.test/a.jpg",
            "https://rye.saroh.app/media/b.jpg",
        ]);
    });

    it("prefers the written search description", () => {
        const ld = build({ ...base, seoDescription: "  Baked daily.  " });
        expect(ld.description).toBe("Baked daily.");
    });

    it("offers each variant at its price in the shop's currency, with availability from stock", () => {
        const offers = build().offers as Record<string, unknown>[];
        expect(offers).toHaveLength(3);
        const [first, second, third] = offers;
        expect(first).toMatchObject({
            "@type": "Offer",
            name: "Sourdough loaf – 800g",
            url: "https://rye.saroh.app/shop/sourdough",
            price: "250.00",
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
            seller: { "@type": "Organization", name: "Rye & Co." },
        });
        // A variant on the product's price carries the product's MRP.
        expect(first.priceSpecification).toMatchObject({
            priceType: "https://schema.org/ListPrice",
            price: "300.00",
        });
        expect(second).toMatchObject({
            price: "140.00",
            availability: "https://schema.org/LimitedAvailability",
        });
        // An MRP no higher than the price is no money off.
        expect(second.priceSpecification).toBeUndefined();
        expect(third).toMatchObject({
            price: "320.00",
            availability: "https://schema.org/OutOfStock",
        });
    });

    it("gives a product without variants one offer from its own stock", () => {
        const ld = build({
            ...base,
            mrp: null,
            variants: [],
            stock: { word: "SOLD_OUT", left: null },
        });
        expect(ld.offers).toMatchObject({
            "@type": "Offer",
            price: "250.00",
            availability: "https://schema.org/OutOfStock",
        });
        const untracked = build({ ...base, variants: [], stock: null });
        expect(untracked.offers).not.toHaveProperty("availability");
    });

    it("rates only from the published reviews the API counted, and not at all without any", () => {
        expect(build().aggregateRating).toEqual({
            "@type": "AggregateRating",
            ratingValue: 4.5,
            reviewCount: 12,
            bestRating: 5,
            worstRating: 1,
        });
        expect(build({ ...base, rating: null })).not.toHaveProperty(
            "aggregateRating",
        );
        expect(
            build({ ...base, rating: { average: 0, count: 0 } }),
        ).not.toHaveProperty("aggregateRating");
    });

    it("carries no internal fields and never Saroh's name", () => {
        const text = JSON.stringify(build());
        for (const internal of ["prod_1", "lst_1", "listingId", "productId"])
            expect(text).not.toContain(internal);
        // The merchant sells it; Saroh is named nowhere (the address aside).
        expect(text).not.toMatch(/"(brand|name|seller)":"Saroh/i);
        expect(text).not.toContain('"brand"');
    });
});

describe("jsonLdScript", () => {
    it("cannot close its script tag or open a comment", () => {
        const out = productJsonLdScript({
            product: {
                ...base,
                name: "</script><script>alert(1)</script> & <!--",
            },
            origin: "https://rye.saroh.app",
            business: "Rye",
        });
        expect(out).not.toContain("<");
        expect(out).not.toContain(">");
        expect(out).not.toContain("&");
        // And it still reads back as the same text.
        const back = JSON.parse(out) as { name: string };
        expect(back.name).toBe("</script><script>alert(1)</script> & <!--");
    });

    it("escapes the JavaScript line separators", () => {
        const out = jsonLdScript({ a: "x\u2028y\u2029z" });
        expect(out).toBe('{"a":"x\\u2028y\\u2029z"}');
        expect(JSON.parse(out)).toEqual({ a: "x\u2028y\u2029z" });
    });
});

describe("plainText", () => {
    it("drops tags and decodes the entities the sanitiser writes", () => {
        expect(
            plainText("<p>A&nbsp;&lt;b&gt; &quot;c&quot; &#39;d&#39;</p>"),
        ).toBe("A <b> \"c\" 'd'");
    });
});
