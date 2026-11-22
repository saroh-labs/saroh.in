import { describe, expect, it } from "vitest";

import { GET as indexGET } from "@/app/sitemap.xml/route";
import { GET as groupGET } from "@/app/sitemap/[group]/route";

import { indexedPages, pageOf } from "./site-map";
import { sitemapGroups } from "./sitemaps";

const group = (g: string) =>
    groupGET(new Request(`https://saroh.tech/sitemap/${g}`), {
        params: Promise.resolve({ group: g }),
    });

describe("the sitemap", () => {
    it("pairs a page with saroh.in, with its real date", () => {
        const groups = sitemapGroups([
            { ...pageOf("/pricing"), updated: "2026-11-02" },
            pageOf("/tools/vat-calculator"),
        ]);
        const [pricing] = groups.get("pages") ?? [];
        expect(pricing.url).toBe("https://saroh.tech/pricing");
        expect(pricing.lastModified).toBe("2026-11-02");
        expect(pricing.alternates).toEqual({
            en: "https://saroh.tech/pricing",
            "en-IN": "https://www.saroh.in/pricing",
            "x-default": "https://saroh.tech/pricing",
        });
        // A global-only page has no pair; an empty group has no sitemap.
        expect(groups.get("tools")?.[0].alternates).toBeUndefined();
        expect([...groups.keys()]).toEqual(["pages", "tools"]);
    });

    it("lists every indexed page once, in its group", () => {
        const groups = sitemapGroups();
        const urls = [...groups.values()].flat().map((e) => e.url);
        expect(urls).toHaveLength(indexedPages().length);
        expect(new Set(urls).size).toBe(urls.length);
        expect([...groups.keys()]).toEqual([
            "pages",
            "solutions",
            "features",
            "tools",
            "guides",
            "help",
            "changelog",
        ]);
        for (const e of groups.get("solutions") ?? []) {
            expect(e.url).toMatch(/^https:\/\/saroh\.tech\/solutions/);
        }
    });

    it("serves an index of saroh.tech sitemaps, each dated by its newest page", async () => {
        const res = indexGET();
        expect(res.headers.get("Content-Type")).toContain("application/xml");
        const xml = await res.text();
        for (const [g, entries] of sitemapGroups()) {
            const newest = entries
                .map((e) => e.lastModified ?? "")
                .sort()
                .at(-1);
            expect(xml).toContain(
                `<loc>https://saroh.tech/sitemap/${g}.xml</loc>\n<lastmod>${newest}</lastmod>`,
            );
        }
        expect(xml).not.toMatch(/saroh\.in|localhost/);
    });

    it("serves a group with its hreflang twins, and 404s an unknown one", async () => {
        const xml = await (await group("pages.xml")).text();
        expect(xml).toContain("<loc>https://saroh.tech</loc>");
        expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
        expect(xml).toMatch(/hreflang="en-IN" href="https:\/\/www\.saroh\.in/);
        expect((await group("nope.xml")).status).toBe(404);
        expect((await group("pages")).status).toBe(404);
    });
});
