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
