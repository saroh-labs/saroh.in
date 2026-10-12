import { describe, expect, it, vi } from "vitest";

import { CHANGELOG_ENTRIES, changelogHref } from "@/content/changelog";
import { helpHref } from "@/content/help";
import { LEGAL_PAGES } from "@/content/resources";
import { helpArticles } from "@/lib/help-docs";

vi.mock("@/env", () => ({ env: {} }));

/**
 * The sitemap (12 Oct 2026): a page says when it last changed only where
 * its content holds a date, and never guesses a frequency or a priority.
 */
describe("lastModified", () => {
    it("is a legal page's own date, at midnight in India", async () => {
        const { lastModified } = await import("./site-pages");
        for (const page of LEGAL_PAGES) {
            expect(lastModified(page.href)).toBe(
                `${page.publishOn}T00:00:00+05:30`,
            );
        }
    });

    it("is a Help article's Updated day and a changelog entry's day", async () => {
        const { lastModified } = await import("./site-pages");
        const articles = helpArticles();
        expect(articles.length).toBeGreaterThan(0);
        for (const a of articles) {
            expect(lastModified(helpHref(a.slug))).toBe(
                `${a.updated}T00:00:00+05:30`,
            );
        }
        for (const e of CHANGELOG_ENTRIES) {
            expect(lastModified(changelogHref(e.slug))).toBe(
                `${e.publishOn}T00:00:00+05:30`,
            );
        }
    });

    it("is nothing for a page with no date of its own: never the build's", async () => {
        const { lastModified } = await import("./site-pages");
        for (const path of [
            "/",
            "/features/website",
            "/solutions/salons",
            "/about",
            "/contact",
            "/waitlist",
            "/help",
            "/changelog",
            "/integrations",
        ]) {
            expect(lastModified(path), path).toBeUndefined();
        }
    });
});

describe("sitemap.xml", () => {
    it("lists the two new pages, on www, with no changefreq or priority", async () => {
        const { default: sitemap } = await import("@/app/sitemap");
        const entries = sitemap();
        const urls = entries.map((e) => e.url);
        expect(urls).toContain("https://www.saroh.in/features/website");
        expect(urls).toContain("https://www.saroh.in/solutions/salons");
        expect(new Set(urls).size).toBe(urls.length);
        for (const entry of entries) {
            expect(entry.url.startsWith("https://www.saroh.in/")).toBe(true);
            expect("changeFrequency" in entry, entry.url).toBe(false);
            expect("priority" in entry, entry.url).toBe(false);
        }
    });

    it("dates the pages that have a date, and only those", async () => {
        const { default: sitemap } = await import("@/app/sitemap");
        const { lastModified } = await import("./site-pages");
        const entries = sitemap();
        const dated = entries.filter((e) => e.lastModified !== undefined);
        expect(dated.length).toBeGreaterThan(0);
        for (const entry of entries) {
            const path = new URL(entry.url).pathname;
            expect(entry.lastModified, path).toBe(lastModified(path));
        }
    });
});

describe("robots.txt", () => {
    it("has no Host line, names the sitemap, and leaves /welcome readable", async () => {
        const { default: robots } = await import("@/app/robots");
        const file = robots();
        expect("host" in file).toBe(false);
        expect(file.sitemap).toBe("https://www.saroh.in/sitemap.xml");
        const rules = Array.isArray(file.rules) ? file.rules[0] : file.rules;
        expect(rules.disallow).toEqual([
            "/api/",
            "/pricing/draft",
            "/pricing/preview",
        ]);
    });
});
