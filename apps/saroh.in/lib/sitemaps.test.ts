import { listSearchPages } from "@saroh/search-pages";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublishContext } from "@/content/resources";

import { docPages } from "./docs-pages";
import type { PublishList } from "./search-pages";
import { indexedPaths, lastModified } from "./site-pages";
import { sitemapGroups, sitemapIndexXml, urlsetXml } from "./sitemaps";

const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));

const EVERYTHING: PublishContext = {
    now: new Date(),
    preview: true,
    routes: null,
};
const gst = docPages.list("gst")[0];
const guide = docPages.list("guides")[0];

const FOR_AND_TOOLS = listSearchPages().map((p) => p.path);

/** A production list with `live` live; the env says the same, as a build's would. */
const listOf = (live: string[], preview = false): PublishList => {
    const list = { preview, live, takenOff: [] };
    env.SAROH_SEARCH_PAGES = JSON.stringify(list);
    return list;
};
beforeEach(() => {
    delete env.SAROH_SEARCH_PAGES;
});

const paths = (groups: Map<string, { url: string }[]>, g: string) =>
    (groups.get(g) ?? []).map((e) => new URL(e.url).pathname);

describe("sitemap groups (plan 2026-10-31-002, U5)", () => {
    it.each(["open", "waitlist"] as const)(
        "%s: every URL of the old single sitemap is in exactly one group, with the same lastmod",
        (mode) => {
            const list = listOf(FOR_AND_TOOLS);
            const groups = sitemapGroups(mode, EVERYTHING, null, list);
            // What app/sitemap.ts listed before the split.
            const before = indexedPaths(mode, EVERYTHING, list).map((p) => ({
                url: `https://www.saroh.in${p}`,
                lastModified: lastModified(p),
            }));
            expect(before.length).toBeGreaterThan(50);
            const all = [...groups.values()].flat();
            for (const b of before) {
                const hits = all.filter((e) => e.url === b.url);
                expect(hits, b.url).toHaveLength(1);
                expect(hits[0].lastModified, b.url).toBe(b.lastModified);
            }
            // Nothing else: no new-kind page is live here.
            expect(all).toHaveLength(before.length);
            expect([...groups.keys()]).toEqual(["pages", "for", "tools"]);
            expect(paths(groups, "for")).toContain("/for");
            expect(paths(groups, "tools")).toContain("/tools");
            expect(
                paths(groups, "pages").filter(
                    (p) => p.startsWith("/for") || p.startsWith("/tools"),
                ),
            ).toEqual([]);
        },
    );

    it("leaves out a group with no live page, and its index entry", () => {
        const groups = sitemapGroups("open", EVERYTHING, null, listOf([]));
        // The app's own two tools are Resources pages, live by date.
        expect([...groups.keys()]).toEqual(["pages", "tools"]);
        const xml = sitemapIndexXml(groups);
        expect(xml).toContain(
            "<loc>https://www.saroh.in/sitemap/pages.xml</loc>",
        );
        expect(xml).not.toContain("/sitemap/for.xml");
        expect(xml).not.toContain("/sitemap/gst.xml");
    });

    it("lists a live GST page and its hub, dated by the page", () => {
        const groups = sitemapGroups(
            "open",
            EVERYTHING,
            null,
            listOf([gst.path, guide.path]),
        );
        expect(groups.get("gst")).toEqual([
            {
                url: "https://www.saroh.in/gst",
                lastModified: `${gst.updated}T00:00:00+05:30`,
            },
            {
                url: `https://www.saroh.in${gst.path}`,
                lastModified: `${gst.updated}T00:00:00+05:30`,
            },
        ]);
        expect(paths(groups, "guides")).toEqual(["/guides", guide.path]);
        expect(groups.has("downloads")).toBe(false);
        expect(sitemapIndexXml(groups)).toContain(
            `<loc>https://www.saroh.in/sitemap/gst.xml</loc>\n<lastmod>${gst.updated}T00:00:00+05:30</lastmod>`,
        );
    });

    it("never lists a draft on a preview", () => {
        const groups = sitemapGroups(
            "open",
            EVERYTHING,
            null,
            listOf([], true),
        );
        expect(groups.has("gst")).toBe(false);
        expect(groups.has("for")).toBe(false);
    });

    it("never lists a page whose route this build lacks", () => {
        const groups = sitemapGroups(
            "open",
            { ...EVERYTHING, routes: ["/", "/gst"] },
            null,
            listOf([gst.path]),
        );
        expect(groups.has("gst")).toBe(false);
    });
});

describe("the XML", () => {
    it("writes a urlset with lastmod only where there is one", () => {
        const xml = urlsetXml([
            { url: "https://www.saroh.in/a?x=1&y=2" },
            {
                url: "https://www.saroh.in/b",
                lastModified: "2026-10-24T00:00:00+05:30",
            },
        ]);
        expect(xml).toBe(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>https://www.saroh.in/a?x=1&amp;y=2</loc>\n</url>\n<url>\n<loc>https://www.saroh.in/b</loc>\n<lastmod>2026-10-24T00:00:00+05:30</lastmod>\n</url>\n</urlset>\n',
        );
        expect(xml).not.toMatch(/<changefreq>|<priority>/);
    });
});

describe("the routes", () => {
    it("build one static child per group, 404 any other, and the index names them", async () => {
        listOf(FOR_AND_TOOLS);
        const child = await import("@/app/sitemap/[group]/route");
        const index = await import("@/app/sitemap.xml/route");
        expect(child.dynamic).toBe("force-static");
        expect(child.dynamicParams).toBe(false);
        const params = await child.generateStaticParams();
        expect(params).toEqual([
            { group: "pages.xml" },
            { group: "for.xml" },
            { group: "tools.xml" },
        ]);
        const res = await child.GET(new Request("https://x/"), {
            params: Promise.resolve({ group: "for.xml" }),
        });
        expect(res.headers.get("content-type")).toContain("application/xml");
        expect(await res.text()).toContain(
            "<loc>https://www.saroh.in/for</loc>",
        );
        for (const g of ["gst.xml", "pages", "nope.xml"]) {
            const miss = await child.GET(new Request("https://x/"), {
                params: Promise.resolve({ group: g }),
            });
            expect(miss.status, g).toBe(404);
        }
        const xml = await (await index.GET()).text();
        expect(
            [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]),
        ).toEqual(params.map((p) => `https://www.saroh.in/sitemap/${p.group}`));
    });
});
