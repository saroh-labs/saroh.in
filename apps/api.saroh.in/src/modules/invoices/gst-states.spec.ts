import { gstinProblem, stateCode, stateName } from "./gst-states";

describe("GST states", () => {
    it("reads a code or a name as the code", () => {
        expect(stateCode("29")).toBe("29");
        expect(stateCode("7")).toBe("07");
        expect(stateCode(" karnataka ")).toBe("29");
        expect(stateCode("Tamil Nadu")).toBe("33");
        expect(stateCode("Orissa")).toBe("21");
        expect(stateCode("25")).toBeNull();
        expect(stateCode("Atlantis")).toBeNull();
        expect(stateCode(null)).toBeNull();
        expect(stateName("30")).toBe("Goa");
    });
});

describe("GSTIN", () => {
    it("accepts a real-shaped GSTIN with the right check character", () => {
        expect(gstinProblem("27AAPFU0939F1ZV")).toBeNull();
        expect(gstinProblem("29aagcr4375j1zu")).toBeNull();
        expect(gstinProblem("29AAGCR4375J1ZU", "29")).toBeNull();
    });

    it("refuses the wrong shape, a mistyped character or an unknown state", () => {
        expect(gstinProblem("29AAGCR4375J1Z")).toMatch(/15 characters/);
        expect(gstinProblem("29AAGCR4375J1ZX")).toMatch(/does not check out/);
        expect(gstinProblem("99AAGCR4375J1ZU")).toMatch(/state code/);
    });

    it("refuses a GSTIN from another state than the business's", () => {
        expect(gstinProblem("30AAACR5055K1ZK", "29")).toMatch(
            /registered in Goa, not Karnataka/,
        );
    });
});
