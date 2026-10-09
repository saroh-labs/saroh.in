import { describe, expect, it } from "vitest";

import { notFoundSecondary } from "./not-found-ways";

const HOME = { path: "/", kind: null };
const CONTACT = { path: "/get-in-touch", kind: "CONTACT" };

describe("notFoundSecondary", () => {
    it("offers the shop while it serves", () => {
        expect(
            notFoundSecondary({
                pages: [HOME, CONTACT],
                modules: null,
                shopServes: true,
            }),
        ).toEqual({ href: "/shop", label: "Browse the shop" });
    });

    it("else the Contact page, at the merchant's own address", () => {
        expect(
            notFoundSecondary({
                pages: [HOME, CONTACT],
                modules: { CONTACT: "on" },
                shopServes: false,
            }),
        ).toEqual({ href: "/get-in-touch", label: "Contact us" });
    });

    it("a free-form page at /contact counts", () => {
        expect(
            notFoundSecondary({
                pages: [HOME, { path: "/contact/" }],
                modules: null,
                shopServes: false,
            }),
        ).toEqual({ href: "/contact/", label: "Contact us" });
    });

    it("never a Contact page whose module is off", () => {
        expect(
            notFoundSecondary({
                pages: [HOME, CONTACT],
                modules: { CONTACT: "off" },
                shopServes: false,
            }),
        ).toBeNull();
    });

    it("nothing when the site has neither", () => {
        expect(
            notFoundSecondary({
                pages: [HOME, { path: "/about" }],
                modules: null,
                shopServes: false,
            }),
        ).toBeNull();
    });
});
