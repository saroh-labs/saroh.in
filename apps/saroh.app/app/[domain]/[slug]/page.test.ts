import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Publication from "@/lib/publication";

import MissingPage from "../[...missing]/page";
import { generateMetadata as homeMetadata } from "../page";
import PostPage from "./[postSlug]/page";
import SitePage, { generateMetadata } from "./page";

/**
 * Old page links forward (KTD-3) and a page draws its own head (KTD-7).
 * The data layer is mocked; `findRedirect` and `pageHead` are the real ones.
 */

const site = vi.hoisted(() => {
    const state: { resolved: unknown } = { resolved: null };
    return state;
});

vi.mock("@/env", () => ({
    env: { API_URL: "https://api.test", NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app" },
}));
vi.mock("@/lib/publication", async (importOriginal) => ({
    ...(await importOriginal<typeof Publication>()),
    getSiteForHost: vi.fn(() => Promise.resolve(site.resolved)),
    getSiteForPage: vi.fn(() => Promise.resolve(site.resolved)),
    readPublishedPosts: vi.fn(() => Promise.resolve([])),
    getPublishedPost: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/test-metadata", () => ({
    shareable: vi.fn((_resolved: unknown, metadata: unknown) => metadata),
}));
vi.mock("@/lib/site-contact", () => ({ getSiteContact: vi.fn() }));
vi.mock("@/lib/post-moved", () => ({
    postMovedTo: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/components/published-page", () => ({ PublishedPage: vi.fn() }));
vi.mock("@/components/post-view", () => ({
    PostIndex: vi.fn(),
    PostArticle: vi.fn(),
    PostNeighbours: vi.fn(),
    postNeighbours: vi.fn(() => ({})),
}));
vi.mock("next/navigation", () => ({
    notFound: vi.fn(() => {
        throw new Error("NOT_FOUND");
    }),
    permanentRedirect: vi.fn((to: string) => {
        throw new Error(`308 ${to}`);
    }),
}));

function resolvedWith(snapshot: Record<string, unknown>) {
    return {
        snapshot: {
            site: {
                name: "Rye",
                slug: "rye",
                seoTitle: "Rye bakery",
                seoDescription: "Bread, daily.",
                socialImageUrl: "https://img.test/site.jpg",
            },
            pages: [
                { path: "/", title: null, isHome: true, sections: [] },
                {
                    path: "/bridal",
                    title: "Bridal",
                    isHome: false,
                    sections: [],
                },
            ],
            publishedAt: "2026-11-18T00:00:00.000Z",
            ...snapshot,
        },
        siteId: "site-1",
        modules: null,
        icon: null,
        mode: "live",
        release: null,
    };
}

const forwards = {
    redirects: [{ from: "/services/bridal-makeup-packages", to: "/bridal" }],
};
const params = <T>(value: T) => Promise.resolve(value);

beforeEach(() => {
    site.resolved = resolvedWith(forwards);
});

describe("an old page link (KTD-3)", () => {
    it("forwards with a 308, keeping the query", async () => {
        await expect(
            PostPage({
                params: params({
                    domain: "rye.saroh.app",
                    slug: "services",
                    postSlug: "bridal-makeup-packages",
                }),
                searchParams: params({ ref: "ig" }),
            }),
        ).rejects.toThrow("308 /bridal?ref=ig");
    });

    it("forwards from one segment and from deeper paths", async () => {
        site.resolved = resolvedWith({
            redirects: [
                { from: "/old", to: "/bridal" },
                { from: "/a/b/c", to: "/bridal" },
            ],
        });
        await expect(
            SitePage({
                params: params({ domain: "rye.saroh.app", slug: "old" }),
                searchParams: params({}),
            }),
        ).rejects.toThrow("308 /bridal");
        await expect(
            MissingPage({
                params: params({
                    domain: "rye.saroh.app",
                    missing: ["a", "b", "c"],
                }),
                searchParams: params({}),
            }),
        ).rejects.toThrow("308 /bridal");
    });

    it("is a 404 on a snapshot from before forwards", async () => {
        site.resolved = resolvedWith({});
        await expect(
            PostPage({
                params: params({
                    domain: "rye.saroh.app",
                    slug: "services",
                    postSlug: "bridal-makeup-packages",
                }),
                searchParams: params({}),
            }),
        ).rejects.toThrow("NOT_FOUND");
    });

    it("never forwards a post's own address", async () => {
        site.resolved = resolvedWith({
            redirects: [{ from: "/blog/first-loaf", to: "/bridal" }],
        });
        await expect(
            PostPage({
                params: params({
                    domain: "rye.saroh.app",
                    slug: "blog",
                    postSlug: "first-loaf",
                }),
                searchParams: params({}),
            }),
        ).rejects.toThrow("NOT_FOUND");
    });

    it("draws a live page at the same link rather than forwarding", async () => {
        site.resolved = resolvedWith({
            redirects: [{ from: "/bridal", to: "/" }],
        });
        await expect(
            SitePage({
                params: params({ domain: "rye.saroh.app", slug: "bridal" }),
                searchParams: params({}),
            }),
        ).resolves.toBeTruthy();
    });
});

describe("a page's own head (KTD-7)", () => {
    it("uses the site's when the page wrote none", async () => {
        const meta = await generateMetadata({
            params: params({ domain: "rye.saroh.app", slug: "bridal" }),
        });
        expect(meta?.title).toBe("Bridal · Rye");
        expect(meta?.description).toBe("Bread, daily.");
        expect(meta?.openGraph?.images).toEqual(["https://img.test/site.jpg"]);
        expect(meta?.robots).toBeUndefined();
    });

    it("uses the page's title, text, picture and noindex", async () => {
        site.resolved = resolvedWith({
            pages: [
                {
                    path: "/bridal",
                    title: "Bridal",
                    isHome: false,
                    sections: [],
                    seoTitle: "Bridal makeup in Pune",
                    seoDescription: "Trials and the day.",
                    shareImageUrl: "https://img.test/bridal.jpg",
                    noindex: true,
                },
            ],
        });
        const meta = await generateMetadata({
            params: params({ domain: "rye.saroh.app", slug: "bridal" }),
        });
        expect(meta?.title).toBe("Bridal makeup in Pune");
        expect(meta?.openGraph?.title).toBe("Bridal makeup in Pune");
        expect(meta?.description).toBe("Trials and the day.");
        expect(meta?.openGraph?.images).toEqual([
            "https://img.test/bridal.jpg",
        ]);
        expect(meta?.robots).toEqual({ index: false, follow: true });
    });

    it("leaves the home page to the layout unless it wrote its own", async () => {
        expect(
            (
                await homeMetadata({
                    params: params({ domain: "rye.saroh.app" }),
                })
            ).title,
        ).toBeUndefined();
        site.resolved = resolvedWith({
            pages: [
                {
                    path: "/",
                    title: null,
                    isHome: true,
                    sections: [],
                    seoTitle: "Rye, the bakery on MG Road",
                },
            ],
        });
        const meta = await homeMetadata({
            params: params({ domain: "rye.saroh.app" }),
        });
        expect(meta.title).toBe("Rye, the bakery on MG Road");
        expect(meta.description).toBe("Bread, daily.");
        expect(meta.openGraph?.url).toBe("/");
    });
});
