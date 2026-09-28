import { BadRequestException } from "@nestjs/common";

import {
    NAVIGATION_MAX_ITEMS,
    parseSiteNavigation,
    resolveSiteNavigation,
} from "./site-navigation";

describe("parseSiteNavigation", () => {
    it("keeps the merchant's order, and a label only when one was written", () => {
        expect(
            parseSiteNavigation({
                items: [{ pageId: "b", label: " Our story " }, { pageId: "a" }],
            }),
        ).toEqual({
            items: [{ pageId: "b", label: "Our story" }, { pageId: "a" }],
        });
    });

    it("treats no entries as no menu, and collapses a repeated page to its first slot", () => {
        expect(parseSiteNavigation(null)).toBeNull();
        expect(parseSiteNavigation({ items: [] })).toBeNull();
        expect(
            parseSiteNavigation({ items: [{ pageId: "a" }, { pageId: "a" }] }),
        ).toEqual({ items: [{ pageId: "a" }] });
    });

    it("rejects a malformed shape rather than storing nothing", () => {
        expect(() => parseSiteNavigation("nope")).toThrow(BadRequestException);
        expect(() => parseSiteNavigation({ items: [{ label: "x" }] })).toThrow(
            BadRequestException,
        );
        expect(() =>
            parseSiteNavigation({
                items: Array.from(
                    { length: NAVIGATION_MAX_ITEMS + 1 },
                    (_, i) => ({
                        pageId: `p${i}`,
                    }),
                ),
            }),
        ).toThrow(BadRequestException);
    });
});

describe("resolveSiteNavigation", () => {
    const pages = [
        { id: "home", path: "/", title: "Home" },
        { id: "about", path: "/about", title: "About" },
    ];

    it("resolves ids to paths and default labels, and drops a page not being published", () => {
        expect(
            resolveSiteNavigation(
                {
                    items: [
                        { pageId: "about", label: "Story" },
                        { pageId: "home" },
                        { pageId: "hidden" },
                    ],
                },
                pages,
            ),
        ).toEqual([
            { label: "Story", href: "/about" },
            { label: "Home", href: "/" },
        ]);
    });

    it("is empty for no menu", () => {
        expect(resolveSiteNavigation(null, pages)).toEqual([]);
    });
});

describe("resolveSiteNavigation with module pages (G14)", () => {
    const pages = [
        { id: "home", path: "/", title: "Home", kind: "FREE" },
        { id: "about", path: "/about", title: "About", kind: "FREE" },
        { id: "contact", path: "/contact", title: "Contact", kind: "CONTACT" },
        { id: "book", path: "/book", title: "Book", kind: "BOOK" },
        { id: "prices", path: "/prices", title: "Prices", kind: "PRICES" },
        { id: "journal", path: "/journal", title: "Journal", kind: "JOURNAL" },
    ];

    it("puts module pages after the menu's own entries, in the kinds' order", () => {
        expect(
            resolveSiteNavigation({ items: [{ pageId: "home" }] }, pages),
        ).toEqual([
            { label: "Home", href: "/" },
            { label: "Book", href: "/book", kind: "BOOK" },
            { label: "Prices", href: "/prices", kind: "PRICES" },
            { label: "Journal", href: "/journal", kind: "JOURNAL" },
            { label: "Contact", href: "/contact", kind: "CONTACT" },
        ]);
    });

    it("keeps a module page where the menu puts it, named by its title", () => {
        expect(
            resolveSiteNavigation(
                {
                    items: [
                        { pageId: "contact", label: "Old label" },
                        { pageId: "home" },
                    ],
                },
                pages.filter((p) => p.kind !== "BOOK" && p.kind !== "PRICES"),
            ),
        ).toEqual([
            // The title is also the menu name.
            { label: "Contact", href: "/contact", kind: "CONTACT" },
            { label: "Home", href: "/" },
            { label: "Journal", href: "/journal", kind: "JOURNAL" },
        ]);
    });

    it("renames the menu entry when the page's title changes", () => {
        const renamed = pages.map((p) =>
            p.id === "book" ? { ...p, title: "Classes" } : p,
        );
        expect(resolveSiteNavigation(null, renamed)).toContainEqual({
            label: "Classes",
            href: "/book",
            kind: "BOOK",
        });
    });

    it("leaves out any page with Show in menu off, though it is still published", () => {
        const off = pages.map((p) =>
            p.id === "about" || p.id === "book" ? { ...p, inMenu: false } : p,
        );
        const menu = resolveSiteNavigation(
            {
                items: [
                    { pageId: "home" },
                    { pageId: "about" },
                    { pageId: "book" },
                ],
            },
            off,
        );
        expect(menu.map((i) => i.href)).toEqual([
            "/",
            "/prices",
            "/journal",
            "/contact",
        ]);
    });

    it("tags every module page with its kind, hand-listed or not, so the site can drop it while its module is off (G19)", () => {
        const menu = resolveSiteNavigation(
            {
                items: [
                    { pageId: "home" },
                    { pageId: "book", label: "Classes" },
                    { pageId: "about" },
                ],
            },
            pages,
        );
        // The menu's own order, then the module pages it didn't list.
        expect(menu).toEqual([
            { label: "Home", href: "/" },
            { label: "Book", href: "/book", kind: "BOOK" },
            { label: "About", href: "/about" },
            { label: "Prices", href: "/prices", kind: "PRICES" },
            { label: "Journal", href: "/journal", kind: "JOURNAL" },
            { label: "Contact", href: "/contact", kind: "CONTACT" },
        ]);
        // Only the free-form entries carry no kind: nothing gates them.
        expect(menu.filter((i) => !i.kind).map((i) => i.href)).toEqual([
            "/",
            "/about",
        ]);
    });

    it("keeps a hand-made entry to a free-form page, even one at /shop, ungated (G19)", () => {
        // A site that never added module pages, whose own page sits at /shop
        // (served there as before, G11): it is the merchant's page, not the
        // shop, and no module takes it out of the menu.
        const legacy = [
            { id: "home", path: "/", title: "Home", kind: "FREE" },
            { id: "shop", path: "/shop", title: "Our shop", kind: "FREE" },
        ];
        expect(
            resolveSiteNavigation(
                { items: [{ pageId: "home" }, { pageId: "shop" }] },
                legacy,
            ),
        ).toEqual([
            { label: "Home", href: "/" },
            { label: "Our shop", href: "/shop" },
        ]);
    });

    it("is what it was for a site with no module pages", () => {
        const free = pages.filter((p) => p.kind === "FREE");
        expect(resolveSiteNavigation(null, free)).toEqual([]);
        expect(
            resolveSiteNavigation(
                { items: [{ pageId: "about", label: "Story" }] },
                free,
            ),
        ).toEqual([{ label: "Story", href: "/about" }]);
    });
});
