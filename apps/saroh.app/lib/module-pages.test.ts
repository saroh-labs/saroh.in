import { describe, expect, it } from "vitest";

import {
    findModulePage,
    isBookingDeepLink,
    isFreePage,
    moduleLabel,
    moduleOff,
    modulePageStatesOf,
    moduleRoute,
} from "./module-pages";

/**
 * What `/book`, `/shop` and `[slug]` draw for a module page (G15). The routes
 * are thin over these; the four scenes are checked in a browser.
 */

const HOME = { path: "/", title: "Home" };
const ABOUT = { path: "/about", title: "About" };
const BOOK = { path: "/book", title: "Book a class", kind: "BOOK" };
const SHOP = { path: "/shop", title: "Shop", kind: "SHOP" };
const PRICES = { path: "/prices", title: "Prices", kind: "PRICES" };

describe("modulePageStatesOf", () => {
    it("keeps only on and off, by kind", () => {
        expect(
            modulePageStatesOf({ BOOK: "off", SHOP: "on", PRICES: "maybe" }),
        ).toEqual({ BOOK: "off", SHOP: "on" });
    });

    it("reads nothing from an API that predates module pages", () => {
        expect(modulePageStatesOf(undefined)).toBeNull();
        expect(modulePageStatesOf(null)).toBeNull();
        expect(modulePageStatesOf(["BOOK"])).toBeNull();
        expect(modulePageStatesOf("off")).toBeNull();
    });
});

describe("module pages on the live site (G15)", () => {
    it("finds the page of a kind, and only that", () => {
        expect(findModulePage([HOME, BOOK, SHOP], "BOOK")).toBe(BOOK);
        expect(findModulePage([HOME, ABOUT], "BOOK")).toBeNull();
        expect(isFreePage(ABOUT)).toBe(true);
        expect(isFreePage({ path: "/x", kind: "FREE" })).toBe(true);
        expect(isFreePage(PRICES)).toBe(false);
    });

    it("draws a published Book page on a plain /book", () => {
        expect(moduleRoute([HOME, BOOK], { BOOK: "on" }, "BOOK")).toEqual({
            draw: "page",
            page: BOOK,
        });
    });

    it("goes straight into the flow for a service picked on the Book page", () => {
        const deep = isBookingDeepLink({ service: "svc_1" });
        expect(deep).toBe(true);
        expect(moduleRoute([HOME, BOOK], { BOOK: "on" }, "BOOK", deep)).toEqual(
            { draw: "builtin" },
        );
    });

    it("treats a day and time, or a class to move, as the flow too", () => {
        expect(isBookingDeepLink({ date: "2026-10-01", start: "07:00" })).toBe(
            true,
        );
        expect(isBookingDeepLink({ move: "bk_1" })).toBe(true);
        expect(isBookingDeepLink({})).toBe(false);
    });

    it("says it isn't available while Appointments is off, not a 404", () => {
        expect(moduleRoute([HOME, BOOK], { BOOK: "off" }, "BOOK")).toEqual({
            draw: "unavailable",
        });
        // A shared link into the flow lands on the same words.
        expect(
            moduleRoute([HOME, BOOK], { BOOK: "off" }, "BOOK", true),
        ).toEqual({ draw: "unavailable" });
    });

    it("keeps today's /book for a site with no Book page, on or off", () => {
        expect(moduleRoute([HOME, ABOUT], null, "BOOK")).toEqual({
            draw: "builtin",
        });
        expect(moduleRoute([HOME, ABOUT], { BOOK: "off" }, "BOOK")).toEqual({
            draw: "builtin",
        });
    });

    it("draws a published Shop page's sections, not the built-in grid", () => {
        expect(moduleRoute([HOME, SHOP], { SHOP: "on" }, "SHOP")).toEqual({
            draw: "page",
            page: SHOP,
        });
    });

    it("shows a module page whose state isn't known: it never guesses off", () => {
        expect(moduleRoute([HOME, BOOK], null, "BOOK")).toEqual({
            draw: "page",
            page: BOOK,
        });
        expect(moduleRoute([HOME, BOOK], { SHOP: "off" }, "BOOK")).toEqual({
            draw: "page",
            page: BOOK,
        });
    });

    it("titles /book after the Book page, else the route's word", () => {
        expect(moduleLabel([HOME, BOOK], "BOOK", "Book")).toBe("Book a class");
        expect(moduleLabel([HOME], "BOOK", "Book")).toBe("Book");
        expect(moduleLabel([{ ...SHOP, title: "  " }], "SHOP", "Shop")).toBe(
            "Shop",
        );
    });

    it("takes a Prices page off while its module is off; never a free-form page", () => {
        expect(moduleOff(PRICES, { PRICES: "off" })).toBe(true);
        expect(moduleOff(PRICES, { PRICES: "on" })).toBe(false);
        expect(moduleOff(PRICES, null)).toBe(false);
        expect(moduleOff(ABOUT, { PRICES: "off" })).toBe(false);
    });
});
