import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MomentKey } from "./keys";
import { homeNewFeature } from "./read";

const switches = { api: true, share: true };
let seen: Set<MomentKey> | null = new Set();
vi.mock("@/lib/settings/api-area-switch", () => ({
    apiAreaOn: () => switches.api,
}));
vi.mock("@/lib/share-item/share-posts-switch", () => ({
    sharePostsOn: () => switches.share,
}));
vi.mock("./service", () => ({ getSeenMoments: () => Promise.resolve(seen) }));

beforeEach(() => {
    switches.api = true;
    switches.share = true;
    // The menu card is everyone's first (DEC-262); these are about the rest.
    seen = new Set<MomentKey>(["new-menu"]);
});

describe("Home's New card, for this person", () => {
    it("tells everyone the menu has moved, first (DEC-262)", async () => {
        seen = new Set();
        expect((await homeNewFeature({ actions: [] }))?.key).toBe("new-menu");
    });

    it("shows AI apps to anyone once its switch is on, staff too", async () => {
        expect((await homeNewFeature({ actions: [] }))?.key).toBe(
            "new-ai-apps",
        );
    });

    it("offers Share only to someone who may make a post", async () => {
        switches.api = false;
        expect(await homeNewFeature({ actions: [] })).toBeNull();
        expect((await homeNewFeature({ actions: ["social:read"] }))?.key).toBe(
            "new-share",
        );
    });

    it("follows the switch: Share off, no Share card", async () => {
        switches.share = false;
        seen = new Set<MomentKey>(["new-menu", "new-ai-apps"]);
        expect(await homeNewFeature({ actions: ["social:read"] })).toBeNull();
    });

    it("never offers Ask AI until it has a switch", async () => {
        seen = new Set<MomentKey>(["new-menu", "new-ai-apps", "new-share"]);
        expect(await homeNewFeature({ actions: ["social:read"] })).toBeNull();
    });

    it("is gone for everyone once anyone in the business put it away", async () => {
        seen = new Set<MomentKey>(["new-menu", "new-ai-apps"]);
        expect((await homeNewFeature({ actions: ["social:read"] }))?.key).toBe(
            "new-share",
        );
    });
});
