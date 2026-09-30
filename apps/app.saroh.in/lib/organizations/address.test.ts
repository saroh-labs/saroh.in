import { describe, expect, it } from "vitest";

import { addressFromName, cleanAddressInput } from "./address";

describe("the address a business name becomes", () => {
    it.each([
        ["Rye & Co. Bakery", "rye-co-bakery"],
        ["  Kiln   Ceramics  ", "kiln-ceramics"],
        ["Meridian_Coaching", "meridian-coaching"],
        ["--Northwind--", "northwind"],
        ["Café Nero", "caf-nero"],
        ["!!!", ""],
    ])("%s → %s", (name, address) => {
        expect(addressFromName(name)).toBe(address);
    });

    it("stops at 57 characters, so test--<address> is still a DNS label", () => {
        expect(addressFromName("a".repeat(80))).toHaveLength(57);
        // The cut never leaves a hyphen at the end.
        expect(addressFromName(`${"a".repeat(56)} bakery`)).toBe(
            "a".repeat(56),
        );
    });
});

describe("what can be typed into the address", () => {
    it("keeps lowercase letters, digits and hyphens as they are typed", () => {
        expect(cleanAddressInput("Rye Co")).toBe("rye-co");
        expect(cleanAddressInput("rye.co!")).toBe("ryeco");
        expect(cleanAddressInput("RYE-2")).toBe("rye-2");
        // A hyphen at the end stays while typing: the next letter follows it.
        expect(cleanAddressInput("rye-")).toBe("rye-");
    });

    it("never shows two hyphens in a row (DEC-071)", () => {
        expect(cleanAddressInput("my--shop")).toBe("my-shop");
        expect(cleanAddressInput("test--rye")).toBe("test-rye");
        expect(cleanAddressInput("a - b")).toBe("a-b");
    });

    it("stops at 57 characters", () => {
        expect(cleanAddressInput("a".repeat(80))).toHaveLength(57);
    });
});
