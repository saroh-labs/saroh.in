import { describe, expect, it } from "vitest";

import type { ChangeUnit } from "@/lib/sites/service";

import { changedOnPage, nextChange } from "./use-editor-review";

const unit = (
    key: string,
    pageId: string | null,
    change: ChangeUnit["change"] = "changed",
): ChangeUnit =>
    ({
        key,
        kind: key.split(":")[0],
        change,
        pageId,
    }) as ChangeUnit;

/** A Reviewer's view of what waits (`fix/WXMReviewer`). */
describe("a reader's changes", () => {
    const units = [
        unit("section:home:a", "home"),
        unit("site:menu", null),
        unit("section:home:b", "home", "removed"),
        unit("section:about:c", "about", "added"),
    ];

    it("marks this page's sections, not what was taken out", () => {
        expect(Array.from(changedOnPage(units, "home"))).toEqual([
            ["a", "changed"],
        ]);
        expect(Array.from(changedOnPage(units, "about"))).toEqual([
            ["c", "added"],
        ]);
        expect(changedOnPage(null, "home").size).toBe(0);
    });

    it("Next change goes on from the selected section, round to the first", () => {
        expect(
            nextChange(units, { pageId: "home", sectionKey: null })?.key,
        ).toBe("section:home:a");
        expect(
            nextChange(units, { pageId: "home", sectionKey: "a" })?.key,
        ).toBe("section:about:c");
        expect(
            nextChange(units, { pageId: "about", sectionKey: "c" })?.key,
        ).toBe("section:home:a");
        expect(
            nextChange([unit("site:menu", null)], {
                pageId: "home",
                sectionKey: null,
            }),
        ).toBeNull();
    });
});
