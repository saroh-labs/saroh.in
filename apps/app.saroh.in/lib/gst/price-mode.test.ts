import { describe, expect, it } from "vitest";

import {
    businessModeOf,
    effectiveMode,
    itemModeInput,
    itemModeOptions,
    itemModeValue,
    PRICE_MODE_CHOICES,
    PRICE_MODE_SAVED,
    PRICE_MODE_SAYS,
    pricesCarryGst,
    rateBps,
    rateHint,
    unitPayCents,
} from "./price-mode";

/**
 * How a price carries GST (12 Oct 2026): the preview's sums agree with the
 * API's rule to the paisa, and the words say which way it is.
 */
describe("unitPayCents", () => {
    it("adds the GST on top, rounded to the paisa, half up", () => {
        expect(unitPayCents(100_000, "18", "ADDED", true)).toBe(118_000);
        expect(unitPayCents(9_999, "18", "ADDED", true)).toBe(11_799);
        expect(unitPayCents(4_950, "5", "ADDED", true)).toBe(5_198);
        expect(unitPayCents(1_003, "0.25", "ADDED", true)).toBe(1_006);
    });

    it("pays the typed price when it includes GST, has no rate, is exempt, or the business isn't registered", () => {
        expect(unitPayCents(100_000, "18", "INCLUDED", true)).toBe(100_000);
        expect(unitPayCents(100_000, null, "ADDED", true)).toBe(100_000);
        expect(unitPayCents(100_000, undefined, "ADDED", true)).toBe(100_000);
        expect(unitPayCents(100_000, "0", "ADDED", true)).toBe(100_000);
        expect(unitPayCents(100_000, "18", "ADDED", false)).toBe(100_000);
        // Not a rate at all: nothing is added.
        expect(unitPayCents(100_000, "lots", "ADDED", true)).toBe(100_000);
    });
});

describe("rateBps", () => {
    it("reads a percent as basis points without floating point", () => {
        expect(rateBps("18")).toBe(1800);
        expect(rateBps("0.25")).toBe(25);
        expect(rateBps("5")).toBe(500);
        expect(rateBps("18.00")).toBe(1800);
        expect(rateBps("0")).toBe(0);
        expect(rateBps(null)).toBeNull();
        expect(rateBps("")).toBeNull();
    });
});

describe("effectiveMode", () => {
    it("is the item's own way when it has one, either way round", () => {
        expect(effectiveMode("INCLUDED", "ADDED")).toBe("ADDED");
        expect(effectiveMode("ADDED", "INCLUDED")).toBe("INCLUDED");
    });

    it("is the business's otherwise, and included when the business never chose", () => {
        expect(effectiveMode("ADDED", null)).toBe("ADDED");
        expect(effectiveMode("ADDED", "")).toBe("ADDED");
        expect(effectiveMode("INCLUDED", undefined)).toBe("INCLUDED");
        expect(effectiveMode(undefined, null)).toBe("INCLUDED");
        expect(effectiveMode(null, "ADDED")).toBe("ADDED");
        expect(businessModeOf(undefined)).toBe("INCLUDED");
        expect(businessModeOf("SOMETIMES")).toBe("INCLUDED");
    });
});

describe("the words", () => {
    it("says each way as the row, the choices and the toast do", () => {
        expect(PRICE_MODE_SAYS).toEqual({
            INCLUDED: "Prices include GST",
            ADDED: "GST is added to prices",
        });
        expect(PRICE_MODE_CHOICES.map((c) => c.label)).toEqual([
            "My prices include GST",
            "GST is added to my prices",
        ]);
        expect(PRICE_MODE_SAVED).toEqual({
            INCLUDED: "Prices now include GST",
            ADDED: "GST is now added to your prices",
        });
    });

    it("opens a rates note with the way in force, and with nothing when it isn't known", () => {
        expect(pricesCarryGst("INCLUDED")).toBe("Prices include GST.");
        expect(pricesCarryGst("ADDED")).toBe("GST is added to your prices.");
        expect(pricesCarryGst(null)).toBe("");
    });

    it("the item's first option follows the business's own way", () => {
        expect(itemModeOptions("INCLUDED")).toEqual([
            { value: "", label: "Same as the business (includes GST)" },
            { value: "INCLUDED", label: "Includes GST" },
            { value: "ADDED", label: "GST is added" },
        ]);
        expect(itemModeOptions("ADDED")[0]?.label).toBe(
            "Same as the business (GST is added)",
        );
        // Couldn't be read: no claim either way.
        expect(itemModeOptions(null)[0]?.label).toBe("Same as the business");
    });

    it("null is the same as the business, both ways", () => {
        expect(itemModeValue(null)).toBe("");
        expect(itemModeValue(undefined)).toBe("");
        expect(itemModeValue("ADDED")).toBe("ADDED");
        expect(itemModeInput("")).toBeNull();
        expect(itemModeInput("INCLUDED")).toBe("INCLUDED");
        expect(itemModeInput("ADDED")).toBe("ADDED");
    });

    it("the rate's note says the rate goes on top only when it does", () => {
        const usual = "Included in the price.";
        expect(rateHint("INCLUDED", "", usual)).toBe(usual);
        expect(rateHint("ADDED", "", usual)).toBe(
            "The rate added on top of the price.",
        );
        expect(rateHint("ADDED", "INCLUDED", usual)).toBe(usual);
        expect(rateHint("INCLUDED", "ADDED", usual)).toBe(
            "The rate added on top of the price.",
        );
        expect(rateHint(null, "", usual)).toBe(usual);
    });
});
