import { describe, expect, it } from "vitest";

import type { PostLiveCopy } from "@/lib/content/service";

import type { PostDraftView } from "./post-diff";
import { postChanges, postStatusLabel } from "./post-diff";

const live: PostLiveCopy = {
    title: "Bridal makeup trial",
    slug: "bridal-makeup-trial",
    excerpt: "What to expect.",
    content: "<p>A trial.</p>",
    image: "https://example.com/a.jpg",
    imageAlt: null,
    seoTitle: null,
    seoDescription: null,
    shareImageUrl: null,
    category: "Bridal",
    path: "/blog/bridal-makeup-trial",
    publishedAt: "2026-11-12T03:30:00.000Z",
};

const draft: PostDraftView = {
    title: "Bridal makeup trial",
    content: "<p>A trial.</p>",
    excerpt: "What to expect.",
    image: "https://example.com/a.jpg",
    imageAlt: "",
    slug: "bridal-makeup-trial",
    category: "Bridal",
    seoTitle: "",
    seoDescription: "",
};

describe("postChanges", () => {
    it("finds nothing when the draft is the live copy", () => {
        expect(postChanges(draft, live)).toEqual([]);
    });

    it("counts each changed part once", () => {
        expect(
            postChanges(
                {
                    ...draft,
                    title: "Bridal trial",
                    slug: "bridal-trial",
                    imageAlt: "A bride at the mirror",
                },
                live,
            ),
        ).toEqual(["title", "coverDescription", "pageLink"]);
    });

    it("isn't waiting on anything for a post that isn't live", () => {
        expect(postChanges({ ...draft, title: "New" }, null)).toEqual([]);
    });

    it("an emptied link follows the title, so isn't a change yet", () => {
        expect(postChanges({ ...draft, slug: "" }, live)).toEqual([]);
    });
});

describe("postStatusLabel", () => {
    it("says the one status form (RULES §2)", () => {
        expect(
            postStatusLabel({ live: false, waiting: 0, scheduledFor: null }),
        ).toBe("Not live yet");
        expect(
            postStatusLabel({ live: true, waiting: 0, scheduledFor: null }),
        ).toBe("Live");
        expect(
            postStatusLabel({ live: true, waiting: 1, scheduledFor: null }),
        ).toBe("Live · 1 change waiting");
        expect(
            postStatusLabel({ live: true, waiting: 3, scheduledFor: null }),
        ).toBe("Live · 3 changes waiting");
        expect(
            postStatusLabel({
                live: false,
                waiting: 0,
                scheduledFor: "Fri 21 Nov, 9 am",
            }),
        ).toBe("Scheduled for Fri 21 Nov, 9 am");
    });
});
