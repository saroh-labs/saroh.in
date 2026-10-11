import { describe, expect, it } from "vitest";

import { code } from "./fixtures.test-data";
import { initialsOf, pickShareSite } from "./pick";
import {
    buildQrTargets,
    findReusable,
    findTarget,
    pagePath,
    publishedFreePages,
    searchTargets,
    targetAddress,
    targetKey,
    targetOfCode,
} from "./targets";

const ORIGIN = "https://glow.saroh.app";
const PRODUCTS = [
    { id: "p1", name: "Argan shampoo", slug: "argan-shampoo" },
    { id: "p2", name: "Hair oil", slug: "hair oil" },
];
const PAGES = [{ id: "pg1", title: "Price list", path: "/prices" }];

describe("buildQrTargets", () => {
    it("offers the real pages, most useful first", () => {
        const { main, more } = buildQrTargets({
            origin: ORIGIN,
            links: { shop: `${ORIGIN}/shop`, book: `${ORIGIN}/book` },
            products: PRODUCTS,
            pages: PAGES,
        });
        expect(main.map((t) => [t.key, t.name, t.address])).toEqual([
            ["BOOK", "Booking page", "glow.saroh.app/book"],
            ["SHOP", "Online shop", "glow.saroh.app/shop"],
            ["SITE", "Website", "glow.saroh.app"],
        ]);
        // Products, then pages, behind "More…".
        expect(more.map((t) => [t.key, t.address])).toEqual([
            ["PRODUCT:p1", "glow.saroh.app/shop/argan-shampoo"],
            ["PRODUCT:p2", "glow.saroh.app/shop/hair%20oil"],
            ["PAGE:pg1", "glow.saroh.app/prices"],
        ]);
    });

    it("never offers a page nobody can open", () => {
        const { main, more } = buildQrTargets({
            origin: ORIGIN,
            links: { shop: null, book: null },
            products: PRODUCTS,
            pages: PAGES,
        });
        expect(main.map((t) => t.key)).toEqual(["SITE"]);
        // A product opens only while the shop does; a page still does.
        expect(more.map((t) => t.key)).toEqual(["PAGE:pg1"]);
    });

    it("offers only the website when the links aren't known", () => {
        const { main, more } = buildQrTargets({
            origin: ORIGIN,
            links: null,
            products: null,
            pages: [],
        });
        expect(main.map((t) => t.key)).toEqual(["SITE"]);
        expect(more).toEqual([]);
    });

    it("writes the address on a custom domain as the merchant reads it", () => {
        const { main } = buildQrTargets({
            origin: "https://glowstudio.in/",
            links: { shop: null, book: "https://glowstudio.in/book" },
            products: null,
            pages: [],
        });
        expect(main[0]?.address).toBe("glowstudio.in/book");
        expect(main[1]?.address).toBe("glowstudio.in");
    });
});

describe("publishedFreePages", () => {
    const pages = [
        { id: "h", title: "Home", path: "/", isHome: true, hidden: false },
        {
            id: "a",
            title: "About",
            path: "about/",
            isHome: false,
            hidden: false,
        },
        {
            id: "b",
            title: "Draft",
            path: "/draft",
            isHome: false,
            hidden: false,
        },
        {
            id: "c",
            title: "Hidden",
            path: "/hidden",
            isHome: false,
            hidden: true,
        },
        {
            id: "d",
            title: "Shop",
            path: "/shop",
            isHome: false,
            hidden: false,
            kind: "SHOP",
        },
    ];

    it("keeps free-form pages the published site holds, not the home page", () => {
        expect(
            publishedFreePages(pages, ["/", "/about", "/hidden", "/shop"]),
        ).toEqual([{ id: "a", title: "About", path: "/about" }]);
    });

    it("offers none while what is published isn't known", () => {
        expect(publishedFreePages(pages, null)).toEqual([]);
    });

    it("reads a path the way the published site holds it", () => {
        expect(pagePath("about/")).toBe("/about");
        expect(pagePath("")).toBe("/");
        expect(targetAddress(null, "/book")).toBe("/book");
    });
});

describe("search and lookup", () => {
    const targets = buildQrTargets({
        origin: ORIGIN,
        links: { shop: `${ORIGIN}/shop`, book: null },
        products: PRODUCTS,
        pages: PAGES,
    });

    it("finds by name or by address", () => {
        expect(searchTargets(targets.more, "ARGAN").map((t) => t.key)).toEqual([
            "PRODUCT:p1",
        ]);
        expect(
            searchTargets(targets.more, "/prices").map((t) => t.key),
        ).toEqual(["PAGE:pg1"]);
        expect(searchTargets(targets.more, "  ")).toHaveLength(3);
        expect(searchTargets(targets.more, "zzz")).toEqual([]);
    });

    it("finds a target by its key in either list", () => {
        expect(findTarget(targets, "SHOP")?.name).toBe("Online shop");
        expect(findTarget(targets, "PAGE:pg1")?.name).toBe("Price list");
        expect(findTarget(targets, "PRODUCT:gone")).toBeNull();
        expect(findTarget(targets, null)).toBeNull();
    });

    it("draws a saved code's target even when it is no longer offered", () => {
        const gone = code({
            target: {
                kind: "PRODUCT",
                ref: "old",
                name: "A product no longer in your shop",
                path: null,
                missing: true,
            },
        });
        expect(targetOfCode(gone, ORIGIN)).toEqual({
            key: "PRODUCT:old",
            kind: "PRODUCT",
            ref: "old",
            name: "A product no longer in your shop",
            address: "glow.saroh.app",
        });
    });
});

describe("findReusable", () => {
    const counter = code({ code: "aaa" });
    const mirror = code({ code: "bbb", place: "MIRROR" });
    const retired = code({ code: "ccc", place: "FLYER", retired: true });
    const desk = code({ code: "ddd", place: "OTHER", placeNote: "Front desk" });
    const all = [counter, mirror, retired, desk];
    const BOOK = targetKey("BOOK", null);

    it("selects the code already made for the target and place", () => {
        expect(
            findReusable(all, { targetKey: BOOK, place: "COUNTER" })?.code,
        ).toBe("aaa");
        expect(
            findReusable(all, { targetKey: BOOK, place: "MIRROR" })?.code,
        ).toBe("bbb");
    });

    it("never reuses a retired code, another target or another place", () => {
        expect(
            findReusable(all, { targetKey: BOOK, place: "FLYER" }),
        ).toBeNull();
        expect(
            findReusable(all, { targetKey: "SITE", place: "COUNTER" }),
        ).toBeNull();
        expect(
            findReusable(all, { targetKey: BOOK, place: "CARD" }),
        ).toBeNull();
    });

    it("matches Other only on the same few words", () => {
        expect(
            findReusable(all, {
                targetKey: BOOK,
                place: "OTHER",
                placeNote: " front DESK ",
            })?.code,
        ).toBe("ddd");
        expect(
            findReusable(all, {
                targetKey: BOOK,
                place: "OTHER",
                placeNote: "Window",
            }),
        ).toBeNull();
    });

    it("takes the newest of two", () => {
        const newer = code({ code: "new" });
        expect(
            findReusable([newer, counter], {
                targetKey: BOOK,
                place: "COUNTER",
            })?.code,
        ).toBe("new");
    });
});

describe("which site, and the initials", () => {
    const sites = [
        { id: "s1", subdomain: "glow-events" },
        { id: "s2", subdomain: "glow" },
    ];

    it("works on the site at the business's web address", () => {
        expect(pickShareSite(sites, "glow")?.id).toBe("s2");
    });

    it("falls back to the first site, as Website does", () => {
        expect(pickShareSite(sites, null)?.id).toBe("s1");
        expect(pickShareSite(sites, "elsewhere")?.id).toBe("s1");
        expect(pickShareSite([], "glow")).toBeNull();
    });

    it("makes two letters of a name", () => {
        expect(initialsOf("Glow Studio")).toBe("GS");
        expect(initialsOf("  rye & co. ")).toBe("RC");
        expect(initialsOf("Northwind")).toBe("NO");
        expect(initialsOf("")).toBe("");
    });
});
