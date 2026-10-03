import { describe, expect, it } from "vitest";

import type { Section } from "@/lib/sites/service";

import { saveableSections } from "../saveable-sections";
import { withVariant } from "./variant-field";

/**
 * Choosing a look moves a section to the newest contract, and its content
 * with it. A starter hero is v1 with an address button; lifted to v2 without
 * its button becoming an action, it failed v2 and the editor held it back as
 * "Not finished" whatever was filled in, so a Split hero never saved.
 */
describe("withVariant", () => {
    it("lets a starter hero switched to Split, with an image, save", () => {
        const starter = {
            key: "hero-1",
            type: "hero",
            contractVersion: 1,
            content: {
                heading: "Mulmul & Co",
                subheading: "Welcome",
                cta: { label: "About Mulmul & Co", href: "/about" },
            },
        } as unknown as Section;
        const split = withVariant(starter, "split");
        const withImage = {
            ...split,
            content: {
                ...split.content,
                image: {
                    src: "https://images.unsplash.com/photo-1727867246475-270f9783d5a2",
                    alt: "A woman in a sage cotton sundress by a lake",
                },
            },
        } as Section;

        const result = saveableSections([withImage], []);
        expect(result.heldBack).toEqual([]);
        expect(result.toSend).toHaveLength(1);
    });
});
