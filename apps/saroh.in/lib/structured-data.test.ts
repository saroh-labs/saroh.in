import { offeredPlans, planPricePaise } from "@saroh/pricing-catalog";
import { describe, expect, it, vi } from "vitest";

import type { CompanyFacts } from "@/content/company";
import { COMPANY, officeLine } from "@/content/company";
import { SAROH_CONTACT_EMAIL } from "@/content/contact";
import { SAROH_SOCIAL } from "@/content/social";

import { fakeCatalog } from "./pricing.fixture";
import {
    breadcrumbLd,
    faqPageLd,
    jsonLdText,
    organizationLd,
    softwareApplicationLd,
    techArticleLd,
    webSiteLd,
} from "./structured-data";

vi.mock("@/env", () => ({ env: {} }));

/** Every key in a JSON-LD object, however deep. */
function keys(value: unknown, found = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((v) => keys(v, found));
    else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
            found.add(k);
            keys(v, found);
        }
    }
    return found;
}

/** Every string in it. */
function strings(value: unknown, found: string[] = []): string[] {
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) value.forEach((v) => strings(v, found));
    else if (value && typeof value === "object") {
        Object.values(value).forEach((v) => strings(v, found));
    }
    return found;
}

/**
 * What the site tells a search engine about who makes Saroh (12 Oct 2026):
 * the facts that are set, and nothing that isn't (DEC-137).
 */
describe("organizationLd", () => {
    const org = organizationLd();

    it("names the brand, the LLP, where to write and Saroh's accounts", () => {
        expect(org).toMatchObject({
            "@type": "Organization",
            name: "Saroh",
            legalName: COMPANY.legalName,
            url: "https://www.saroh.in",
            email: SAROH_CONTACT_EMAIL,
            sameAs: SAROH_SOCIAL.map((link) => link.href),
        });
        expect(org.contactPoint).toMatchObject({
            "@type": "ContactPoint",
            email: SAROH_CONTACT_EMAIL,
        });
    });

    it("gives the registered office the legal pages give, in its parts", () => {
        const office = officeLine() ?? "";
        expect(org.address).toMatchObject({ "@type": "PostalAddress" });
        const address = org.address as Record<string, string>;
        for (const part of [
            address.streetAddress,
            address.addressLocality,
            address.addressRegion,
            address.postalCode,
        ]) {
            expect(office).toContain(part);
        }
        expect(address.addressCountry).toBe("IN");
        expect(office.endsWith("India")).toBe(true);
    });

    it("leaves out what isn't set: no phone, no address, no empty value", () => {
        // Today no phone number is published.
        expect(COMPANY.phone).toBeUndefined();
        expect(keys(org).has("telephone")).toBe(false);

        const bare: CompanyFacts = { legalName: "Example LLP" };
        const without = organizationLd(bare);
        expect(keys(without).has("address")).toBe(false);
        expect(keys(without).has("telephone")).toBe(false);
        for (const s of strings(without)) expect(s.trim()).not.toBe("");

        const withPhone = organizationLd({
            ...bare,
            phone: { display: "+91 98450 12345", dial: "+919845012345" },
        });
        expect(withPhone.telephone).toBe("+919845012345");
        expect(withPhone.contactPoint).toMatchObject({
            telephone: "+919845012345",
        });
    });

    it("holds no registration number until one is published", () => {
        const all = jsonLdText(org);
        expect(all).not.toMatch(/GSTIN|LLPIN|taxID|vatID/i);
    });
});

/** Nothing here is a price, a rating, a review or a count of customers. */
describe("no price, rating or plan while pricing is hidden", () => {
    const FORBIDDEN = [
        "offers",
        "price",
        "priceCurrency",
        "priceRange",
        "aggregateRating",
        "review",
        "ratingValue",
        "reviewCount",
        "numberOfEmployees",
        "foundingDate",
        "founder",
    ];

    it("in what every page sends before launch", () => {
        const sent = [
            organizationLd(),
            webSiteLd(),
            // Before launch the catalogue isn't read (DEC-136): null.
            softwareApplicationLd(null, "What Saroh is."),
            breadcrumbLd([{ name: "Features", path: "/#features" }]),
            techArticleLd({
                headline: "Add your GSTIN",
                description: "How to.",
                path: "/help/add-your-gstin",
                publishOn: "2026-10-17",
                updated: "2026-10-09",
            }),
        ];
        const found = keys(sent);
        for (const key of FORBIDDEN) expect(found.has(key), key).toBe(false);
        expect(jsonLdText(sent)).not.toMatch(/₹|INR|\bGrow\b|\bPro\b/);
    });

    it("offers come only from a published catalogue, once it is read", () => {
        expect(keys(softwareApplicationLd(null, "x")).has("offers")).toBe(
            false,
        );
        expect(
            keys(softwareApplicationLd(fakeCatalog(), "x")).has("offers"),
        ).toBe(true);
    });
});

describe("faqPageLd", () => {
    it("gives each question its answer, in order, word for word", () => {
        const items = [
            { q: "One?", a: "First." },
            { q: "Two?", a: "Second." },
            { q: "Three?", a: "Third." },
        ];
        const ld = faqPageLd(items);
        expect(ld["@type"]).toBe("FAQPage");
        expect(ld.mainEntity).toEqual(
            items.map((i) => ({
                "@type": "Question",
                name: i.q,
                acceptedAnswer: { "@type": "Answer", text: i.a },
            })),
        );
    });
});

describe("softwareApplicationLd offers", () => {
    interface Offer {
        name: string;
        price: string;
        priceSpecification: { unitCode: string };
    }
    const offersOf = (catalog: ReturnType<typeof fakeCatalog>) =>
        softwareApplicationLd(catalog, "x").offers as Offer[];

    it("yearly off: one monthly offer a plan, priced from the catalogue", () => {
        const catalog = fakeCatalog();
        catalog.yearly = { ...catalog.yearly, on: false };
        const plans = offeredPlans(catalog);
        expect(
            offersOf(catalog).map((o) => [
                o.name,
                o.price,
                o.priceSpecification.unitCode,
            ]),
        ).toEqual(
            plans.map((p) => [p.name, (p.pricePaise / 100).toFixed(2), "MON"]),
        );
    });

    it("yearly on: each paid plan also has a yearly offer, priced from the catalogue", () => {
        const catalog = fakeCatalog();
        expect(catalog.yearly.on).toBe(true);
        const offers = offersOf(catalog);
        for (const p of offeredPlans(catalog)) {
            const yearly = offers.find((o) => o.name === `${p.name}, yearly`);
            if (p.pricePaise === 0) {
                expect(yearly).toBeUndefined();
                continue;
            }
            expect(yearly?.price).toBe(
                (planPricePaise(catalog, p, "year") / 100).toFixed(2),
            );
            expect(yearly?.priceSpecification.unitCode).toBe("ANN");
        }
        const paid = offeredPlans(catalog).filter((p) => p.pricePaise > 0);
        expect(offers).toHaveLength(offeredPlans(catalog).length + paid.length);
    });
});

describe("webSiteLd", () => {
    it("names the site, its one address and Indian English", () => {
        expect(webSiteLd()).toMatchObject({
            "@type": "WebSite",
            name: "Saroh",
            url: "https://www.saroh.in",
            inLanguage: "en-IN",
        });
        // No search box is claimed: the site has no search of its own.
        expect(keys(webSiteLd()).has("potentialAction")).toBe(false);
    });
});

describe("breadcrumbLd", () => {
    it("lists the trail in order, each with its address on www", () => {
        expect(
            breadcrumbLd([
                { name: "Features", path: "/#features" },
                { name: "Billing", path: "/features/billing" },
            ]).itemListElement,
        ).toEqual([
            {
                "@type": "ListItem",
                position: 1,
                name: "Features",
                item: "https://www.saroh.in/#features",
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "Billing",
                item: "https://www.saroh.in/features/billing",
            },
        ]);
    });

    it("gives a label with no page of its own no address", () => {
        const [, area] = breadcrumbLd([
            { name: "Help", path: "/help" },
            { name: "Bookings" },
        ]).itemListElement as Record<string, unknown>[];
        expect(area).toEqual({
            "@type": "ListItem",
            position: 2,
            name: "Bookings",
        });
    });
});

describe("techArticleLd", () => {
    it("says when a Help article went up and when it last changed, in India", () => {
        expect(
            techArticleLd({
                headline: "Add your GSTIN",
                description: "How to.",
                path: "/help/add-your-gstin",
                publishOn: "2026-10-17",
                updated: "2026-10-20",
            }),
        ).toMatchObject({
            "@type": "TechArticle",
            headline: "Add your GSTIN",
            url: "https://www.saroh.in/help/add-your-gstin",
            datePublished: "2026-10-17T00:00:00+05:30",
            dateModified: "2026-10-20T00:00:00+05:30",
        });
    });

    it("never says it changed before it went up", () => {
        expect(
            techArticleLd({
                headline: "Add your GSTIN",
                description: "How to.",
                path: "/help/add-your-gstin",
                publishOn: "2026-10-17",
                updated: "2026-10-09",
            }).dateModified,
        ).toBe("2026-10-17T00:00:00+05:30");
    });
});
