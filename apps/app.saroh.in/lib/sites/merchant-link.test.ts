import { describe, expect, it } from "vitest";

import { merchantLinkUrl } from "./merchant-link";

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
