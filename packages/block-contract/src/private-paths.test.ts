import { describe, expect, it } from "vitest";

import {
    isPrivateSitePath,
    PRIVATE_PATH_PREFIXES,
    sitePagePathOf,
} from "./private-paths";

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

describe("a site page's path as an event keeps it (DEC-235)", () => {
    it("keeps the path alone: no query, no fragment, no trailing slash", () => {
        expect(sitePagePathOf("/bridal?ref=diwali-post#prices")).toBe(
            "/bridal",
        );
        expect(sitePagePathOf("/bridal/")).toBe("/bridal");
        expect(sitePagePathOf("/")).toBe("/");
        expect(sitePagePathOf("/?x=1")).toBe("/");
        expect(sitePagePathOf("/shop/silk-saree")).toBe("/shop/silk-saree");
    });

    it("refuses anything that isn't a site path", () => {
        for (const bad of [
            undefined,
            null,
            42,
            "",
            "bridal",
            "https://example.com/bridal",
            "//example.com/bridal",
            "/a b",
            "/a\\b",
            "/a\nb",
            `/${"a".repeat(2048)}`,
        ]) {
            expect(sitePagePathOf(bad)).toBeNull();
        }
    });

    it("never keeps a private page or the account area, as the trackers never load there", () => {
        for (const path of [
            "/account",
            "/account/",
            "/account/bookings/abc",
            "/checkout",
            "/shop/order/abc",
            "/pay/tok",
            "/book/claim/tok?x=1",
            "/q/abc",
        ]) {
            expect(sitePagePathOf(path)).toBeNull();
        }
        expect(sitePagePathOf("/book")).toBe("/book");
        expect(sitePagePathOf("/accounts-help")).toBe("/accounts-help");
    });
});
