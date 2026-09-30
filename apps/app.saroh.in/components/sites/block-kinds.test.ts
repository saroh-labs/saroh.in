import { describe, expect, it } from "vitest";

import type { BoundSource } from "./block-kinds";
import { addBlockGroups, BOUND_BLOCKS, boundHref } from "./block-kinds";
import { SECTION_LABELS, SECTION_ORDER } from "./editor-constants";

describe("the Add block groups", () => {
    const every = Object.keys(SECTION_LABELS).sort();

    it("offers every block type the editor knows, once", () => {
        // A type missing from the order is a block nobody can add.
        expect([...SECTION_ORDER].sort()).toEqual(every);
        const { structure, business } = addBlockGroups(SECTION_ORDER);
        expect([...structure, ...business].sort()).toEqual(every);
    });

    it("puts a block under From your business exactly when it reads live data", () => {
        const { business } = addBlockGroups(SECTION_ORDER);
        expect(business).toEqual(
            SECTION_ORDER.filter((t) => BOUND_BLOCKS[t] !== null),
        );
        expect(business).toEqual([
            "booking",
            "servicesList",
            "visitUs",
            "journal",
            "plans",
            "packs",
            "productGrid",
        ]);
    });
});

describe("where a bound block's values are changed", () => {
    function bound(type: "journal" | "visitUs"): BoundSource {
        const source = BOUND_BLOCKS[type];
        if (!source) throw new Error(`${type} is not bound`);
        return source;
    }

    it("sends the Journal to the posts of the site being edited (G10)", () => {
        expect(boundHref(bound("journal"), "site_rye")).toBe(
            "/sites/site_rye/posts",
        );
        expect(bound("journal").notice).toContain("Website › Posts");
    });

    it("keeps a business-wide screen's link as it is", () => {
        expect(boundHref(bound("visitUs"), "site_rye")).toBe(
            "/commerce/locations",
        );
    });

    it("has no link for a site's own screen when the site is not known", () => {
        expect(boundHref(bound("journal"), undefined)).toBeNull();
    });
});
