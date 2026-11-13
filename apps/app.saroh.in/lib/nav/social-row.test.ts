import { beforeEach, describe, expect, it, vi } from "vitest";

const switchState = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/share-item/share-posts-switch", () => ({
    sharePostsOn: () => switchState.on,
}));

import { navFor, SOCIAL_HREF } from "@/components/shared/navigation/nav-items";

/** Every top-level href offered. */
const offered = (args: Parameters<typeof navFor>[0]) =>
    navFor(args).flatMap((g) => g.items.map((i) => i.href));

/**
 * Grow › Social (Create post, #1378, DEC-217): offered to whoever holds
 * `social:read`, with the website on, and only while Share is switched on.
 */
describe("the Social row", () => {
    beforeEach(() => {
        switchState.on = true;
    });

    it("is offered to an owner, with Website on", () => {
        expect(offered({ role: "OWNER", moduleKeys: ["WEBSITE"] })).toContain(
            SOCIAL_HREF,
        );
    });

    it("follows social:read, not the role's name", () => {
        expect(
            offered({
                role: "MEMBER",
                actions: ["site:read"],
                moduleKeys: ["WEBSITE"],
            }),
        ).not.toContain(SOCIAL_HREF);
        expect(
            offered({
                role: "MEMBER",
                actions: ["social:read"],
                moduleKeys: ["WEBSITE"],
            }),
        ).toContain(SOCIAL_HREF);
    });

    it("is gone while Share is switched off", () => {
        switchState.on = false;
        expect(
            offered({ role: "OWNER", moduleKeys: ["WEBSITE", "INSIGHTS"] }),
        ).not.toContain(SOCIAL_HREF);
    });
});
