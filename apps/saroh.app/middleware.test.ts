import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { TENANT_HOST_HEADER } from "./lib/pay-host";
import { REQUEST_PATH_HEADER } from "./lib/request-path";
import {
    TEST_GATE_HEADER,
    TEST_GATE_PATH,
    TEST_RELEASE_COOKIE,
    TEST_RELEASE_HEADER,
} from "./lib/test-host";
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

    it("rewrites a tenant /pay/<token>/pdf to the apex route too (DEC-083)", () => {
        const res = middleware(
            request("https://northwind.saroh.app/pay/abc/pdf"),
        );
        expect(rewrittenTo(res)).toBe(
            "https://northwind.saroh.app/pay/abc/pdf",
        );
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

describe("middleware: a test release's host (DEC-071, T5)", () => {
    const HOST = "https://test--northwind.saroh.app";
    const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";

    it("moves ?release= into the host-only cookie and redirects without it", () => {
        const res = middleware(request(`${HOST}/shop?release=${TOKEN}&page=2`));
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(`${HOST}/shop?page=2`);
        const cookie = res.headers.get("set-cookie") ?? "";
        expect(cookie).toContain(`${TEST_RELEASE_COOKIE}=${TOKEN}`);
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/Secure/i);
        expect(cookie).toMatch(/SameSite=Lax/i);
        expect(cookie).toMatch(/Path=\//i);
        expect(cookie).not.toMatch(/Domain=/i);
        expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    });

    it("sets no cookie for a token that isn't shaped like one", () => {
        const res = middleware(request(`${HOST}/?release=%3Cscript%3E`));
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(`${HOST}/`);
        expect(res.headers.get("set-cookie")).toBeNull();
    });

    it("redirects to the scheme and port the visitor used, behind a proxy", () => {
        const res = middleware(
            request(
                `http://test--northwind.saroh.app.localhost:4012/?release=${TOKEN}`,
                {
                    host: "test--northwind.saroh.app.localhost",
                    "x-forwarded-proto": "https",
                },
            ),
        );
        expect(res.headers.get("location")).toBe(
            "https://test--northwind.saroh.app.localhost/",
        );
        const bare = middleware(
            request(`http://test--northwind.localhost:3005/?release=${TOKEN}`),
        );
        expect(bare.headers.get("location")).toBe(
            "http://test--northwind.localhost:3005/",
        );
    });

    it("passes the cookie's token on to the site, and strips a forged header", () => {
        const res = middleware(
            request(`${HOST}/book`, {
                cookie: `${TEST_RELEASE_COOKIE}=${TOKEN}`,
                [TEST_RELEASE_HEADER]: "forged-token-forged-token-forged",
            }),
        );
        expect(rewrittenTo(res)).toBe(`${HOST}/test--northwind.saroh.app/book`);
        expect(passedOn(res, TEST_RELEASE_HEADER)).toBe(TOKEN);
        expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    });

    it("rewrites to the gate without a cookie, whatever header was sent", () => {
        const res = middleware(
            request(`${HOST}/about`, { [TEST_RELEASE_HEADER]: TOKEN }),
        );
        expect(new URL(rewrittenTo(res) ?? "").pathname).toBe(TEST_GATE_PATH);
        expect(passedOn(res, TEST_RELEASE_HEADER)).toBeNull();
        expect(passedOn(res, TEST_GATE_HEADER)).toBe("1");
        expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    });

    it("has no pay pages", () => {
        const res = middleware(
            request(`${HOST}/pay/abc`, {
                cookie: `${TEST_RELEASE_COOKIE}=${TOKEN}`,
            }),
        );
        expect(res.status).toBe(404);
        expect(rewrittenTo(res)).toBeNull();
    });

    it("strips a forged test header on a live host and on the apex", () => {
        const live = middleware(
            request("https://northwind.saroh.app/", {
                [TEST_RELEASE_HEADER]: TOKEN,
                [TEST_GATE_HEADER]: "1",
            }),
        );
        expect(rewrittenTo(live)).toBe(
            "https://northwind.saroh.app/northwind.saroh.app/",
        );
        expect(passedOn(live, TEST_RELEASE_HEADER)).toBeNull();
        expect(passedOn(live, TEST_GATE_HEADER)).toBeNull();
        expect(live.headers.get("x-robots-tag")).toBeNull();

        const apex = middleware(
            request("https://saroh.app/test-release-gate", {
                [TEST_GATE_HEADER]: "1",
            }),
        );
        expect(passedOn(apex, TEST_GATE_HEADER)).toBeNull();
        expect(
            apex.headers.get("x-middleware-override-headers") ?? "",
        ).not.toContain(TEST_GATE_HEADER);
    });

    it("never sets a test cookie on a live host", () => {
        const res = middleware(
            request(`https://northwind.saroh.app/?release=${TOKEN}`),
        );
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(rewrittenTo(res)).toBe(
            `https://northwind.saroh.app/northwind.saroh.app/?release=${TOKEN}`,
        );
    });
});

describe("middleware: a site's crawl files (#890)", () => {
    it("lists robots.txt and sitemap.xml in the matcher, past the dotted-path rule", async () => {
        const { config } = await import("./middleware");
        expect(config.matcher).toContain("/robots.txt");
        expect(config.matcher).toContain("/sitemap.xml");
    });

    it("rewrites a live host's sitemap.xml and robots.txt to the tenant routes", () => {
        expect(
            rewrittenTo(
                middleware(request("https://rye.saroh.app/sitemap.xml")),
            ),
        ).toBe("https://rye.saroh.app/rye.saroh.app/sitemap.xml");
        expect(
            rewrittenTo(middleware(request("https://shop.rye.in/robots.txt"))),
        ).toBe("https://shop.rye.in/shop.rye.in/robots.txt");
    });

    it("answers a test host's robots.txt itself: disallow everything", async () => {
        const res = middleware(
            request("https://test--northwind.saroh.app/robots.txt"),
        );
        expect(rewrittenTo(res)).toBeNull();
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
        expect(res.headers.get("x-robots-tag")).toBe("noindex");
    });

    it("404s a test host's sitemap.xml", () => {
        const res = middleware(
            request("https://test--northwind.saroh.app/sitemap.xml"),
        );
        expect(res.status).toBe(404);
        expect(rewrittenTo(res)).toBeNull();
    });
});
