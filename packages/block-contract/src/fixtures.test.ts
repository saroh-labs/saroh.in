import { describe, expect, it } from "vitest";

import { COMING_BLOCKS } from "./coming-blocks";
import {
    BLOCK_META,
    blockFamilies,
    blockHeading,
    blockSearchText,
} from "./fixtures";
import { parseRenderedContent } from "./rendered";
import type { SectionType } from "./section-contract";
import { SECTION_TYPES } from "./section-contract";
import { TO_RENDERED } from "./to-rendered";

/**
 * Gate G4 (#252) — a fixture that does not match its own block's rendered
 * schema fails CI.
 *
 * A fixture is hand-authored, which is exactly what a published snapshot is
 * not. A snapshot went through the contract on the way in and is immutable, so
 * it cannot be invalid; a fixture is somebody typing an example, and a typo in
 * one means the catalog quietly shows a broken block and the tests that render
 * it prove nothing. This is the check that makes a fixture worth reusing three
 * ways.
 */
describe("block fixtures", () => {
    const types = Object.keys(BLOCK_META) as SectionType[];

    it("covers every registered section type", () => {
        expect(types.sort()).toEqual([...SECTION_TYPES].sort());
    });

    it.each(types)("%s declares at least one variant", (type) => {
        expect(BLOCK_META[type].variants.length).toBeGreaterThan(0);
    });

    it.each(types)("%s has a fixture for every variant", (type) => {
        const meta = BLOCK_META[type];
        const declared = meta.variants.map((v) => v.id).sort();
        expect(Object.keys(meta.fixtures).sort()).toEqual(declared);
    });

    it.each(types)("%s fixtures parse against its rendered schema", (type) => {
        for (const [variantId, content] of Object.entries(
            BLOCK_META[type].fixtures,
        )) {
            const result = parseRenderedContent(type, content);
            if (!result.success) {
                throw new Error(
                    `${type}/${variantId}: ${JSON.stringify(result.issues, null, 2)}`,
                );
            }
            expect(result.success).toBe(true);
        }
    });

    it.each(types)(
        "%s cases parse against its rendered schema and name a look it has",
        (type) => {
            const meta: { cases?: Record<string, unknown> } & {
                variants: readonly { id: string }[];
            } = BLOCK_META[type];
            const ids = meta.variants.map((v) => v.id);
            for (const [name, content] of Object.entries(meta.cases ?? {})) {
                const result = parseRenderedContent(type, content);
                if (!result.success) {
                    throw new Error(
                        `${type}/${name}: ${JSON.stringify(result.issues, null, 2)}`,
                    );
                }
                expect(ids).toContain(
                    (content as { variant?: string }).variant,
                );
            }
        },
    );

    it("keeps the text block's photo case (G7)", () => {
        const photo = BLOCK_META.richText.cases.photo;
        expect(photo.image.src).not.toBe("");
        expect(photo.image.alt.trim()).not.toBe("");
    });

    it.each(types)("%s fixture declares its own variant id", (type) => {
        for (const [variantId, content] of Object.entries(
            BLOCK_META[type].fixtures,
        )) {
            expect((content as { variant?: string }).variant).toBe(variantId);
        }
    });

    /**
     * Gate G3's runtime companion. The `satisfies Record<SectionType, …>` on
     * TO_RENDERED already makes a missing mapping a compile error; this catches
     * the case where someone widens the type to get past it.
     */
    it("declares a toRendered mapping for every section type", () => {
        expect(Object.keys(TO_RENDERED).sort()).toEqual(
            [...SECTION_TYPES].sort(),
        );
    });
});

/** The 17-block catalogue (U3, KD5, KD6): families are a view, never a type change. */
describe("block families", () => {
    const families = blockFamilies(SECTION_TYPES);

    it("reads Highlights, People and Text, with the old names as aliases", () => {
        expect(BLOCK_META.features.label).toBe("Highlights");
        expect(BLOCK_META.person.label).toBe("People");
        expect(BLOCK_META.richText.label).toBe("Text");
        expect(blockSearchText("features")).toContain("features");
        expect(blockSearchText("richText")).toContain("rich text");
    });

    it("lists Visit us once, with Address and hours, Hours and Talk to us", () => {
        const visit = families.filter((f) => f.head === "visitUs");
        expect(visit).toHaveLength(1);
        expect(visit[0].name).toBe("Visit us");
        expect(visit[0].layouts[0]).toEqual({
            type: "visitUs",
            label: "Address and hours",
        });
        expect(visit[0].layouts.map((l) => l.label).sort()).toEqual([
            "Address and hours",
            "Hours",
            "Talk to us",
        ]);
        const plans = families.find((f) => f.head === "plans");
        expect(plans?.layouts).toEqual([
            { type: "plans", label: "Plans" },
            { type: "packs", label: "Class packs" },
        ]);
    });

    it("heads a member section with its family", () => {
        expect(blockHeading("hours")).toBe("Visit us · Hours");
        expect(blockHeading("contact")).toBe("Visit us · Talk to us");
        expect(blockHeading("packs")).toBe("Plans · Class packs");
        expect(blockHeading("plans")).toBe("Plans");
        expect(blockHeading("hero")).toBe("Hero");
    });

    it("finds a family layout by its old name", () => {
        expect(blockSearchText("contact")).toContain("contact");
        expect(blockSearchText("hours")).toContain("opening hours");
        expect(blockSearchText("packs")).toContain("class packs");
    });

    it("names only family heads that exist and lead their own family", () => {
        for (const type of SECTION_TYPES) {
            const of = (BLOCK_META[type] as { family?: { of: SectionType } })
                .family?.of;
            if (of) {
                expect(
                    (BLOCK_META[of] as { family?: { of: SectionType } }).family
                        ?.of,
                ).toBe(of);
            }
        }
    });

    it("counts 17 built blocks, plus Subscribe as Coming and never a section type", () => {
        expect(families).toHaveLength(17);
        expect(COMING_BLOCKS.map((b) => b.name)).toEqual(["Subscribe"]);
        expect(SECTION_TYPES as readonly string[]).not.toContain("subscribe");
        expect(COMING_BLOCKS[0].family).toBe("Words");
    });
});
