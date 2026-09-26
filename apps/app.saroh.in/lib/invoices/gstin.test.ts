import { describe, expect, it } from "vitest";

import { gstinCheckChar, gstinParts, gstinProblem } from "./gstin";

const states = (value: string) =>
    Object.fromEntries(gstinParts(value).map((p) => [p.key, p.state]));

describe("gstinProblem — the API's rules, said part by part", () => {
    it("accepts a real GSTIN, typed any case, spaces and all", () => {
        expect(gstinProblem("27AAPFU0939F1ZV")).toBeNull();
        expect(gstinProblem(" 29aagcr4375j1zu ")).toBeNull();
    });

    it("names what is still missing from a short one", () => {
        // The screenshot's case: the PAN is in, the last three are not.
        expect(gstinProblem("06ABCDE1234N")).toBe(
            "12 of 15 characters — add the entity number, the Z and the check character.",
        );
        expect(gstinProblem("06ABC")).toBe(
            "5 of 15 characters — add the PAN, the entity number, the Z and the check character.",
        );
    });

    it("says which part is wrong", () => {
        expect(gstinProblem("99AAGCR4375J1ZU")).toMatch(
            /99 isn't a state code/,
        );
        expect(gstinProblem("2AAGCR4375J1ZU")).toMatch(/two digits/);
        expect(gstinProblem("29AAG1R4375J1ZU")).toMatch(/PAN: 5 letters/);
        expect(gstinProblem("29AAGCR4375J0ZU")).toMatch(/entity number/);
        expect(gstinProblem("29AAGCR4375J1YU")).toMatch(/always Z/);
        expect(gstinProblem("29AAGCR4375J1ZX")).toMatch(/doesn't match/);
        expect(gstinProblem("29AAGCR4375J1ZUX")).toMatch(/16 characters/);
    });

    it("asks for one when it is empty", () => {
        expect(gstinProblem("")).toMatch(/needs its GSTIN/);
    });
});

describe("gstinParts — the guide under the field", () => {
    it("fills the parts in as they are typed", () => {
        expect(states("06ABCDE1234N")).toEqual({
            state: "done",
            pan: "done",
            entity: "empty",
            z: "empty",
            check: "empty",
        });
        expect(states("06ABCDE12")).toMatchObject({
            pan: "partial",
            entity: "empty",
        });
    });

    it("marks the part that is wrong", () => {
        expect(states("29AAGCR4375J1ZX").check).toBe("wrong");
        expect(states("99AAGCR4375J1ZU").state).toBe("wrong");
        expect(states("29AAGCR4375J1ZU")).toEqual({
            state: "done",
            pan: "done",
            entity: "done",
            z: "done",
            check: "done",
        });
    });

    it("works out the check character as the API does", () => {
        expect(gstinCheckChar("27AAPFU0939F1Z")).toBe("V");
        expect(gstinCheckChar("29AAGCR4375J1Z")).toBe("U");
    });
});
