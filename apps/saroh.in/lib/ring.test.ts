import { describe, expect, it } from "vitest";

import { cn } from "./cn";
import { ring } from "./ring";

describe("ring", () => {
    it("is DESIGN.md's ring by default", () => {
        expect(ring()).toBe(
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]",
        );
    });

    it("takes an inset offset and a colour", () => {
        expect(ring({ offset: "inset", color: "paper" })).toBe(
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-background focus-visible:[outline-style:solid]",
        );
        expect(ring({ offset: 0 })).toBe(
            "focus-visible:outline-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]",
        );
    });

    it("keeps every part through cn()", () => {
        expect(cn("rounded-sm", ring())).toBe(`rounded-sm ${ring()}`);
    });
});
