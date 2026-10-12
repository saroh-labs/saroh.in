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

describe("the price an offer publishes, with GST", () => {
    const adds = (listCents: number, gstCents: number) => ({
        mode: "ADDED" as const,
        rate: "18",
        listCents,
        gstCents,
        payCents: listCents + gstCents,
    });
    const includes = (listCents: number, gstCents: number) => ({
        mode: "INCLUDED" as const,
        rate: "18",
        listCents,
        gstCents,
        payCents: listCents,
    });
    const plain = { ...base, mrp: null, variants: [], stock: null };

    it("GST added: publishes the API's amount to pay, not the typed price", () => {
        // ₹2,000 at 18% added is ₹2,360.
        const ld = build({
            ...plain,
            price: "2000.00",
            gst: adds(200000, 36000),
        });
        expect(ld.offers).toMatchObject({
            price: "2360.00",
            priceCurrency: "INR",
        });
    });

    it("GST included, none said, or something strange: the typed price, to the paisa", () => {
        const typed = build({ ...plain, price: "2000.00" });
        expect(typed.offers).toMatchObject({ price: "2000.00" });
        for (const gst of [
            includes(200000, 30508),
            null,
            undefined,
            { mode: "ADDED" },
        ]) {
            const ld = build({
                ...plain,
                price: "2000.00",
                gst: gst as CatalogueProduct["gst"],
            });
            expect(ld).toEqual(typed);
        }
    });

    it("each option publishes what it costs to pay: its own GST, else the product's on the product's price", () => {
        const [first, second, third] = build({
            ...base,
            gst: adds(25000, 4500),
            variants: [
                // On the product's price, an API that sends no GST of its own.
                base.variants[0],
                // Its own price and its own GST.
                { ...base.variants[1], gst: adds(14000, 2520) },
                // Its own price, and the API says none on it.
                { ...base.variants[2], gst: null },
            ],
        }).offers as Record<string, unknown>[];
        expect(first.price).toBe("295.00");
        expect(second.price).toBe("165.20");
        expect(third.price).toBe("320.00");
        // The MRP is a list price only while it is above what is paid.
        expect(first.priceSpecification).toMatchObject({ price: "300.00" });
        expect(second.priceSpecification).toBeUndefined();
    });

    it("an option on its own price, from an API that sends it no GST, keeps its typed price", () => {
        const offers = build({ ...base, gst: adds(25000, 4500) })
            .offers as Record<string, unknown>[];
        expect(offers.map((o) => o.price)).toEqual([
            "295.00",
            "140.00",
            "320.00",
        ]);
    });

    it("with options and GST included or none, every offer is as before", () => {
        const before = build();
        expect(build({ ...base, gst: includes(25000, 3814) })).toEqual(before);
        expect(build({ ...base, gst: null })).toEqual(before);
        expect(
            build({
                ...base,
                gst: includes(25000, 3814),
                variants: base.variants.map((v) => ({
                    ...v,
                    gst: includes(14000, 2136),
                })),
            }),
        ).toEqual(before);
    });

    it("drops an MRP that is not above the amount to pay", () => {
        // Typed ₹250 under an MRP of ₹280; with GST added ₹295 is paid.
        const ld = build({
            ...plain,
            mrp: "280.00",
            gst: adds(25000, 4500),
        });
        expect(ld.offers).toMatchObject({ price: "295.00" });
        expect(ld.offers).not.toHaveProperty("priceSpecification");
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
