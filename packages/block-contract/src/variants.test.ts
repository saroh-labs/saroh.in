import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
import { parseSectionContent, SECTION_TYPES } from "./section-contract";
import { defaultVariant, isKnownVariant, resolveVariant } from "./variants";

/**
 * #254 — a variant always resolves to something drawable, and content written
 * before variants existed keeps the look it already had.
 *
 * The two legacy cases are the ones with teeth. Both would silently restyle
 * pages nobody edited, and both are invisible without a test saying so.
 */
describe("variant resolution", () => {
    it.each([...SECTION_TYPES])("%s declares a default that exists", (type) => {
        expect(isKnownVariant(type, defaultVariant(type))).toBe(true);
    });

    it("uses a named variant when the build knows it", () => {
        expect(resolveVariant("hero", { variant: "split" })).toBe("split");
    });

    /*
     * Never `null`. A merchant's live hero blanking because a later deployment
     * added a look they do not use is worse than the same hero in a different
     * arrangement.
     */
    it("falls back to the default for a variant from a newer contract", () => {
        expect(resolveVariant("hero", { variant: "parallaxWhatever" })).toBe(
            defaultVariant("hero"),
        );
    });

    /*
     * `centered` is hero's FIRST declared variant, so resolving absent content
     * to the default would flip every published hero carrying an image from
     * two-column to centred — a visible change to live pages, which is what
     * gate G5 exists to prevent.
     */
    it("resolves a variant-less hero from its image, not to the default", () => {
        expect(resolveVariant("hero", { heading: "x" })).toBe("centered");
        expect(
            resolveVariant("hero", {
                heading: "x",
                image: { src: "http://e/i.png" },
            }),
        ).toBe("split");
        expect(defaultVariant("hero")).toBe("centered");
    });

    /*
     * A gallery@1 section carries `layout` and no `variant`. Those ARE the v2
     * variant ids, which is why v2 folded one into the other.
     */
    it("resolves a gallery@1 section from its old `layout` field", () => {
        expect(resolveVariant("gallery", { layout: "carousel" })).toBe(
            "carousel",
        );
        expect(resolveVariant("gallery", { layout: "masonry" })).toBe(
            "masonry",
        );
        expect(resolveVariant("gallery", {})).toBe("grid");
    });

    it("ignores a layout value this build does not recognise", () => {
        expect(resolveVariant("gallery", { layout: "mosaic" })).toBe("grid");
    });
});

describe("variant requirements", () => {
    const heroSplit = {
        variant: "split",
        heading: "Fresh bread",
    };

    it("rejects a split hero with no image", () => {
        const result = parseSectionContent("hero", 2, heroSplit);
        expect(result.success).toBe(false);
        if (!result.success && result.error.code === "INVALID_CONTENT") {
            expect(result.error.issues[0].path).toEqual(["image"]);
            expect(result.error.message).toContain("Split");
        }
    });

    it("accepts a split hero with one", () => {
        expect(
            parseSectionContent("hero", 2, {
                ...heroSplit,
                image: { src: "http://e/i.png" },
            }).success,
        ).toBe(true);
    });

    it("accepts a centered hero with no image", () => {
        expect(
            parseSectionContent("hero", 2, {
                variant: "centered",
                heading: "Fresh bread",
            }).success,
        ).toBe(true);
    });

    /*
     * The rule must not reach backwards. Every draft written before #254 names
     * no look; if an absent variant inherited `split`'s requirement, every one
     * of them would become unsaveable.
     */
    it("imposes nothing on content that names no variant", () => {
        expect(
            parseSectionContent("hero", 2, { heading: "Fresh bread" }).success,
        ).toBe(true);
    });

    /* A build that does not know a look cannot know what it demands. */
    it("imposes nothing for an unknown variant", () => {
        expect(
            parseSectionContent("hero", 2, {
                variant: "fromTheFuture",
                heading: "Fresh bread",
            }).success,
        ).toBe(true);
    });
});

describe("gallery@1 and gallery@2 coexist", () => {
    it("still accepts a v1 gallery carrying `layout`", () => {
        const result = parseSectionContent("gallery", 1, {
            layout: "carousel",
            images: [{ src: "http://e/i.png" }],
        });
        expect(result.success).toBe(true);
    });

    it("accepts a v2 gallery carrying `variant`", () => {
        expect(
            parseSectionContent("gallery", 2, {
                variant: "carousel",
                images: [{ src: "http://e/i.png" }],
            }).success,
        ).toBe(true);
    });

    /* v2 dropped it, and an unknown key is stripped rather than rejected. */
    it("strips `layout` from a v2 gallery", () => {
        const result = parseSectionContent("gallery", 2, {
            variant: "grid",
            layout: "masonry",
            images: [{ src: "http://e/i.png" }],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).not.toHaveProperty("layout");
        }
    });
});

describe("every block declares its looks", () => {
    it.each([...SECTION_TYPES])("%s has a non-empty variant list", (type) => {
        expect(BLOCK_META[type].variants.length).toBeGreaterThan(0);
    });
});
