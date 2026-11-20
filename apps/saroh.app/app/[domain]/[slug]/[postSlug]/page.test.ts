import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePostEmbeds } from "@/lib/post-embeds";
import { postMovedTo } from "@/lib/post-moved";
import type * as Publication from "@/lib/publication";
import { getPublishedPost } from "@/lib/publication";

import PostPage, { generateMetadata } from "./page";

/**
 * A post's old links forward (U17a) and it draws its own head: Google
 * title and text, share image, each falling back as before. The data
 * layer is mocked; `withQuery` is the real one.
 */

vi.mock("@/env", () => ({
    env: { API_URL: "https://api.test", NEXT_PUBLIC_ROOT_DOMAIN: "saroh.app" },
}));
vi.mock("@/lib/publication", async (importOriginal) => ({
    ...(await importOriginal<typeof Publication>()),
    getSiteForHost: vi.fn(() => Promise.resolve(resolved)),
    getSiteForPage: vi.fn(() => Promise.resolve(resolved)),
    readPublishedPosts: vi.fn(() => Promise.resolve([])),
    getPublishedPost: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/post-moved", () => ({ postMovedTo: vi.fn() }));
vi.mock("@/lib/post-embeds", () => ({
    resolvePostEmbeds: vi.fn((html: string) =>
        Promise.resolve(html.replace("<div data-embed", "<div data-post-card")),
    ),
}));
vi.mock("@/lib/test-metadata", () => ({
    shareable: vi.fn((_resolved: unknown, metadata: unknown) => metadata),
}));
vi.mock("@/components/post-view", () => ({
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

const resolved = {
    snapshot: {
        site: {
            name: "Rye",
            slug: "rye",
            socialImageUrl: "https://img.test/site.jpg",
        },
        pages: [{ path: "/", title: null, isHome: true, sections: [] }],
        publishedAt: "2026-11-18T00:00:00.000Z",
    },
    siteId: "site-1",
    modules: null,
    icon: null,
    mode: "live",
    release: null,
};

const post = {
    title: "Bridal trial",
    slug: "bridal-trial",
    excerpt: "What a trial covers.",
    content: "<p>Hi</p>",
    image: "https://img.test/cover.jpg",
    publishedAt: "2026-11-18T00:00:00.000Z",
};

const params = <T>(value: T) => Promise.resolve(value);
const at = (postSlug: string, query: Record<string, string> = {}) =>
    PostPage({
        params: params({ domain: "rye.saroh.app", slug: "blog", postSlug }),
        searchParams: params(query),
    });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPublishedPost).mockResolvedValue(null);
    vi.mocked(postMovedTo).mockResolvedValue(null);
});

describe("old post links (U17a)", () => {
    it("308s an old link to the post's live link, keeping the query", async () => {
        vi.mocked(postMovedTo).mockResolvedValue("bridal-trial");
        await expect(at("bridal-makeup-trial", { ref: "ig" })).rejects.toThrow(
            "308 /blog/bridal-trial?ref=ig",
        );
        expect(postMovedTo).toHaveBeenCalledWith(
            "site-1",
            "bridal-makeup-trial",
        );
    });

    it("is a 404 when no post was ever live there", async () => {
        await expect(at("never-was")).rejects.toThrow("NOT_FOUND");
    });

    it("serves a live post at the link without asking where it moved", async () => {
        vi.mocked(getPublishedPost).mockResolvedValue(post);
        await at("bridal-trial");
        expect(postMovedTo).not.toHaveBeenCalled();
    });
});

describe("a post's cards from the business (U15b)", () => {
    it("hands the article the body with its cards read now", async () => {
        vi.mocked(getPublishedPost).mockResolvedValue({
            ...post,
            content: '<p>Hi</p><div data-embed="service" data-id="s1"></div>',
        });
        const page = (await at("bridal-trial")) as {
            props: { children: { props: { post: { content: string } } }[] };
        };
        expect(page.props.children[0].props.post.content).toBe(
            '<p>Hi</p><div data-post-card="service" data-id="s1"></div>',
        );
        expect(resolvePostEmbeds).toHaveBeenCalledWith(
            '<p>Hi</p><div data-embed="service" data-id="s1"></div>',
            "site-1",
        );
    });
});

describe("a post's own head (U17a)", () => {
    const head = () =>
        generateMetadata({
            params: params({
                domain: "rye.saroh.app",
                slug: "blog",
                postSlug: "bridal-trial",
            }),
        });

    it("uses its own Google title, text and share image", async () => {
        vi.mocked(getPublishedPost).mockResolvedValue({
            ...post,
            seoTitle: "Bridal makeup trial in Jaipur",
            seoDescription: "Book a trial before the day.",
            shareImageUrl: "https://img.test/share.jpg",
        });
        const meta = await head();
        expect(meta?.title).toContain("Bridal makeup trial in Jaipur");
        expect(meta?.description).toBe("Book a trial before the day.");
        expect(meta?.openGraph?.images).toEqual(["https://img.test/share.jpg"]);
    });

    it("falls back to the title, short description and cover", async () => {
        vi.mocked(getPublishedPost).mockResolvedValue({
            ...post,
            seoTitle: "  ",
            seoDescription: null,
        });
        const meta = await head();
        expect(meta?.title).toContain("Bridal trial");
        expect(meta?.description).toBe("What a trial covers.");
        expect(meta?.openGraph?.images).toEqual(["https://img.test/cover.jpg"]);
    });
});
