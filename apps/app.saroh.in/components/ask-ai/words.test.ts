import { describe, expect, it } from "vitest";

import { valueText } from "./words";

describe("valueText", () => {
    it("shows a description's words, not its tags; any other field as written", () => {
        expect(
            valueText(
                "<p>A long-fermented loaf.</p><p>Keeps three days.</p>",
                "description",
            ),
        ).toBe("A long-fermented loaf. Keeps three days.");
        expect(valueText("<b>Bun</b>", "name")).toBe("<b>Bun</b>");
        expect(valueText(350)).toBe("350");
    });
});
