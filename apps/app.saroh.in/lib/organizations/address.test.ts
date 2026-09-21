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

    it("stops at the 63 characters a DNS label allows", () => {
        expect(addressFromName("a".repeat(80))).toHaveLength(63);
    });
});

describe("what can be typed into the address", () => {
    it("keeps lowercase letters, digits and hyphens as they are typed", () => {
        expect(cleanAddressInput("Rye Co")).toBe("rye-co");
        expect(cleanAddressInput("rye.co!")).toBe("ryeco");
        expect(cleanAddressInput("RYE-2")).toBe("rye-2");
    });
});
