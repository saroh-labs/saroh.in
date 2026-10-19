import { describe, expect, it } from "vitest";

import {
    countryFlag,
    countryMatches,
    joinPhone,
    normalisePhoneNumber,
    PHONE_CASES,
    PHONE_COUNTRIES,
    phoneCountry,
    phoneE164,
    phoneLabel,
    phoneNumberProblem,
    searchCountries,
    splitPhone,
} from "./phone";

describe("the one phone rule (#1036)", () => {
    it.each(PHONE_CASES)("reads $typed", ({ typed, stored }) => {
        const result = normalisePhoneNumber(typed);
        if (stored) expect(result).toEqual({ phone: stored });
        else expect(result).toHaveProperty("problem");
    });

    it("clears on nothing typed", () => {
        expect(normalisePhoneNumber("  ")).toEqual({ phone: null });
        expect(phoneNumberProblem("")).toBeNull();
        expect(phoneE164("")).toBe("");
    });

    it("reads 00 as +", () => {
        expect(normalisePhoneNumber("0044 20 7946 0958")).toEqual({
            phone: "+442079460958",
        });
    });

    it("says what is wrong in plain words", () => {
        expect(phoneNumberProblem("98765")).toMatch(/country code/);
        expect(phoneNumberProblem("+91 98765 4321")).toBe(
            "An Indian number is +91 and then 10 digits.",
        );
        expect(phoneNumberProblem("call me")).toMatch(/only digits/);
    });

    it("keeps what it can't read as typed, for the server to refuse", () => {
        expect(phoneE164(" 98765 ")).toBe("98765");
        expect(phoneE164("098765 43210")).toBe("+919876543210");
    });
});

describe("the field's parts", () => {
    it.each(PHONE_CASES.filter((c) => c.stored))(
        "splits $typed into its country and back",
        ({ typed, stored, country }) => {
            const parts = splitPhone(typed, "IN");
            expect(parts.country).toBe(country);
            expect(joinPhone(parts)).toBe(stored);
        },
    );

    it("groups the number it splits off", () => {
        expect(splitPhone("+919876543210")).toEqual({
            country: "IN",
            national: "98765 43210",
        });
        expect(splitPhone("0091 98765 43210", "AE")).toEqual({
            country: "IN",
            national: "98765 43210",
        });
        expect(splitPhone("+442079460958")).toEqual({
            country: "GB",
            national: "207 946 0958",
        });
    });

    it("keeps a number with no code under the field's own country", () => {
        expect(splitPhone("50 123 4567", "AE")).toEqual({
            country: "AE",
            national: "50 123 4567",
        });
        expect(joinPhone({ country: "AE", national: "050 123 4567" })).toBe(
            "+971501234567",
        );
    });

    it("reads a shared code as the field's own country where it can", () => {
        expect(splitPhone("+1 416 555 0100", "CA").country).toBe("CA");
        expect(splitPhone("+1 416 555 0100", "IN").country).toBe("US");
        expect(splitPhone("+1 876 555 0100").country).toBe("JM");
    });

    it("is empty with nothing typed", () => {
        expect(joinPhone({ country: "IN", national: "  " })).toBe("");
        expect(splitPhone("", "GB")).toEqual({ country: "GB", national: "" });
    });

    it("keeps letters, so the rule can refuse them", () => {
        const value = joinPhone({ country: "IN", national: "98765 abc" });
        expect(phoneNumberProblem(value)).toMatch(/only digits/);
    });

    it("keeps Italy's leading 0", () => {
        expect(joinPhone({ country: "IT", national: "06 1234 5678" })).toBe(
            "+390612345678",
        );
    });
});

describe("a saved number, shown", () => {
    it.each([
        ["+919876543210", "+91 98765 43210"],
        ["+442079460958", "+44 207 946 0958"],
        ["+14155550100", "+1 415 555 0100"],
        ["+971501234567", "+971 50 123 4567"],
        // Saved before numbers were checked.
        ["98765 43210", "+91 98765 43210"],
        ["ask at the desk", "ask at the desk"],
        // Written with its code and its own grouping: kept.
        ["+91 22 4000 0000", "+91 22 4000 0000"],
        ["+91-98450-12345", "+91 98450 12345"],
        ["", ""],
    ])("%j reads %j", (stored, shown) => {
        expect(phoneLabel(stored)).toBe(shown);
    });
});

describe("countries", () => {
    it("lists each country once, India first", () => {
        const codes = PHONE_COUNTRIES.map((c) => c.code);
        expect(new Set(codes).size).toBe(codes.length);
        expect(codes[0]).toBe("IN");
        for (const c of PHONE_COUNTRIES) {
            expect(c.code).toMatch(/^[A-Z]{2}$/);
            expect(c.dial).toMatch(/^[1-9]\d{0,3}$/);
        }
    });

    it("finds a country by name, code or calling code", () => {
        const gb = phoneCountry("gb");
        expect(countryMatches(gb, "united k")).toBe(true);
        expect(countryMatches(gb, "+44")).toBe(true);
        expect(countryMatches(gb, "gb")).toBe(true);
        expect(countryMatches(gb, "india")).toBe(false);
        expect(searchCountries("971").map((c) => c.code)).toEqual(["AE"]);
    });

    it("falls back to India", () => {
        expect(phoneCountry("zz").code).toBe("IN");
        expect(phoneCountry(null).code).toBe("IN");
    });

    it("draws a flag", () => {
        expect(countryFlag("IN")).toBe("🇮🇳");
    });
});
