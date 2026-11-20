// The addresses a page can't have (round-2 G14), and `/pay` among them now
// that pay links live on the business's own site (DEC-069, plan L7).
import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
    RESERVED_PAGE_PATHS,
    reservedAgainst,
    reservedPathFor,
} from "./page-kinds";

describe("reserved page addresses", () => {
    it("reserves /pay, saying what it is in the merchant's words", () => {
        expect(RESERVED_PAGE_PATHS).toContainEqual(
            expect.objectContaining({
                root: "/pay",
                kind: null,
                purpose: "where your customers pay a link you sent",
            }),
        );
    });

    it.each(["/pay", "/pay/", "/PAY", "/pay/abc", "/pay/o/abc"])(
        "finds %s under /pay",
        (path) => {
            expect(reservedPathFor(path)?.root).toBe("/pay");
        },
    );

    it.each(["/payments", "/pay-now", "/paying/you", "/about/pay"])(
        "leaves %s free",
        (path) => {
            expect(reservedPathFor(path)).toBeNull();
        },
    );

    it("keeps /pay from every kind of page, since no module page lives there", () => {
        for (const kind of ["FREE", "SHOP", "BOOK", "PRICES"] as const) {
            expect(reservedAgainst("/pay", kind)).toBe(true);
        }
    });

    it("reserves /q, where a QR code's short link opens", () => {
        expect(RESERVED_PAGE_PATHS).toContainEqual(
            expect.objectContaining({
                root: "/q",
                kind: null,
                purpose: "where your QR codes open",
            }),
        );
        for (const path of ["/q", "/Q", "/q/", "/q/h7c", "/q/h7c/more"]) {
            expect(reservedPathFor(path)?.root).toBe("/q");
        }
        for (const kind of ["FREE", "SHOP", "BOOK", "CONTACT"] as const) {
            expect(reservedAgainst("/q", kind)).toBe(true);
            expect(reservedAgainst("/q/h7c", kind)).toBe(true);
        }
    });

    it.each(["/qr", "/quotes", "/q-and-a", "/about/q"])(
        "leaves %s free beside /q",
        (path) => {
            expect(reservedPathFor(path)).toBeNull();
        },
    );

    it("still lets the Book page sit at /book", () => {
        expect(reservedAgainst("/book", "BOOK")).toBe(false);
        expect(reservedAgainst("/book", "FREE")).toBe(true);
    });

    it("reserves every built-in route of the merchant site (apps/saroh.app)", () => {
        // A page there is hidden behind the route, and a forward from it
        // never takes effect: the route wins. Dynamic segments ([slug]) and
        // files the site serves (robots.txt, sitemap.xml, …) are not pages.
        const routes = readdirSync(
            join(__dirname, "../../../../saroh.app/app/[domain]"),
            { withFileTypes: true },
        )
            .filter((d) => d.isDirectory())
            .map((d) => d.name)
            .filter((name) => !name.startsWith("[") && !name.includes("."));
        expect(routes.length).toBeGreaterThan(0);
        for (const route of routes) {
            expect(reservedPathFor(`/${route}`)?.root).toBe(`/${route}`);
        }
    });
});
