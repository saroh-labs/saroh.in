import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GST_STATES, gstinProblem, stateCode, stateName } from "./gst-states";

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

describe("the states a merchant's site offers at checkout", () => {
    // The bag's "State" is a choice from `site-blocks`' own list (a
    // frontend package can't import this module). Every name there must
    // read as a state here, or its order carries the wrong place of supply.
    const source = readFileSync(
        join(
            __dirname,
            "../../../../../packages/site-blocks/src/shop/india-states.ts",
        ),
        "utf8",
    );
    const list = /INDIA_STATES[^=]*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
    const names = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    it("are all states this API knows, each once", () => {
        expect(names).toHaveLength(36);
        const codes = names.map((name) => stateCode(name));
        expect(codes).not.toContain(null);
        expect(new Set(codes).size).toBe(36);
    });

    it("are every state and union territory there is (all but Other Territory)", () => {
        const known = GST_STATES.filter((s) => s.code !== "97").map(
            (s) => s.name,
        );
        expect([...names].sort()).toEqual([...known].sort());
    });
});
