import { describe, expect, it } from "vitest";

import {
    ADDRESS_RULES_COUNTRIES,
    addressRulesFor,
    checkPostcode,
    checkRegion,
} from "./address-rules";
import { GLOBAL_CURRENCIES } from "./index";

const value = (v: string) => ({ value: v });

describe("postcodes", () => {
    it("takes real codes in each country's own shape", () => {
        const real: [string, string, string][] = [
            ["US", "10001", "10001"],
            ["US", "78701-1234", "78701-1234"],
            ["US", "787011234", "78701-1234"],
            ["CA", "k1a0b1", "K1A 0B1"],
            ["CA", "K1A 0B1", "K1A 0B1"],
            ["GB", "sw1a1aa", "SW1A 1AA"],
            ["GB", "M1 1AE", "M1 1AE"],
            ["GB", "EC1A 1BB", "EC1A 1BB"],
            ["AU", "2000", "2000"],
            ["NZ", "6011", "6011"],
            ["SG", "018956", "018956"],
            ["ZA", "8001", "8001"],
            ["NL", "1012ab", "1012 AB"],
            ["NL", "1012 AB", "1012 AB"],
            ["DE", "10115", "10115"],
            ["FR", "75001", "75001"],
            ["IT", "00184", "00184"],
            ["ES", "28013", "28013"],
            ["IE", "d02x285", "D02 X285"],
            ["IE", "D6W 1234", "D6W 1234"],
            ["PT", "1100148", "1100-148"],
            ["PT", "1100-148", "1100-148"],
            ["GR", "10557", "105 57"],
            ["SK", "811 01", "811 01"],
            ["LV", "1050", "LV-1050"],
            ["LV", "LV-1050", "LV-1050"],
            ["LT", "LT-01100", "LT-01100"],
            ["LU", "L-1009", "1009"],
            ["MT", "vlt1117", "VLT 1117"],
            ["SI", "SI-1000", "1000"],
            ["AT", "1010", "1010"],
        ];
        for (const [country, typed, stored] of real) {
            expect(
                checkPostcode(country, typed),
                `${country} ${typed}`,
            ).toEqual(value(stored));
        }
    });

    it("refuses the wrong shape with the country's example", () => {
        expect(checkPostcode("US", "110001")).toEqual({
            problem:
                "A ZIP code is 5 digits, or 5 and 4 with a hyphen, like 94105.",
        });
        expect(checkPostcode("US", "110001 ")).toHaveProperty("problem");
        expect(checkPostcode("US", "7870")).toHaveProperty("problem");
        expect(checkPostcode("CA", "D1A 0B1")).toHaveProperty("problem");
        expect(checkPostcode("CA", "12345")).toHaveProperty("problem");
        expect(checkPostcode("GB", "110001")).toEqual({
            problem: "A postcode is letters and digits, like SW1A 1AA.",
        });
        expect(checkPostcode("NL", "0123 AB")).toHaveProperty("problem");
        expect(checkPostcode("AU", "20000")).toHaveProperty("problem");
        expect(checkPostcode("DE", "1011")).toHaveProperty("problem");
        expect(checkPostcode("IE", "B02 X285")).toEqual({
            problem:
                "An Eircode is a letter and 2 digits, then 4 letters and digits, like D02 X285.",
        });
    });

    it("asks for a missing one only where it's required", () => {
        expect(checkPostcode("US", "")).toEqual({
            problem: "Add the ZIP code.",
        });
        expect(checkPostcode("GB", "  ")).toEqual({
            problem: "Add the postcode.",
        });
        expect(checkPostcode("US", "", false)).toEqual(value(""));
        expect(checkPostcode("US", null, false)).toEqual(value(""));
    });

    it("doesn't ask the UAE, which has none, and drops anything typed", () => {
        expect(addressRulesFor("AE").postcode).toBeNull();
        expect(checkPostcode("AE", "")).toEqual(value(""));
        expect(checkPostcode("AE", "12345")).toEqual(value(""));
        expect(checkPostcode("AE", "12345", true)).toEqual(value(""));
    });

    it("takes anything, optional, for a country it has no rules for", () => {
        expect(addressRulesFor("BR").postcode).toEqual({
            label: "Postcode",
            example: "",
            required: false,
        });
        expect(checkPostcode("BR", " 01310-100 ")).toEqual(value("01310-100"));
        expect(checkPostcode("BR", "")).toEqual(value(""));
        expect(checkPostcode(null, "x")).toEqual(value("x"));
    });

    it("reads a country however it's written", () => {
        expect(checkPostcode(" us ", "10001")).toEqual(value("10001"));
    });
});

describe("regions", () => {
    it("lists the US's states, DC and five territories, by code", () => {
        const region = addressRulesFor("US").region;
        expect(region.kind).toBe("list");
        if (region.kind !== "list") return;
        expect(region.label).toBe("State");
        expect(region.options).toHaveLength(56);
        for (const code of ["TX", "DC", "PR", "GU", "VI", "AS", "MP"]) {
            expect(region.options.map((o) => o.code)).toContain(code);
        }
    });

    it("lists Canada's 13 and Australia's 8", () => {
        const ca = addressRulesFor("CA").region;
        const au = addressRulesFor("AU").region;
        expect(ca.kind === "list" && ca.options.length).toBe(13);
        expect(au.kind === "list" && au.options.length).toBe(8);
        expect(ca.kind !== "none" && ca.label).toBe("Province or territory");
        expect(au.kind !== "none" && au.label).toBe("State or territory");
    });

    it("has no repeated code or name in a list", () => {
        for (const country of ADDRESS_RULES_COUNTRIES) {
            const region = addressRulesFor(country).region;
            if (region.kind !== "list") continue;
            const codes = region.options.map((o) => o.code);
            const names = region.options.map((o) => o.name);
            expect(new Set(codes).size).toBe(codes.length);
            expect(new Set(names).size).toBe(names.length);
        }
    });

    it("stores a listed region as its code, from a code or a name", () => {
        expect(checkRegion("US", "TX")).toEqual(value("TX"));
        expect(checkRegion("US", "tx")).toEqual(value("TX"));
        expect(checkRegion("US", "Texas")).toEqual(value("TX"));
        expect(checkRegion("US", " new  york ")).toEqual(value("NY"));
        expect(checkRegion("CA", "Ontario")).toEqual(value("ON"));
        expect(checkRegion("AU", "nsw")).toEqual(value("NSW"));
    });

    it("refuses one not on the list, and a blank one unless told not to", () => {
        expect(checkRegion("US", "XX")).toEqual({
            problem: "Choose a state from the list.",
        });
        expect(checkRegion("US", "")).toEqual({
            problem: "Choose your state.",
        });
        expect(checkRegion("AU", "")).toEqual({
            problem: "Choose your state or territory.",
        });
        expect(checkRegion("US", "", false)).toEqual(value(""));
    });

    it("takes a free region elsewhere, optional", () => {
        expect(addressRulesFor("GB").region).toEqual({
            kind: "text",
            label: "Region",
        });
        expect(checkRegion("GB", " Greater London ")).toEqual(
            value("Greater London"),
        );
        expect(checkRegion("GB", "")).toEqual(value(""));
        expect(checkRegion("BR", "SP")).toEqual(value("SP"));
    });

    it("doesn't ask Singapore for one", () => {
        expect(addressRulesFor("SG").region).toEqual({ kind: "none" });
        expect(checkRegion("SG", "Central")).toEqual(value(""));
    });
});

describe("the field's words", () => {
    it("says each country's own name for the postcode", () => {
        expect(addressRulesFor("US").postcode?.label).toBe("ZIP code");
        expect(addressRulesFor("CA").postcode?.label).toBe("Postal code");
        expect(addressRulesFor("GB").postcode?.label).toBe("Postcode");
        expect(addressRulesFor("AU").postcode?.label).toBe("Postcode");
    });

    it("gives every listed postcode an example its own check takes", () => {
        for (const country of ADDRESS_RULES_COUNTRIES) {
            const p = addressRulesFor(country).postcode;
            if (!p) continue;
            expect(p.required).toBe(true);
            expect(checkPostcode(country, p.example), country).toEqual(
                value(p.example),
            );
        }
    });
});

describe("the table", () => {
    it("has no India row: India keeps its own state and PIN rules", () => {
        expect(ADDRESS_RULES_COUNTRIES).not.toContain("IN");
    });

    it("covers every country whose currency Global offers, and the euro area", () => {
        const offered = [
            "US",
            "GB",
            "CA",
            "AU",
            "NZ",
            "SG",
            "AE",
            "ZA",
            ..."AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(
                " ",
            ),
        ];
        expect(GLOBAL_CURRENCIES).toHaveLength(9);
        expect([...ADDRESS_RULES_COUNTRIES].sort()).toEqual(offered.sort());
    });
});
