import hreflang from "@saroh/edition/hreflang";
import { describe, expect, it } from "vitest";

import { pageSchema } from "./schema";
import { canonicalOf, pageMetadata } from "./seo";
import { indexedPages, PAGES } from "./site-map";

describe("the site map", () => {
    it("has one page per address, lowercase, hyphens, no trailing slash", () => {
        const paths = PAGES.map((p) => p.path);
        expect(new Set(paths).size).toBe(paths.length);
        for (const p of paths) {
            expect(p).toMatch(/^\/$|^(\/[a-z0-9-]+)+$/);
        }
    });

    it("gives every page words within the specs' limits", () => {
        for (const p of PAGES) {
            expect(p.title.length, p.path).toBeLessThanOrEqual(66);
            expect(p.description.length, p.path).toBeLessThanOrEqual(155);
            expect(p.h1.length, p.path).toBeGreaterThan(0);
        }
    });

    it("keeps an unbuilt page out of search and the sitemap", () => {
        const stub = PAGES.find((p) => p.stub);
        if (!stub) throw new Error("no stub left: drop this test");
        expect(pageMetadata(stub).robots).toEqual({
            index: false,
            follow: true,
        });
        expect(indexedPages()).not.toContain(stub);
    });

    it("canonicals name no trailing slash", () => {
        expect(canonicalOf("/")).toBe("https://saroh.tech");
        expect(canonicalOf("/pricing")).toBe("https://saroh.tech/pricing");
    });

    it("every hreflang pair is a page on the site", () => {
        const paths = new Set(PAGES.map((p) => p.path));
        for (const pair of hreflang.pairs) {
            expect(paths.has(pair.tech), pair.tech).toBe(true);
        }
    });

    it("every page has valid structured data", () => {
        for (const p of PAGES) {
            for (const ld of pageSchema(p)) {
                expect(ld["@context"], p.path).toBe("https://schema.org");
                expect(ld["@type"], p.path).toBeTruthy();
            }
        }
    });
});
