import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
import { parseRenderedContent } from "./rendered";
import { FEATURE_VALUE_MAX, parseSectionContent } from "./section-contract";
import { resolveVariant } from "./variants";

/**
 * The block extensions the template polish adds: each is optional, so a
 * section written before it validates and draws as it did, and each new
 * field is bounded and refused past its bounds.
 */

describe("features: figures, two columns, a note and the facts row", () => {
    const items = [{ title: "Day rate", value: "Your rate", body: "Min. 2" }];

    it("saves a figure per point, two columns and a note", () => {
        const parsed = parseSectionContent("features", 1, {
            variant: "list",
            items,
            columns: 2,
            note: "Figures are yours to write.",
        });
        expect(parsed.success).toBe(true);
    });

    it("refuses a figure past its length, and three columns", () => {
        expect(
            parseSectionContent("features", 1, {
                items: [
                    { title: "x", value: "9".repeat(FEATURE_VALUE_MAX + 1) },
                ],
            }).success,
        ).toBe(false);
        expect(
            parseSectionContent("features", 1, { items, columns: 3 }).success,
        ).toBe(false);
    });

    it("keeps a section written before them valid", () => {
        expect(
            parseSectionContent("features", 1, {
                variant: "grid",
                items: [{ title: "x" }],
            }).success,
        ).toBe(true);
    });

    it("knows the facts look, and its fixture parses", () => {
        expect(resolveVariant("features", { variant: "facts" })).toBe("facts");
        expect(
            parseRenderedContent("features", BLOCK_META.features.fixtures.facts)
                .success,
        ).toBe(true);
    });
});
