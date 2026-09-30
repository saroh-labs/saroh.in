import { describe, expect, it } from "vitest";

import {
    addPageOffers,
    fixedAddress,
    pageMenuMarks,
    pageOptionName,
    unseenBecause,
} from "./page-menu";
import type { Flag, SitePage } from "./service";

const page = (over: Partial<SitePage>): SitePage => ({
    id: "p1",
    path: "/about",
    title: "About",
    isHome: false,
    hidden: false,
    ...over,
});

describe("what Add a page offers (G16)", () => {
    it("offers only what the API lists, in the menu's order", () => {
        expect(
            addPageOffers(["CONTACT", "SHOP", "JOURNAL"]).map((o) => o.label),
        ).toEqual(["Shop", "Journal", "Contact"]);
    });

    it("offers nothing when the API lists nothing, or predates G14", () => {
        expect(addPageOffers([])).toEqual([]);
        expect(addPageOffers(undefined)).toEqual([]);
    });

    it("leaves out a kind this app has no words for", () => {
        expect(addPageOffers(["GALLERY", "BOOK"]).map((o) => o.kind)).toEqual([
            "BOOK",
        ]);
    });
});

describe("a page's address", () => {
    it("is fixed for Home, Book and Shop, and says what it is for", () => {
        expect(fixedAddress(page({ isHome: true, path: "/" }))).toEqual({
            path: "/",
            purpose: "your site's own address",
        });
        expect(fixedAddress(page({ kind: "BOOK", path: "/book" }))).toEqual({
            path: "/book",
            purpose: "your booking page's path",
        });
        expect(
            fixedAddress(page({ kind: "SHOP", path: "/shop" }))?.purpose,
        ).toBe("your online shop's path");
    });

    it("can move for free-form, Prices, Journal and Contact pages", () => {
        for (const kind of ["FREE", "PRICES", "JOURNAL", "CONTACT"] as const) {
            expect(fixedAddress(page({ kind }))).toBeNull();
        }
        // An API older than G14 sends no kind: a free-form page.
        expect(fixedAddress(page({}))).toBeNull();
    });
});

describe("how the page menu marks a page", () => {
    const reserved: Flag = {
        type: "reservedAddress",
        message: "This page can't be seen: /book is your booking page.",
        pageId: "p1",
        sectionIndex: null,
        field: "path",
    };

    it("says Not in menu only when Show in menu is off, never for Home", () => {
        expect(pageMenuMarks(page({ inMenu: false }), []).notInMenu).toBe(true);
        expect(pageMenuMarks(page({}), []).notInMenu).toBe(false);
        expect(
            pageMenuMarks(page({ isHome: true, inMenu: false }), []).notInMenu,
        ).toBe(false);
    });

    it("finds a page at a route's address from the pre-publish check", () => {
        expect(unseenBecause("p1", [reserved])).toBe(reserved.message);
        expect(unseenBecause("p2", [reserved])).toBeNull();
        // The shop's own flag on a section is not about the address.
        expect(
            unseenBecause("p1", [
                { ...reserved, field: null, sectionIndex: 0 },
            ]),
        ).toBeNull();
    });

    it("names an option by its title and every mark", () => {
        const p = page({ hidden: true, inMenu: false });
        expect(pageOptionName(p, pageMenuMarks(p, [reserved]))).toBe(
            "About, hidden from the site, not in menu, can't be seen at its path",
        );
        expect(pageOptionName(page({}), pageMenuMarks(page({}), []))).toBe(
            "About",
        );
    });
});
