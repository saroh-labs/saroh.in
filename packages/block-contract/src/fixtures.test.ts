import { describe, expect, it } from "vitest";

import { BLOCK_META } from "./fixtures";
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
