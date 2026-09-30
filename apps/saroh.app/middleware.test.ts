import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { TENANT_HOST_HEADER } from "./lib/pay-host";
import { REQUEST_PATH_HEADER } from "./lib/request-path";
import middleware from "./middleware";

/**
 * The middleware's routing (DEC-069, L6): a pay link on a business's own
 * address is the apex's pay page, told the host; every other tenant path
 * still goes to `[domain]` with its query (`lib/tenant-url.ts`).
 */
function request(url: string, headers: Record<string, string> = {}) {
    const host = new URL(url).host;
    return new NextRequest(url, { headers: { host, ...headers } });
}

/** Where a rewrite serves the request, or null when there is none. */
const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

/** A request header the middleware passed on to the page. */
const passedOn = (res: Response, name: string) =>
    res.headers.get(`x-middleware-request-${name}`);

describe("middleware: pay links on a business's address", () => {
    it("rewrites a tenant /pay/<token> to the apex route, naming the host", () => {
        const res = middleware(
            request("https://northwind.saroh.app/pay/abc?x=1"),
        );
        expect(rewrittenTo(res)).toBe(
            "https://northwind.saroh.app/pay/abc?x=1",
        );
        expect(passedOn(res, TENANT_HOST_HEADER)).toBe("northwind.saroh.app");
    });

    it("rewrites a tenant /pay/o/<token> likewise", () => {
        const res = middleware(request("https://rye.saroh.app/pay/o/abc"));
        expect(rewrittenTo(res)).toBe("https://rye.saroh.app/pay/o/abc");
        expect(passedOn(res, TENANT_HOST_HEADER)).toBe("rye.saroh.app");
    });

    it("names a custom domain's host without its port", () => {
        const res = middleware(
            request("http://shop.rye.in:3005/pay/abc", {
                host: "Shop.Rye.in:3005",
            }),
        );
        expect(passedOn(res, TENANT_HOST_HEADER)).toBe("shop.rye.in");
    });

    it("lets an apex /pay/<token> through untouched", () => {
        const res = middleware(request("https://saroh.app/pay/abc"));
        expect(rewrittenTo(res)).toBeNull();
        expect(res.headers.get("x-middleware-next")).toBe("1");
        expect(passedOn(res, TENANT_HOST_HEADER)).toBeNull();
    });

    it("drops a tenant host a visitor sent to the apex", () => {
        const res = middleware(
            request("https://saroh.app/pay/abc", {
                [TENANT_HOST_HEADER]: "rye.saroh.app",
            }),
        );
        expect(rewrittenTo(res)).toBeNull();
        expect(res.headers.get("x-middleware-override-headers")).not.toContain(
            TENANT_HOST_HEADER,
        );
        expect(passedOn(res, TENANT_HOST_HEADER)).toBeNull();
    });

    it("sends every other tenant path to [domain], query kept", () => {
        const res = middleware(request("https://northwind.saroh.app/pay?x=1"));
        expect(rewrittenTo(res)).toBe(
            "https://northwind.saroh.app/northwind.saroh.app/pay?x=1",
        );
        const shop = middleware(
            request("https://northwind.saroh.app/shop?page=2"),
        );
        expect(rewrittenTo(shop)).toBe(
            "https://northwind.saroh.app/northwind.saroh.app/shop?page=2",
        );
        expect(passedOn(shop, TENANT_HOST_HEADER)).toBeNull();
    });
});

/**
 * The path a tenant page was asked for (DEC-069, L3): the layout needs it
 * to send a visitor on an old address to the same page on the new one.
 */
describe("middleware: the request path on a tenant rewrite", () => {
    it("names the path and query on the rewrite to [domain]", () => {
        const res = middleware(request("https://rye.saroh.app/shop?x=1"));
        expect(rewrittenTo(res)).toBe(
            "https://rye.saroh.app/rye.saroh.app/shop?x=1",
        );
        expect(passedOn(res, REQUEST_PATH_HEADER)).toBe("/shop?x=1");
    });

    it("names the root when that is what was asked for", () => {
        const res = middleware(request("https://rye.saroh.app/"));
        expect(passedOn(res, REQUEST_PATH_HEADER)).toBe("/");
    });

    it("replaces a request path the visitor sent", () => {
        const res = middleware(
            request("https://rye.saroh.app/book", {
                [REQUEST_PATH_HEADER]: "//evil.com",
            }),
        );
        expect(passedOn(res, REQUEST_PATH_HEADER)).toBe("/book");
    });

    it("drops a request path a visitor sent to the apex", () => {
        const res = middleware(
            request("https://saroh.app/", {
                [REQUEST_PATH_HEADER]: "/shop",
            }),
        );
        expect(rewrittenTo(res)).toBeNull();
        expect(passedOn(res, REQUEST_PATH_HEADER)).toBeNull();
    });

    it("leaves a pay page's rewrite without one", () => {
        const res = middleware(request("https://rye.saroh.app/pay/abc"));
        expect(passedOn(res, REQUEST_PATH_HEADER)).toBeNull();
    });
});
