import { describe, expect, it } from "vitest";

import {
    decideRequest,
    drawnRequest,
    isTrackingParam,
    keyedSearch,
    pageCacheKey,
} from "./request-rules";

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

    it("keeps the page a QR scan opened as the page itself", async () => {
        // `?src=qr-<code>` is read in the browser only, so both are the
        // same drawing. The page is drawn without the tag (`drawnRequest`),
        // so the one kept carries nothing of the scan to the next visitor.
        const plain = await key(req("https://rye.saroh.app/book"));
        const scanned = await key(req("https://rye.saroh.app/book?src=qr-h7c"));
        expect(scanned).toBe(plain);
        expect(new URL(plain).searchParams.has("src")).toBe(false);
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

describe("an ad click, a shared link and a QR scan meet the kept page", () => {
    const key = (url: string) => pageCacheKey(req(url), "rye.saroh.app", "v1");

    it("keys a page the same with or without the tags of where a visit came from", async () => {
        const plain = await key("https://rye.saroh.app/shop/sourdough");
        for (const tagged of [
            "https://rye.saroh.app/shop/sourdough?utm_source=instagram&utm_medium=story&utm_campaign=diwali",
            "https://rye.saroh.app/shop/sourdough?fbclid=IwAR0abc",
            "https://rye.saroh.app/shop/sourdough?gclid=Cj0abc",
            "https://rye.saroh.app/shop/sourdough?igshid=MzRl",
            "https://rye.saroh.app/shop/sourdough?src=qr-h7c",
            "https://rye.saroh.app/shop/sourdough?UTM_Source=x&FBCLID=y",
        ]) {
            expect(await key(tagged)).toBe(plain);
        }
    });

    it("still keys on everything the server draws from", async () => {
        const booking = await key(
            "https://rye.saroh.app/book?service=svc_1&date=2026-10-12&start=09%3A00",
        );
        expect(
            await key(
                "https://rye.saroh.app/book?service=svc_1&date=2026-10-12&start=09%3A00&src=qr-h7c&utm_source=flyer",
            ),
        ).toBe(booking);
        expect(
            await key(
                "https://rye.saroh.app/book?service=svc_2&date=2026-10-12&start=09%3A00",
            ),
        ).not.toBe(booking);
        expect(await key("https://rye.saroh.app/book")).not.toBe(booking);
        // A name that only looks like one is kept.
        expect(await key("https://rye.saroh.app/shop?source=x")).not.toBe(
            await key("https://rye.saroh.app/shop"),
        );
    });

    it("knows a tracking parameter from any other", () => {
        for (const name of [
            "utm_source",
            "utm_id",
            "fbclid",
            "gclid",
            "igshid",
            "src",
        ]) {
            expect(isTrackingParam(name)).toBe(true);
        }
        for (const name of [
            "service",
            "page",
            "q",
            "source",
            "utm",
            "srcset",
        ]) {
            expect(isTrackingParam(name)).toBe(false);
        }
        expect(keyedSearch("?a=1&utm_source=x&b=2&src=qr-abc")).toBe(
            "?a=1&b=2",
        );
        expect(keyedSearch("?fbclid=x")).toBe("");
        expect(keyedSearch("")).toBe("");
    });

    it("draws the page for the address every visitor shares, and leaves any other request alone", () => {
        const tagged = req(
            "https://rye.saroh.app/book?service=svc_1&src=qr-h7c&utm_source=flyer",
            { headers: { rsc: "1" } },
        );
        const drawn = drawnRequest(tagged);
        expect(drawn.url).toBe("https://rye.saroh.app/book?service=svc_1");
        expect(drawn.method).toBe("GET");
        expect(drawn.headers.get("rsc")).toBe("1");
        expect(drawn.headers.get("host")).toBe("rye.saroh.app");
        const plain = req("https://rye.saroh.app/book?service=svc_1");
        expect(drawnRequest(plain)).toBe(plain);
    });
});
