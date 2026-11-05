import { existsSync } from "node:fs";
import { join } from "node:path";

import hreflang from "@saroh/edition/hreflang";
import { describe, expect, it } from "vitest";

import { featureHref, featureList } from "@/content/features";
import { home } from "@/content/home";
import { GLOBAL_SHOTS } from "@/content/shots";
import { solutionHref, solutionList } from "@/content/solutions";

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

    it("keeps an unreviewed page out of search and the sitemap", () => {
        expect(pageMetadata({ ...PAGES[0], unreviewed: true }).robots).toEqual({
            index: false,
            follow: true,
        });
        expect(indexedPages().filter((p) => p.unreviewed)).toEqual([]);
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

    it("has a page for each feature and solution, unreviewed, with its trail", () => {
        const product = PAGES.filter(
            (p) => p.type === "feature" || p.type === "solution",
        );
        expect(product.map((p) => p.path)).toEqual([
            ...featureList.map((f) => featureHref(f.slug)),
            ...solutionList.map((s) => solutionHref(s.slug)),
        ]);
        for (const p of product) {
            expect(p.title.length, p.path).toBeLessThan(60);
            expect(p.description.length, p.path).toBeLessThan(155);
            expect(p.unreviewed, p.path).toBe(true);
            expect(
                pageSchema(p).some((ld) => ld["@type"] === "BreadcrumbList"),
                p.path,
            ).toBe(true);
            expect(
                hreflang.pairs.some((pair) => pair.tech === p.path),
                p.path,
            ).toBe(true);
        }
    });

    it("keeps the sitemap to its ten pages", () => {
        expect(indexedPages()).toHaveLength(10);
    });

    it("every tool card on Home lands on a built page", () => {
        const paths = new Set(PAGES.map((p) => p.path));
        for (const tool of home.tools) {
            expect(paths.has(tool.href), tool.href).toBe(true);
        }
    });

    it("every screenshot it may show has its files", () => {
        const pub = join(__dirname, "../public");
        for (const shot of Object.values(GLOBAL_SHOTS)) {
            for (const entry of shot.srcSet?.split(", ") ?? []) {
                const file = entry.split(" ")[0];
                expect(existsSync(join(pub, file)), file).toBe(true);
            }
        }
    });
});
