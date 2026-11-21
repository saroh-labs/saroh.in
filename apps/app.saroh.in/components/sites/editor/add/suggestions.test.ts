import { describe, expect, it } from "vitest";

import { suggestedSections } from "./suggestions";

const all = [
    "booking",
    "faq",
    "testimonials",
    "cta",
    "visitUs",
    "enquiry",
    "hours",
] as const;

describe("suggestedSections (U46e)", () => {
    it("leaves out what the page already has, at most three", () => {
        expect(suggestedSections("FREE", [{ type: "faq" }], [...all])).toEqual({
            types: ["booking", "testimonials", "cta"],
            matched: false,
        });
    });

    it("says a module page's row matched, never a free page's", () => {
        expect(suggestedSections("CONTACT", [], [...all])).toEqual({
            types: ["visitUs", "enquiry", "hours"],
            matched: true,
        });
    });

    it("offers nothing the business can't add", () => {
        expect(suggestedSections("SHOP", [], ["faq"])).toEqual({
            types: ["faq"],
            matched: true,
        });
    });

    it("has nothing to say when the page has it all", () => {
        expect(
            suggestedSections(
                "CONTACT",
                [{ type: "visitUs" }, { type: "enquiry" }, { type: "hours" }],
                [...all],
            ),
        ).toEqual({ types: [], matched: false });
    });
});
