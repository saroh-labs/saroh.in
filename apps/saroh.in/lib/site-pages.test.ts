import { describe, expect, it, vi } from "vitest";

import {
    CHANGELOG_ENTRIES,
    UPDATED as CHANGELOG_UPDATED,
    changelogHref,
} from "@/content/changelog";
import { UPDATED as FEATURES_UPDATED } from "@/content/features";
import { helpHref } from "@/content/help";
import { UPDATED as HOME_UPDATED } from "@/content/home";
import type { PublishContext } from "@/content/resources";
import { LEGAL_PAGES } from "@/content/resources";
import { helpArticles } from "@/lib/help-docs";

/** A build stamped on a day no content carries, so a leak of it shows. */
const BUILT_AT = vi.hoisted(() => "2026-10-20T09:30:00.000Z");
vi.mock("@/env", () => ({ env: { SAROH_BUILT_AT: BUILT_AT } }));

/** Everything that could be listed: every page published, every route built. */
const EVERYTHING: PublishContext = {
    now: new Date(),
    preview: true,
    routes: null,
};

/** What a production build lists: published pages only. */
const PUBLISHED: PublishContext = { ...EVERYTHING, preview: false };

/** Today's day in India (YYYY-MM-DD). */
const todayInIndia = () =>
    new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * The sitemap (12 Oct 2026): a page says when it last changed only where
 * its content holds a date, and never guesses a frequency or a priority.
 */
describe("lastModified", () => {
    it("dates the changelog and Help hubs by their newest live entry", async () => {
        const { lastModified } = await import("./site-pages");
        const far = new Date("2099-01-01T00:00:00Z");
        const newest = (days: string[]) => [...days].sort().at(-1);
        expect(lastModified("/changelog", null, far)).toBe(
            `${newest([CHANGELOG_UPDATED, ...CHANGELOG_ENTRIES.map((e) => e.publishOn)])}T00:00:00+05:30`,
        );
        expect(
            (lastModified("/help", null, far) ?? "").slice(0, 10) >=
                (newest(helpArticles().map((a) => a.updated)) ?? ""),
        ).toBe(true);
    });

    it("leaves an entry that isn't live yet out of the changelog hub's date", async () => {
        const { lastModified } = await import("./site-pages");
        // Before any entry is live, the hub is dated by its own words.
        expect(lastModified("/changelog", null, new Date(0))).toBe(
            `${CHANGELOG_UPDATED}T00:00:00+05:30`,
        );
    });

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

    it("is a content module's UPDATED for the marketing and hub pages", async () => {
        const { lastModified } = await import("./site-pages");
        expect(lastModified("/")).toBe(`${HOME_UPDATED}T00:00:00+05:30`);
        expect(lastModified("/features/website")).toBe(
            `${FEATURES_UPDATED}T00:00:00+05:30`,
        );
    });

    it("dates every listed page (R3), but /pricing and /pricing.md only with a live catalogue", async () => {
        const { indexedPaths, lastModified } = await import("./site-pages");
        const paths = [
            ...indexedPaths("open", EVERYTHING),
            ...indexedPaths("waitlist", EVERYTHING),
        ];
        expect(paths).toContain("/pricing");
        expect(paths).toContain("/pricing.md");
        expect(paths).toContain("/llms.txt");
        for (const path of paths) {
            if (path === "/pricing" || path === "/pricing.md") continue;
            expect(lastModified(path), path).toMatch(
                /^\d{4}-\d{2}-\d{2}T00:00:00\+05:30$/,
            );
        }
        expect(lastModified("/pricing")).toBeUndefined();
        expect(lastModified("/pricing", null)).toBeUndefined();
        expect(lastModified("/pricing.md")).toBeUndefined();
    });

    it("lists /pricing.md only once the launch switch is open, and /llms.txt always", async () => {
        const { indexedPaths } = await import("./site-pages");
        expect(indexedPaths("waitlist", EVERYTHING)).not.toContain(
            "/pricing.md",
        );
        expect(indexedPaths("waitlist", EVERYTHING)).toContain("/llms.txt");
        expect(indexedPaths("open")).toContain("/llms.txt");
    });

    it("dates /pricing.md as /pricing, and /llms.txt by the newest page it links", async () => {
        const { lastModified } = await import("./site-pages");
        const live = "2026-10-16T20:00:00.000Z";
        expect(lastModified("/pricing.md", live)).toBe(
            lastModified("/pricing", live),
        );
        const llms = lastModified("/llms.txt");
        expect(llms).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+05:30$/);
        // Never older than a page it links.
        for (const path of ["/about", "/contact", "/features/website"]) {
            expect((lastModified(path) ?? "") <= (llms ?? ""), path).toBe(true);
        }
    });

    it("dates /pricing by the live version's goLiveAt, as a day in India", async () => {
        const { lastModified } = await import("./site-pages");
        // 20:00 UTC on the 16th is 01:30 on the 17th in India.
        expect(lastModified("/pricing", "2026-10-16T20:00:00.000Z")).toBe(
            "2026-10-17T00:00:00+05:30",
        );
        expect(lastModified("/pricing", "2026-10-16T10:00:00.000Z")).toBe(
            "2026-10-16T00:00:00+05:30",
        );
    });

    it("is never the build's, and never a day still to come", async () => {
        const { indexedPaths, lastModified } = await import("./site-pages");
        const today = todayInIndia();
        const builtDay = `${BUILT_AT.slice(0, 10)}T00:00:00+05:30`;
        for (const path of indexedPaths("open", PUBLISHED)) {
            const day = lastModified(path);
            if (day === undefined) continue;
            expect(day, path).not.toBe(BUILT_AT);
            expect(day, path).not.toBe(builtDay);
            expect(day.slice(0, 10) <= today, `${path} ${day}`).toBe(true);
        }
    });
});

describe("sitemap.xml", () => {
    it("lists the two new pages, on www, with no changefreq or priority", async () => {
        const { default: sitemap } = await import("@/app/sitemap");
        const entries = await sitemap();
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
        const entries = await sitemap();
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
