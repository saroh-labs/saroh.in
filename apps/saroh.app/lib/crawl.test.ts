import { describe, expect, it } from "vitest";

import type { SitemapSource } from "./crawl";
import {
    requestOrigin,
    robotsTxt,
    SITEMAP_URL_LIMIT,
    sitemapPaths,
    sitemapXml,
} from "./crawl";
import { isPrivateSitePath } from "./private-paths";

const base: SitemapSource = {
    origin: "https://rye.saroh.app",
    pages: [],
    modules: null,
    postsPrefix: "blog",
    postSlugs: [],
    productSlugs: null,
};

describe("sitemapPaths (#890)", () => {
    it("lists pages, posts under the site's prefix, and an open shop's products", () => {
        const paths = sitemapPaths({
            ...base,
            pages: [{ path: "/" }, { path: "/about" }, { path: "/visit/" }],
            postsPrefix: "journal",
            postSlugs: ["first-loaf", "rye & honey"],
            productSlugs: ["sourdough", "baguette", "rye", "focaccia"],
        });
        expect(paths).toEqual([
            "/",
            "/about",
            "/visit",
            "/journal",
            "/journal/first-loaf",
            "/journal/rye%20%26%20honey",
            "/shop",
            "/shop/sourdough",
            "/shop/baguette",
            "/shop/rye",
            "/shop/focaccia",
        ]);
    });

    it("lists no products while the shop is closed, and no posts index without posts", () => {
        const paths = sitemapPaths({ ...base, pages: [{ path: "/about" }] });
        expect(paths).toEqual(["/", "/about"]);
    });

    it("leaves out a module page whose module is off", () => {
        const paths = sitemapPaths({
            ...base,
            pages: [
                { path: "/prices", kind: "PRICES" },
                { path: "/contact", kind: "CONTACT" },
            ],
            modules: { PRICES: "off", CONTACT: "on" },
        });
        expect(paths).toEqual(["/", "/contact"]);
    });

    it("never lists a private page, whatever the snapshot says", () => {
        const paths = sitemapPaths({
            ...base,
            pages: [{ path: "/account" }, { path: "/checkout/x" }],
        });
        expect(paths).toEqual(["/"]);
    });

    it("stops at Google's limit for one sitemap", () => {
        const productSlugs = Array.from(
            { length: SITEMAP_URL_LIMIT + 10 },
            (_, i) => `p${i}`,
        );
        expect(sitemapPaths({ ...base, productSlugs })).toHaveLength(
            SITEMAP_URL_LIMIT,
        );
    });
});

describe("sitemapXml", () => {
    it("writes absolute, escaped addresses on the origin it was asked on", () => {
        const xml = sitemapXml("https://shop.rye.in", ["/", "/a?b=1&c=2"]);
        expect(xml).toContain("<loc>https://shop.rye.in/</loc>");
        expect(xml).toContain("<loc>https://shop.rye.in/a?b=1&amp;c=2</loc>");
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
            true,
        );
    });
});

describe("robotsTxt", () => {
    it("keeps crawlers out of private pages and names the sitemap", () => {
        const text = robotsTxt("https://rye.saroh.app");
        for (const path of [
            "/account",
            "/checkout",
            "/autopay",
            "/shop/order",
            "/pay",
        ]) {
            expect(text).toContain(`Disallow: ${path}\n`);
        }
        expect(text).toContain("Sitemap: https://rye.saroh.app/sitemap.xml");
    });
});

describe("requestOrigin", () => {
    it("is https unless the proxy says http, on the host asked for", () => {
        expect(requestOrigin(new Headers({ host: "Shop.Rye.in" }))).toBe(
            "https://shop.rye.in",
        );
        expect(
            requestOrigin(
                new Headers({
                    host: "rye.saroh.app.localhost",
                    "x-forwarded-proto": "http",
                }),
            ),
        ).toBe("http://rye.saroh.app.localhost");
        expect(requestOrigin(new Headers())).toBeNull();
    });
});

describe("isPrivateSitePath", () => {
    it("matches the private pages and what sits under them, nothing else", () => {
        expect(isPrivateSitePath("/account")).toBe(true);
        expect(isPrivateSitePath("/account/orders")).toBe(true);
        expect(isPrivateSitePath("/shop/order/abc")).toBe(true);
        expect(isPrivateSitePath("/shop")).toBe(false);
        expect(isPrivateSitePath("/shop/orderly-tea")).toBe(false);
        expect(isPrivateSitePath("/payments-info")).toBe(false);
    });
});
