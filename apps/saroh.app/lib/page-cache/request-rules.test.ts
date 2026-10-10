import { describe, expect, it } from "vitest";

import { decideRequest, pageCacheKey } from "./request-rules";

const ROOT = "saroh.app";

function req(
    url: string,
    init: { method?: string; headers?: Record<string, string> } = {},
): Request {
    return new Request(url, {
        method: init.method ?? "GET",
        headers: { host: new URL(url).host, ...init.headers },
    });
}

const reason = (r: Request) => {
    const d = decideRequest(r, ROOT);
    return d.cacheable ? "cacheable" : d.reason;
};

describe("which requests the page cache may answer (#863)", () => {
    it("takes a GET for a live merchant page from a visitor nobody knows", () => {
        expect(reason(req("https://rye.saroh.app/"))).toBe("cacheable");
        expect(reason(req("https://rye.saroh.app/about"))).toBe("cacheable");
        expect(reason(req("https://rye.saroh.app/shop/sourdough"))).toBe(
            "cacheable",
        );
        // A custom domain is a live host too.
        expect(reason(req("https://www.ryebakery.in/"))).toBe("cacheable");
    });

    it("never a customer's own pages (lib/private-paths.ts)", () => {
        for (const path of [
            "/account",
            "/account/orders",
            "/checkout/ord_1",
            "/autopay",
            "/shop/order/ord_1",
            "/pay/tok",
        ]) {
            expect(reason(req(`https://rye.saroh.app${path}`))).toBe(
                "private path",
            );
        }
    });

    it("never a QR code's short link, so every scan reaches the server", () => {
        for (const path of ["/q/h7c", "/q/h7c?utm=x", "/q"]) {
            expect(reason(req(`https://rye.saroh.app${path}`))).toBe(
                "private path",
            );
            expect(reason(req(`https://www.ryebakery.in${path}`))).toBe(
                "private path",
            );
        }
        // A page that merely starts with the letter is an ordinary page.
        expect(reason(req("https://rye.saroh.app/quotes"))).toBe("cacheable");
        expect(reason(req("https://rye.saroh.app/qr-menu"))).toBe("cacheable");
    });

    it("never a preview, a review link or the renderer's own routes", () => {
        for (const path of [
            "/preview/tok",
            "/review/tok",
            "/api/anything",
            "/__saroh/page-cache/revalidate",
            "/template-renders/x",
            "/_next/data/x.json",
        ]) {
            expect(reason(req(`https://rye.saroh.app${path}`))).toBe(
                "private path",
            );
        }
        // Previews and review links live on the apex.
        expect(reason(req("https://saroh.app/preview/tok"))).toBe("apex");
        expect(reason(req("https://www.saroh.app/"))).toBe("apex");
    });

    it("never a test release's host (DEC-071)", () => {
        expect(reason(req("https://test--rye.saroh.app/"))).toBe("test host");
        expect(reason(req("https://test.ryebakery.in/"))).toBe("test host");
    });

    it("never a visitor who is signed in or holds a test release", () => {
        expect(
            reason(
                req("https://rye.saroh.app/", {
                    headers: { cookie: "a=1; __Host-saroh_session=tok" },
                }),
            ),
        ).toBe("signed in");
        expect(
            reason(
                req("https://rye.saroh.app/", {
                    headers: { cookie: "__Host-saroh-test=tok" },
                }),
            ),
        ).toBe("test release");
        // Another cookie (an analytics tool's) changes nothing.
        expect(
            reason(
                req("https://rye.saroh.app/", { headers: { cookie: "_ga=1" } }),
            ),
        ).toBe("cacheable");
    });

    it("never anything but a GET, nor a file or a server action", () => {
        expect(reason(req("https://rye.saroh.app/", { method: "POST" }))).toBe(
            "method",
        );
        expect(reason(req("https://rye.saroh.app/", { method: "HEAD" }))).toBe(
            "method",
        );
        expect(reason(req("https://rye.saroh.app/robots.txt"))).toBe("file");
        expect(reason(req("https://rye.saroh.app/sitemap.xml"))).toBe("file");
        expect(
            reason(
                req("https://rye.saroh.app/", {
                    headers: { "next-action": "abc" },
                }),
            ),
        ).toBe("action");
    });
});

describe("the key a page is kept under (#863)", () => {
    const key = (r: Request, host = "rye.saroh.app", version = "v1") =>
        pageCacheKey(r, host, version);

    it("is the host's: one site never answers for another", async () => {
        const a = await key(req("https://rye.saroh.app/about"));
        const b = await key(
            req("https://pulse.saroh.app/about"),
            "pulse.saroh.app",
        );
        expect(a).not.toBe(b);
        expect(new URL(a).host).toBe("rye.saroh.app");
    });

    it("names the deploy, the path and the query", async () => {
        const base = await key(req("https://rye.saroh.app/shop?page=2"));
        expect(new URL(base).pathname).toBe("/shop");
        expect(new URL(base).searchParams.get("page")).toBe("2");
        expect(
            await key(
                req("https://rye.saroh.app/shop?page=2"),
                undefined,
                "v2",
            ),
        ).not.toBe(base);
        expect(await key(req("https://rye.saroh.app/shop?page=3"))).not.toBe(
            base,
        );
    });

    it("keeps a client navigation's RSC answer apart from the page", async () => {
        const page = await key(req("https://rye.saroh.app/about"));
        const rsc = await key(
            req("https://rye.saroh.app/about", { headers: { rsc: "1" } }),
        );
        const prefetch = await key(
            req("https://rye.saroh.app/about", {
                headers: { rsc: "1", "next-router-prefetch": "1" },
            }),
        );
        expect(new Set([page, rsc, prefetch]).size).toBe(3);
        // The same request twice is the same key.
        expect(
            await key(
                req("https://rye.saroh.app/about", { headers: { rsc: "1" } }),
            ),
        ).toBe(rsc);
    });
});
