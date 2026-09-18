import { describe, expect, it } from "vitest";

import { heldBackSummary, unfinishedPhrase } from "./held-back-copy";
import type { HeldBackSection } from "./saveable-sections";

const held = (...types: HeldBackSection["type"][]): HeldBackSection[] =>
    types.map((type, index) => ({ index, key: undefined, type, message: "" }));

describe("held-back copy", () => {
    it("names one unfinished section", () => {
        expect(unfinishedPhrase(held("faq"))).toBe(
            "the unfinished FAQ section",
        );
        expect(heldBackSummary(held("faq"))).toBe(
            "Saved · 1 section not finished: FAQ",
        );
    });

    it("names several, in order, in the plural", () => {
        expect(unfinishedPhrase(held("faq", "contact", "gallery"))).toBe(
            "the unfinished FAQ, Contact and Gallery sections",
        );
        expect(heldBackSummary(held("faq", "contact"))).toBe(
            "Saved · 2 sections not finished: FAQ, Contact",
        );
    });
});
