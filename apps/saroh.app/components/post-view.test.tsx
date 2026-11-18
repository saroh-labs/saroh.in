import { describe, expect, it } from "vitest";

import { renderToStaticMarkup } from "react-dom/server";

import { PostNeighbours, postNeighbours } from "./post-view";

/** Older and Newer under a post (U8). The list is newest first. */
const POSTS = [
    { slug: "c", title: "Third" },
    { slug: "b", title: "Second" },
    { slug: "a", title: "First" },
];

describe("postNeighbours", () => {
    it("finds the newer and the older post", () => {
        expect(postNeighbours(POSTS, "b")).toEqual({
            newer: POSTS[0],
            older: POSTS[2],
        });
        expect(postNeighbours(POSTS, "c").newer).toBeNull();
        expect(postNeighbours(POSTS, "a").older).toBeNull();
        expect(postNeighbours(POSTS, "gone")).toEqual({
            newer: null,
            older: null,
        });
    });
});

describe("PostNeighbours", () => {
    it("links both ways, 44px, under the posts' prefix", () => {
        const html = renderToStaticMarkup(
            <PostNeighbours
                {...postNeighbours(POSTS, "b")}
                basePath="/journal"
            />,
        );
        expect(html).toContain('href="/journal/c"');
        expect(html).toContain('href="/journal/a"');
        expect(html).toContain("Newer");
        expect(html).toContain("Older");
        expect(html).toContain("min-h-11");
    });

    it("draws nothing for an only post", () => {
        expect(
            renderToStaticMarkup(
                <PostNeighbours newer={null} older={null} basePath="/j" />,
            ),
        ).toBe("");
    });
});
