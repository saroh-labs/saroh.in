import { describe, expect, it } from "vitest";

import type { HeldBackSection } from "@/components/sites/blocks/saveable-sections";
import { heldBackSummary, unfinishedPhrase } from "./held-back-copy";

const held = (...types: HeldBackSection["type"][]): HeldBackSection[] =>
    types.map((type, index) => ({ index, key: undefined, type, message: "" }));

describe("held-back copy", () => {
    it("names one unfinished section", () => {
        expect(unfinishedPhrase(held("faq"))).toBe(
            "the unfinished Questions and answers section",
        );
        expect(heldBackSummary(held("faq"))).toBe(
            "Saved · 1 section not finished: Questions and answers",
        );
    });

    it("names several, in order, in the plural", () => {
        expect(unfinishedPhrase(held("faq", "contact", "gallery"))).toBe(
            "the unfinished Questions and answers, Visit us · Talk to us and Gallery sections",
        );
        expect(heldBackSummary(held("faq", "contact"))).toBe(
            "Saved · 2 sections not finished: Questions and answers, Visit us · Talk to us",
        );
    });
});
