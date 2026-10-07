import { describe, expect, it } from "vitest";

import { parseOptionValues } from "./option-values";

describe("parseOptionValues (UX-062)", () => {
    it("splits on commas and lines, trimmed", () => {
        expect(parseOptionValues(" S, M ,L\nXL ")).toEqual([
            "S",
            "M",
            "L",
            "XL",
        ]);
    });

    it("drops blanks, repeats and values the option has", () => {
        expect(parseOptionValues("S, s, , M", ["m"])).toEqual(["S"]);
    });
});
