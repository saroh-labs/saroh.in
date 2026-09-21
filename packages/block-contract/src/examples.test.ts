import { describe, expect, it } from "vitest";

import { BLOCK_EXAMPLES, blockExample, exampleTextIn } from "./examples";
import { BLOCK_META } from "./fixtures";
import type { SectionType } from "./section-contract";
import { parseSectionContent } from "./section-contract";

describe("the example a block starts with", () => {
    const every = Object.entries(BLOCK_EXAMPLES).flatMap(([type, looks]) =>
        Object.entries(looks).map(([look, ex]) => [type, look, ex] as const),
    );

    it.each(every)("%s/%s passes its own contract", (type, _look, ex) => {
        const parsed = parseSectionContent(
            type,
            ex.contractVersion,
            ex.content,
        );
        // An example waiting on the merchant's own photo is incomplete on
        // purpose; everything else must be valid as added.
        expect(parsed.success).toBe(ex.awaits === undefined);
    });

    it.each(every)("%s/%s is a look the block has", (type, look) => {
        const ids = BLOCK_META[type as SectionType].variants.map((v) => v.id);
        expect(ids).toContain(look);
    });

    it("starts blocks that must not carry invented content blank", () => {
        for (const type of [
            "testimonials",
            "contact",
            "gallery",
            "enquiry",
            "booking",
            "servicesList",
        ] as const) {
            expect(blockExample(type)).toBeUndefined();
        }
    });

    it("falls back to the first look when the look asked for has none", () => {
        expect(blockExample("hero", "nonsense")).toBe(
            BLOCK_EXAMPLES.hero?.centered,
        );
    });
});

describe("finding example text left in a block", () => {
    it("finds the example heading, untouched", () => {
        const ex = blockExample("hero");
        expect(exampleTextIn("hero", ex?.content)).toBe(
            "Fresh bread, baked every morning",
        );
    });

    it("finds the example paragraph inside longer rich text", () => {
        const html =
            "<h2>Our story</h2><p>We have been on the same corner since 1998.</p><p>More.</p>";
        expect(exampleTextIn("richText", { value: html })).toBe(
            "We have been on the same corner since 1998.",
        );
    });

    it("says nothing once the merchant has written their own", () => {
        expect(
            exampleTextIn("hero", {
                heading: "Packaging, storage and safety supplies",
                cta: { label: "Browse the catalogue" },
            }),
        ).toBeNull();
    });

    it("does not mistake a short common word for example text", () => {
        expect(exampleTextIn("cta", { label: "Book a table" })).toBe(
            "Book a table",
        );
        expect(exampleTextIn("hero", { heading: "Default" })).toBeNull();
    });

    it("has nothing to say about blocks without examples", () => {
        expect(exampleTextIn("testimonials", { heading: "x" })).toBeNull();
    });
});
