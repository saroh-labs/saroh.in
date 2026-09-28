import { describe, expect, it } from "vitest";

import { VALIDITY_TOO_SHORT, validityProblem } from "./validity";

describe("validityProblem", () => {
    it("refuses under a week, as the API does, before saving", () => {
        expect(validityProblem("6")).toBe(VALIDITY_TOO_SHORT);
        expect(validityProblem("0")).toBe(VALIDITY_TOO_SHORT);
    });

    it("takes a week and more", () => {
        expect(validityProblem("7")).toBeNull();
        expect(validityProblem(" 90 ")).toBeNull();
        expect(validityProblem("3650")).toBeNull();
    });

    it("refuses what isn't a whole number of days, or too many", () => {
        expect(validityProblem("")).toBe("A whole number of days");
        expect(validityProblem("7.5")).toBe("A whole number of days");
        expect(validityProblem("3651")).toBe("At most 3650 days");
    });
});
