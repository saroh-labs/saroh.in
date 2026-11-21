import { describe, expect, it } from "vitest";

import { siteKindsFromUnits } from "./use-publish";

describe("siteKindsFromUnits (editor audit F12)", () => {
    it("drops a setting undone back to its live value", () => {
        // Brand › Undo: the style saved back as it is live, so no unit.
        expect(
            siteKindsFromUnits(
                ["menu", "redirects", "style"],
                ["site:menu", "section:p1:k1"],
            ),
        ).toEqual(["menu", "redirects"]);
    });

    it("adds a setting the units say is waiting, and keeps pages and old links", () => {
        expect(siteKindsFromUnits(["pages"], ["site:style"])).toEqual([
            "pages",
            "style",
        ]);
    });

    it("leaves a site never published alone, and keeps the same list when nothing moved", () => {
        expect(siteKindsFromUnits(null, ["site:style"])).toBeNull();
        const same: ("menu" | "style")[] = ["menu"];
        expect(siteKindsFromUnits(same, ["site:menu"])).toBe(same);
    });
});
