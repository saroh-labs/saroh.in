import { BadRequestException } from "@nestjs/common";

import {
    assertDetailsCoherent,
    assertMrpAtOrAbovePrice,
    cleanShopFields,
    moneyToCents,
    savingPercent,
} from "./product-rules";

describe("product rules", () => {
    it("reads money strings as whole minor units", () => {
        expect(moneyToCents("799")).toBe(79_900);
        expect(moneyToCents("24.5")).toBe(2_450);
        expect(moneyToCents("0.05")).toBe(5);
    });

    it("refuses an MRP below the price and allows one at or above it", () => {
        expect(() => assertMrpAtOrAbovePrice("799", "700")).toThrow(
            BadRequestException,
        );
        expect(() => assertMrpAtOrAbovePrice("799", "799")).not.toThrow();
        expect(() => assertMrpAtOrAbovePrice("799", "999")).not.toThrow();
        expect(() => assertMrpAtOrAbovePrice("799", null)).not.toThrow();
    });

    it("rounds the saving down and shows none at MRP", () => {
        expect(savingPercent("799", "999")).toBe(20);
        // 1 - 649/999 = 35.03… → 35, never 36
        expect(savingPercent("649", "999")).toBe(35);
        expect(savingPercent("799", "799")).toBeNull();
        expect(savingPercent("799", null)).toBeNull();
    });

    it("keeps only known shop switches, and only booleans", () => {
        expect(cleanShopFields({ howToUse: false, returns: true })).toEqual({
            howToUse: false,
            returns: true,
        });
        expect(() => cleanShopFields({ supplierCode: true })).toThrow(
            BadRequestException,
        );
        expect(() => cleanShopFields({ maker: "yes" })).toThrow(
            BadRequestException,
        );
    });

    it("asks who made it, and for the own returns rule", () => {
        const ok = {
            madeHere: true,
            maker: null,
            returnsMode: "STOREFRONT",
            returnsText: null,
        };
        expect(() => assertDetailsCoherent(ok)).not.toThrow();
        expect(() => assertDetailsCoherent({ ...ok, madeHere: false })).toThrow(
            /who makes it/,
        );
        expect(() =>
            assertDetailsCoherent({ ...ok, madeHere: false, maker: "Kama" }),
        ).not.toThrow();
        expect(() =>
            assertDetailsCoherent({ ...ok, returnsMode: "OWN" }),
        ).toThrow(/returns rule/);
    });
});
