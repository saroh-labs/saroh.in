import { describe, expect, it } from "vitest";

import { merchantLinkUrl, previewLinkTarget } from "./merchant-link";

const SITE = "northwind.saroh.app";

describe("where a link on the merchant's page goes", () => {
    it.each([
        ["/about", "https://northwind.saroh.app/about"],
        ["about", "https://northwind.saroh.app/about"],
        ["/", "https://northwind.saroh.app/"],
        ["#menu", "https://northwind.saroh.app/#menu"],
        ["/products?sort=new", "https://northwind.saroh.app/products?sort=new"],
    ])("%s → their own site", (href, expected) => {
        expect(merchantLinkUrl(href, SITE)).toBe(expected);
    });

    it.each([
        "https://example.com/menu",
        "http://example.com",
        "mailto:hello@northwind.in",
        "tel:+919800000000",
    ])("%s is left as written", (href) => {
        expect(merchantLinkUrl(href, SITE)).toBe(href);
    });

    it("gives a protocol-relative link a scheme", () => {
        expect(merchantLinkUrl("//cdn.example.com/a", SITE)).toBe(
            "https://cdn.example.com/a",
        );
    });

    it.each(["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x"])(
        "never opens %s",
        (href) => {
            expect(merchantLinkUrl(href, SITE)).toBeNull();
        },
    );

    it("has nowhere to send a relative link before the site has an address", () => {
        expect(merchantLinkUrl("/about", null)).toBeNull();
        expect(merchantLinkUrl("https://example.com", null)).toBe(
            "https://example.com",
        );
    });

    it("accepts an address written with a scheme or a trailing slash", () => {
        expect(merchantLinkUrl("/a", "https://northwind.saroh.app/")).toBe(
            "https://northwind.saroh.app/a",
        );
    });

    it("ignores an empty link", () => {
        expect(merchantLinkUrl("", SITE)).toBeNull();
        expect(merchantLinkUrl(undefined, SITE)).toBeNull();
    });
});

describe("where a link clicked in Preview goes (G5)", () => {
    const home = { id: "home", path: "/" };
    const about = { id: "about", path: "/about" };
    const pages = [home, about];

    it.each([
        ["/about", about],
        ["about", about],
        ["/about/", about],
        ["/about?ref=menu#team", about],
        ["/", home],
        ["https://northwind.saroh.app/about", about],
        ["HTTPS://NORTHWIND.SAROH.APP/", home],
    ])("%s → that page in the editor", (href, page) => {
        expect(previewLinkTarget(href, pages, SITE)).toEqual({
            kind: "page",
            page,
        });
    });

    it("reads an anchor as a place on the page shown", () => {
        expect(previewLinkTarget("#menu", pages, SITE)).toEqual({
            kind: "anchor",
            id: "menu",
        });
        expect(previewLinkTarget("#", pages, SITE)).toBeNull();
    });

    it.each([
        "https://example.com/about",
        "//example.com/about",
        "mailto:hello@northwind.in",
        "tel:+919800000000",
        "javascript:alert(1)",
        "/book",
        "/journal/first-post",
    ])("%s → not a page here; opened as merchantLinkUrl says", (href) => {
        expect(previewLinkTarget(href, pages, SITE)).toBeNull();
    });

    it("finds the site's own address only when it has one", () => {
        expect(
            previewLinkTarget("https://northwind.saroh.app/about", pages, null),
        ).toBeNull();
        // A relative link is still one of its pages.
        expect(previewLinkTarget("/about", pages, null)).toEqual({
            kind: "page",
            page: about,
        });
    });

    it("ignores an empty link", () => {
        expect(previewLinkTarget("", pages, SITE)).toBeNull();
        expect(previewLinkTarget(undefined, pages, SITE)).toBeNull();
    });
});
