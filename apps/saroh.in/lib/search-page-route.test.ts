import type { DocPage } from "@saroh/search-pages/docs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { docPages } from "./docs-pages";
import {
    docRelated,
    liveDocPages,
    newestUpdated,
    searchPageRoute,
} from "./search-page-route";

const env = vi.hoisted((): Record<string, string | undefined> => ({}));
vi.mock("@/env", () => ({ env }));

const live = (paths: string[]) => {
    env.SAROH_SEARCH_PAGES = JSON.stringify({
        preview: true,
        live: paths,
        takenOff: [],
    });
};
beforeEach(() => live([]));

const slug = (s: string) => ({ params: Promise.resolve({ slug: s }) });

const gst = docPages.list("gst")[0];
const guide = docPages.list("guides")[0];
const download = docPages.list("downloads")[0];

const types = (ld: Record<string, unknown>[]) => ld.map((o) => o["@type"]);

describe("searchPageRoute (plan 2026-10-31-002, U5)", () => {
    it("builds every page this build carries, and no other", () => {
        expect(searchPageRoute("gst").generateStaticParams()).toEqual(
            docPages.list("gst").map((p) => ({ slug: p.slug })),
        );
        expect(searchPageRoute("gst").page("not-a-page")).toBeNull();
    });

    it("refuses a kind that isn't on the list", () => {
        expect(() => searchPageRoute("blog" as never)).toThrow(
            /no search-page kind/,
        );
    });

    it("titles and canonicalises a page, noindex while it isn't live", async () => {
        const route = searchPageRoute("gst");
        const draft = await route.generateMetadata(slug(gst.slug));
        expect(draft.title).toBe(`${gst.title} · Saroh`);
        expect(draft.description).toBe(gst.description);
        expect(draft.alternates?.canonical).toBe(gst.path);
        expect(draft.robots).toEqual({ index: false, follow: false });
        expect(route.draft(gst)).toBe(true);

        live([gst.path]);
        const shown = await route.generateMetadata(slug(gst.slug));
        expect(shown.robots).toBeUndefined();
        expect(route.draft(gst)).toBe(false);
        expect(await route.generateMetadata(slug("nope"))).toEqual({});
    });

    it("GST: BreadcrumbList from Home, FAQPage from its questions, Article", () => {
        const ld = searchPageRoute("gst").jsonLd(gst);
        expect(types(ld)).toEqual(["BreadcrumbList", "FAQPage", "Article"]);
        const crumbs = ld[0].itemListElement as {
            name: string;
            item: string;
        }[];
        expect(crumbs.map((c) => c.name)).toEqual([
            "Home",
            "GST guides",
            gst.name,
        ]);
        expect(crumbs[0].item).toBe("https://www.saroh.in/");
        expect(crumbs[2].item).toBe(`https://www.saroh.in${gst.path}`);
        const faq = ld[1].mainEntity as { name: string }[];
        expect(faq.map((q) => q.name)).toEqual(
            gst.questions.map((q) => q.question),
        );
        // No published date on a GST page: none made up.
        expect(ld[2]).not.toHaveProperty("datePublished");
        expect(ld[2].dateModified).toBe(`${gst.updated}T00:00:00+05:30`);
        expect(ld[2].author).toEqual({
            "@type": "Person",
            name: gst.author.name,
            jobTitle: gst.author.role,
        });
    });

    it("guide: Article with author, published and updated", () => {
        const ld = searchPageRoute("guides").jsonLd(guide);
        const article = ld.find((o) => o["@type"] === "Article");
        expect(article).toMatchObject({
            headline: guide.h1,
            author: { name: guide.author.name },
            datePublished: `${guide.published}T00:00:00+05:30`,
            dateModified: `${guide.updated}T00:00:00+05:30`,
        });
        expect(types(ld)[0]).toBe("BreadcrumbList");
        expect(types(ld).includes("FAQPage")).toBe(guide.questions.length > 0);
    });

    it("download: no Article", () => {
        expect(
            searchPageRoute("downloads").jsonLd(download),
        ).not.toContainEqual(expect.objectContaining({ "@type": "Article" }));
    });

    it("names the page for its start buttons and its share card", () => {
        const route = searchPageRoute("gst");
        expect(route.ctaSrc(gst)).toBe(`gst-${gst.slug}`);
        expect(route.shareCard(gst.slug)).toEqual({
            eyebrow: "GST guides",
            title: gst.h1,
            alt: `GST guides: ${gst.h1}`,
        });
        expect(route.shareCard("nope")).toBeNull();
    });
});

describe("live pages", () => {
    it("are the built pages on the publish list, and date their hub", () => {
        expect(liveDocPages("gst")).toEqual([]);
        expect(newestUpdated("gst")).toBeUndefined();
        live([gst.path]);
        expect(liveDocPages("gst")).toEqual([gst]);
        expect(newestUpdated("gst")).toBe(gst.updated);
    });
});

describe("docRelated", () => {
    const page = (s: string, search: string, related: string[] = []) =>
        ({ ...gst, slug: s, search, related }) as DocPage;
    const me = page("me", "gst on salons", ["d", "b"]);
    const pool = [
        me,
        page("a", "gst on gyms"),
        page("b", "gst on cafes"),
        page("same", " GST on Salons "),
        page("c", "gst on clinics"),
        page("d", "gst on shops"),
    ];

    it("puts the page's pins first, then the rest, at most 3", () => {
        expect(docRelated(me, pool).map((p) => p.slug)).toEqual([
            "d",
            "b",
            "a",
        ]);
    });

    it("never the page itself or one with the same search", () => {
        const got = docRelated(me, pool, 10).map((p) => p.slug);
        expect(got).not.toContain("me");
        expect(got).not.toContain("same");
        expect(got).toHaveLength(4);
    });

    it("gives what exists when there are fewer, and skips a pin not built", () => {
        expect(
            docRelated(page("me", "x", ["gone"]), [page("a", "y")]).map(
                (p) => p.slug,
            ),
        ).toEqual(["a"]);
        expect(docRelated(me, [me])).toEqual([]);
    });
});
