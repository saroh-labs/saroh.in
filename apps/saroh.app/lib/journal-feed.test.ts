import { describe, expect, it, vi } from "vitest";

import { hasJournal, journalFeed } from "./journal-feed";

const POST = {
    title: "Diwali hampers are back",
    slug: "diwali-hampers",
    publishedAt: "2026-09-20T09:00:00.000Z",
};

describe("the Journal's posts on a served page (G10)", () => {
    it("reads nothing for a page without a Journal", async () => {
        const read = vi.fn(() => Promise.resolve([POST]));
        const feed = await journalFeed(
            [{ type: "hero" }, { type: "visitUs" }],
            "/blog",
            read,
        );
        expect(feed).toBeUndefined();
        expect(read).not.toHaveBeenCalled();
    });

    it("reads once for a page with one, linked under the prefix given", async () => {
        const read = vi.fn(() => Promise.resolve([POST]));
        const feed = await journalFeed(
            [{ type: "hero" }, { type: "journal" }, { type: "journal" }],
            "/preview/tok/news",
            read,
        );
        expect(read).toHaveBeenCalledTimes(1);
        expect(feed).toEqual({ posts: [POST], basePath: "/preview/tok/news" });
    });

    it("hands in an empty list when no post is live, so the block draws nothing", async () => {
        const feed = await journalFeed([{ type: "journal" }], "/blog", () =>
            Promise.resolve([]),
        );
        expect(feed).toEqual({ posts: [], basePath: "/blog" });
    });

    it("knows a Journal when it sees one", () => {
        expect(hasJournal([])).toBe(false);
        expect(hasJournal([{ type: "journal" }])).toBe(true);
    });
});
