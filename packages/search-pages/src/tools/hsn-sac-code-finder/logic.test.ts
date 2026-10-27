import { describe, expect, it } from "vitest";

import { CODES } from "./codes";
import { countText, listCsv, POPULAR, search } from "./logic";

const codes = (q: string, f: Parameters<typeof search>[1] = "all") =>
    search(q, f).map((c) => c.code);

describe("search", () => {
    it("finds the boards' sample: a salon searching “hair”", () => {
        expect(codes("hair")).toEqual(["999721", "999722", "3305"]);
        expect(countText(3, "hair ")).toBe("3 codes for “hair”");
    });

    it("narrows to services, keeping the search", () => {
        expect(codes("gym", "SAC")).toEqual(["999723"]);
        expect(codes("sports", "SAC")).toContain("999652");
        expect(codes("saree", "SAC")).toEqual([]);
    });

    it("reads a code typed as digits", () => {
        expect(codes("1905")).toEqual(["1905"]);
        expect(codes("9997")).toEqual(
            CODES.filter((c) => c.code.startsWith("9997")).map((c) => c.code),
        );
    });

    it("finds something for every popular search, and nothing for nonsense", () => {
        for (const p of POPULAR) expect(codes(p).length).toBeGreaterThan(0);
        expect(codes("xylophone")).toEqual([]);
    });

    it("has each code once, with a rate and the right kind", () => {
        expect(new Set(CODES.map((c) => c.code)).size).toBe(CODES.length);
        for (const c of CODES) {
            expect(c.rate).toMatch(/^\d+%( or \d+%)?$/);
            expect(c.kind === "SAC").toBe(/^99\d{4}$/.test(c.code));
        }
    });

    it("writes the list as a spreadsheet", () => {
        expect(listCsv(search("1905", "all")).split("\n")).toEqual([
            "Type,Code,What,Usual GST rate (to confirm with your CA)",
            `HSN,1905,"Bread, pastry, cakes, biscuits and other bakers' wares","5%"`,
        ]);
    });
});
