import { describe, expect, it } from "vitest";

import { menusList } from "./site-chrome";

const list = { preview: true, live: [], takenOff: [] };

describe("menusList (the menus on a local preview)", () => {
    it("lists every built page when RESOURCES_PREVIEW is on", () => {
        const live = menusList(list, true).live;
        expect(live.some((p) => p.startsWith("/for/"))).toBe(true);
        expect(live.some((p) => p.startsWith("/tools/"))).toBe(true);
        expect(live.some((p) => p.startsWith("/guides/"))).toBe(true);
    });

    it("keeps the publish list otherwise, and never widens a real list", () => {
        expect(menusList(list, false)).toBe(list);
        const real = { preview: false, live: ["/for/salons"], takenOff: [] };
        expect(menusList(real, true)).toBe(real);
    });
});
