import { describe, expect, it } from "vitest";

import { sharePostsOnFor } from "./share-posts-switch";

/** Share as a post's switch: off unless NEXT_PUBLIC_SHARE_POSTS says on. */
describe("sharePostsOnFor (NEXT_PUBLIC_SHARE_POSTS)", () => {
    it("is off when unset in a built app, as production", () => {
        expect(sharePostsOnFor(undefined, "production")).toBe(false);
        expect(sharePostsOnFor(undefined, "test")).toBe(false);
    });

    it("is on only when it says on", () => {
        expect(sharePostsOnFor("on", "production")).toBe(true);
        expect(sharePostsOnFor("off", "production")).toBe(false);
    });

    it("unset counts as on under next dev, and off still hides there", () => {
        expect(sharePostsOnFor(undefined, "development")).toBe(true);
        expect(sharePostsOnFor("off", "development")).toBe(false);
    });
});
