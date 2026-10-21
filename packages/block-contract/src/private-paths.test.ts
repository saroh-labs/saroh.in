import { describe, expect, it } from "vitest";

import { isPrivateSitePath, PRIVATE_PATH_PREFIXES } from "./private-paths";

describe("the private pages of a merchant's site", () => {
    it("holds every page about one customer", () => {
        expect(PRIVATE_PATH_PREFIXES).toEqual(
            expect.arrayContaining([
                "/account",
                "/checkout",
                "/shop/order",
                "/pay",
                "/book/claim",
            ]),
        );
    });

    it("matches a prefix and what is under it, never a longer word", () => {
        expect(isPrivateSitePath("/account")).toBe(true);
        expect(isPrivateSitePath("/account/orders/abc")).toBe(true);
        expect(isPrivateSitePath("/shop/order/c123")).toBe(true);
        expect(isPrivateSitePath("/q/abc")).toBe(true);
        expect(isPrivateSitePath("/quotes")).toBe(false);
        expect(isPrivateSitePath("/payments-info")).toBe(false);
        expect(isPrivateSitePath("/book")).toBe(false);
        expect(isPrivateSitePath("/shop")).toBe(false);
    });
});
