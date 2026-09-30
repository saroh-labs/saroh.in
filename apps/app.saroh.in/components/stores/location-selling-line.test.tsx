import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SiteSelling } from "@/lib/sites/sells-from";
import { locationSelling, locationSellingLine } from "@/lib/sites/sells-from";

import { LocationSellingLine } from "./location-selling-line";

/**
 * Each location says where it sells (DEC-069, R3): in person only, in person
 * and online, or online only — derived from the site's Sells from, never
 * stored — with a link to the online shop when it sells there.
 */

const hill = { id: "st_hill", kind: "SHOP" as const };
const online = { id: "st_online", kind: "ONLINE" as const };

const site = (
    sellsFromId: string | null,
    {
        products = 3,
        origin = "https://rye.saroh.app",
    }: { products?: number; origin?: string | null } = {},
): SiteSelling => ({
    siteId: "site_1",
    origin,
    sellsFrom: {
        storefront: sellsFromId ? { id: sellsFromId, name: "It" } : null,
        choices: [
            { id: "st_hill", name: "Hill Road", products },
            { id: "st_online", name: "Online", products },
        ],
    },
});

const text = (html: string) =>
    html
        .replace(/<[^>]+>/g, "")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const line = (...args: Parameters<typeof locationSelling>) =>
    renderToStaticMarkup(
        <LocationSellingLine selling={locationSelling(...args)} />,
    );

describe("LocationSellingLine (DEC-069, L9)", () => {
    it("a location that is the Sells from sells in person and online, linking to the live shop", () => {
        const html = line(hill, site("st_hill"));
        expect(text(html)).toContain("Sells in person and online");
        expect(html).toContain('href="https://rye.saroh.app/shop"');
        expect(html).toContain('target="_blank"');
        expect(text(html)).toContain("Your online shop");
    });

    it("a location that isn't the Sells from sells in person only, with no link", () => {
        const html = line(hill, site("st_online"));
        expect(text(html)).toBe("Sells in person only");
        expect(html).not.toContain("href");
    });

    it("a No counter location that is the Sells from sells online only", () => {
        const html = line(online, site("st_online"));
        expect(text(html)).toContain("Online only");
        expect(html).toContain('href="https://rye.saroh.app/shop"');
    });

    it("with no website, a place customers visit sells in person only", () => {
        expect(text(line(hill, null))).toBe("Sells in person only");
    });

    it("links to the Sells from row, and says so, while the shop isn't live", () => {
        for (const html of [
            // The site is a draft: nothing is at /shop yet.
            line(hill, site("st_hill", { origin: null })),
            // Nothing listed here yet: /shop would be empty.
            line(hill, site("st_hill", { products: 0 })),
        ]) {
            expect(text(html)).toContain("Sells in person and online");
            expect(html).toContain('href="/sites/site_1/settings#sells-from"');
            expect(text(html)).toContain("Your online shop isn't live yet");
            expect(html).not.toContain('target="_blank"');
        }
    });

    it("a No counter location the shop doesn't sell from says it isn't selling yet", () => {
        const selling = locationSelling(online, site("st_hill"));
        expect(selling.says).toBe("not-yet");
        expect(locationSellingLine(selling)).toMatch(/^Not selling yet/);
        expect(line(online, site("st_hill"))).toContain(
            'href="/sites/site_1/settings#sells-from"',
        );
    });

    it("offers no link when the shop isn't open for the business", () => {
        const closed: SiteSelling = { ...site(null), sellsFrom: null };
        expect(text(line(hill, closed))).toBe("Sells in person only");
        expect(line(online, closed)).not.toContain("href");
    });

    it("never says storefront", () => {
        for (const html of [
            line(hill, site("st_hill")),
            line(hill, site("st_online")),
            line(online, site("st_online")),
            line(online, site("st_hill")),
        ]) {
            expect(text(html)).not.toMatch(/storefront/i);
        }
    });
});
