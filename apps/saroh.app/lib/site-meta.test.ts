import { describe, expect, it } from "vitest";

import { serviceJsonLd, serviceJsonLdScript } from "./service-json-ld";
import {
    bookDescription,
    canonical,
    cutAt,
    listed,
    productDescription,
    shopDescription,
    titled,
} from "./site-meta";

describe("a page's title", () => {
    it("is the page, then whose site it is", () => {
        expect(titled("About", "Rye & Co.")).toBe("About · Rye & Co.");
        expect(titled(" Why our sourdough takes two days ", "Rye & Co.")).toBe(
            "Why our sourdough takes two days · Rye & Co.",
        );
    });

    it("is the business alone for a page with no name, or named as the business is", () => {
        expect(titled(null, "Rye & Co.")).toBe("Rye & Co.");
        expect(titled("  ", "Rye & Co.")).toBe("Rye & Co.");
        expect(titled("Rye & Co.", "Rye & Co.")).toBe("Rye & Co.");
    });
});

describe("a page's one address", () => {
    it("is on the site's own domain when it has one, whichever host was asked", () => {
        const meta = canonical(
            { primaryHost: "www.ryebakery.in" },
            "rye.saroh.app",
            "/shop/sourdough",
        );
        expect(meta.alternates?.canonical).toBe(
            "https://www.ryebakery.in/shop/sourdough",
        );
        expect(String(meta.metadataBase)).toBe("https://www.ryebakery.in/");
    });

    it("is on the host asked when the API named none", () => {
        for (const site of [{ primaryHost: null }, {}]) {
            expect(
                canonical(site, "rye.saroh.app", "/about").alternates
                    ?.canonical,
            ).toBe("https://rye.saroh.app/about");
        }
    });

    it("names the home page with its slash, and any other without a trailing one", () => {
        const site = { primaryHost: "rye.saroh.app" };
        expect(canonical(site, "x", "/").alternates?.canonical).toBe(
            "https://rye.saroh.app/",
        );
        expect(canonical(site, "x", "").alternates?.canonical).toBe(
            "https://rye.saroh.app/",
        );
        expect(canonical(site, "x", "/book/").alternates?.canonical).toBe(
            "https://rye.saroh.app/book",
        );
        expect(canonical(site, "x", "blog/a-post").alternates?.canonical).toBe(
            "https://rye.saroh.app/blog/a-post",
        );
    });
});

describe("a description built from the page", () => {
    it("is the product's own when its merchant wrote one", () => {
        expect(
            productDescription({
                seoDescription: " A two-day sourdough. ",
                description: "<p>Ignored</p>",
                keyPoints: [],
            }),
        ).toBe("A two-day sourdough.");
    });

    it("falls back to the product's blurb: what its page says about it", () => {
        expect(
            productDescription({
                seoDescription: null,
                description:
                    "<p>A slow, cold rise is where the <strong>flavour</strong> comes from.</p>",
                keyPoints: ["Vegan"],
            }),
        ).toBe("A slow, cold rise is where the flavour comes from.");
        expect(
            productDescription({
                seoDescription: "  ",
                description: null,
                keyPoints: ["Stone-ground flour", "No added sugar"],
            }),
        ).toBe("Stone-ground flour. No added sugar");
    });

    it("says nothing for a product whose page says nothing", () => {
        expect(
            productDescription({
                seoDescription: null,
                description: "<p> </p>",
                keyPoints: [],
            }),
        ).toBeUndefined();
    });

    it("cuts at a word's end, and marks the cut", () => {
        const long = "word ".repeat(60).trim();
        const cut = cutAt(long);
        expect(cut.length).toBeLessThanOrEqual(160);
        expect(cut.endsWith("…")).toBe(true);
        expect(cut).not.toMatch(/\s…$/);
        expect(cutAt("Short  and \n sweet.")).toBe("Short and sweet.");
    });

    it("lists up to three by name", () => {
        expect(listed([])).toBe("");
        expect(listed(["Sourdough"])).toBe("Sourdough");
        expect(listed(["Sourdough", "Rye"])).toBe("Sourdough and Rye");
        expect(listed(["Sourdough", "Rye", "Focaccia"])).toBe(
            "Sourdough, Rye and Focaccia",
        );
        expect(listed(["Sourdough", "Rye", "Focaccia", "Bagels"])).toBe(
            "Sourdough, Rye, Focaccia and more",
        );
    });

    it("describes the shop by its page's lead, else by what is sold there", () => {
        expect(
            shopDescription({
                lead: "Baked this morning, on your table tonight.",
                business: "Rye & Co.",
                products: ["Sourdough"],
            }),
        ).toBe("Baked this morning, on your table tonight.");
        expect(
            shopDescription({
                business: "Rye & Co.",
                products: ["Sourdough", "Rye"],
            }),
        ).toBe("Shop Sourdough and Rye from Rye & Co. online.");
        expect(
            shopDescription({ business: "Rye & Co.", products: [] }),
        ).toBeUndefined();
    });

    it("describes the booking page by its lead, else by what can be booked", () => {
        expect(
            bookDescription({
                business: "Kavi Dental",
                services: [
                    "Check-up",
                    "Scale and polish",
                    "Whitening",
                    "Braces",
                ],
            }),
        ).toBe(
            "Book Check-up, Scale and polish, Whitening and more with Kavi Dental online.",
        );
        expect(
            bookDescription({
                lead: " Same-week bookings. ",
                business: "Kavi Dental",
                services: [],
            }),
        ).toBe("Same-week bookings.");
        expect(
            bookDescription({ business: "Kavi Dental", services: [] }),
        ).toBeUndefined();
    });
});

describe("Service structured data on the booking page", () => {
    const input = {
        business: "Kavi Dental",
        origin: "https://kavidental.example",
        services: [
            {
                id: "svc_1",
                name: "Check-up",
                description: " A full check, with X-rays if needed. ",
                priceCents: 80_000,
                currency: "INR",
            },
            {
                id: "svc 2",
                name: "First visit",
                description: null,
                priceCents: 0,
                currency: "INR",
            },
        ],
    };

    it("names each service, who provides it, and its price where it has one", () => {
        expect(serviceJsonLd(input)).toEqual([
            {
                "@context": "https://schema.org",
                "@type": "Service",
                name: "Check-up",
                description: "A full check, with X-rays if needed.",
                url: "https://kavidental.example/book?service=svc_1",
                provider: {
                    "@type": "Organization",
                    name: "Kavi Dental",
                    url: "https://kavidental.example/",
                },
                offers: {
                    "@type": "Offer",
                    price: "800.00",
                    priceCurrency: "INR",
                    url: "https://kavidental.example/book?service=svc_1",
                },
            },
            {
                "@context": "https://schema.org",
                "@type": "Service",
                name: "First visit",
                url: "https://kavidental.example/book?service=svc%202",
                provider: {
                    "@type": "Organization",
                    name: "Kavi Dental",
                    url: "https://kavidental.example/",
                },
            },
        ]);
    });

    it("claims nothing the page doesn't say, and is nothing with no services", () => {
        const text = JSON.stringify(serviceJsonLd(input));
        expect(text).not.toMatch(/rating|review|areaServed|availability/i);
        expect(serviceJsonLdScript({ ...input, services: [] })).toBeNull();
    });

    it("can't close its own script tag", () => {
        const script = serviceJsonLdScript({
            ...input,
            services: [
                {
                    id: "svc_1",
                    name: "</script><script>alert(1)</script>",
                    priceCents: null,
                    currency: null,
                },
            ],
        });
        expect(script).not.toContain("</script>");
        expect(script).not.toContain("<");
    });
});
