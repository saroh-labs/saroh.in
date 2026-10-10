import { describe, expect, it } from "vitest";

import {
    currencySymbol,
    formatCompact,
    formatMoney,
    formatMoneyMajor,
    formatNumber,
} from "./money";
import { count, plural } from "./plural";

describe("money from minor units", () => {
    it("writes the sign, Indian grouping and no .00 on a whole amount", () => {
        expect(formatMoney(125000, "INR")).toBe("₹1,250");
        expect(formatMoney(204497100, "INR")).toBe("₹20,44,971");
        expect(formatMoney(0, "INR")).toBe("₹0");
    });

    it("keeps both decimals when there are any", () => {
        expect(formatMoney(125050, "INR")).toBe("₹1,250.50");
        expect(formatMoney(125005, "INR")).toBe("₹1,250.05");
    });

    it("keeps .00 for a ledger column that asks", () => {
        expect(formatMoney(125000, "INR", { decimals: "always" })).toBe(
            "₹1,250.00",
        );
        expect(formatMoney(125050, "INR", { decimals: "always" })).toBe(
            "₹1,250.50",
        );
    });

    it("never writes Rs or the currency's code for rupees", () => {
        const text = formatMoney(125000, "INR");
        expect(text).not.toMatch(/Rs|INR/);
    });

    it("draws no sign when no currency is stated", () => {
        expect(formatMoney(125000, null)).toBe("1,250");
        expect(formatMoney(125050, undefined, { decimals: "always" })).toBe(
            "1,250.50",
        );
    });

    it("gives null for no amount, so the caller words the absence", () => {
        expect(formatMoney(null, "INR")).toBeNull();
        expect(formatMoney(undefined, "INR")).toBeNull();
    });
});

describe("money from major units", () => {
    it("reads the API's decimal strings", () => {
        expect(formatMoneyMajor("1250.00", "INR")).toBe("₹1,250");
        expect(formatMoneyMajor("1250.50", "INR")).toBe("₹1,250.50");
        expect(formatMoneyMajor(2400, "INR", { decimals: "always" })).toBe(
            "₹2,400.00",
        );
    });

    it("returns what it can't read as it came, never NaN", () => {
        expect(formatMoneyMajor("about ten", "INR")).toBe("about ten");
        expect(formatMoneyMajor(null, "INR")).toBeNull();
    });
});

describe("numbers", () => {
    it("groups a plain number as money is grouped", () => {
        expect(formatNumber(1204)).toBe("1,204");
        expect(formatNumber(2044971)).toBe("20,44,971");
        expect(formatNumber(7)).toBe("7");
    });

    it("shortens one for a tile", () => {
        expect(formatCompact(999)).toBe("999");
        expect(formatCompact(45000)).toBe("45K");
    });

    it("knows a currency's sign", () => {
        expect(currencySymbol("INR")).toBe("₹");
        expect(currencySymbol("USD")).toBe("$");
    });
});

describe("a count", () => {
    it("says the number and the thing's own word", () => {
        expect(count(3, "booking")).toBe("3 bookings");
        expect(count(1, "booking")).toBe("1 booking");
        expect(count(0, "booking")).toBe("0 bookings");
    });

    it("takes an irregular plural", () => {
        expect(count(2, "person", "people")).toBe("2 people");
        expect(count(1, "person", "people")).toBe("1 person");
        expect(count(4, "class", "classes")).toBe("4 classes");
        expect(count(2, "entry", "entries")).toBe("2 entries");
    });

    it("groups a large number", () => {
        expect(count(1204, "customer")).toBe("1,204 customers");
    });

    it("gives the word alone for the rest of the sentence", () => {
        expect(plural(1, "is", "are")).toBe("is");
        expect(plural(2, "is", "are")).toBe("are");
        expect(plural(2, "day")).toBe("days");
    });
});
