import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withDevAccess } from "./dev-access";
import { createAuthMiddleware } from "./middleware";
import { PRIVATE_APP_HEADERS, withNonce, withPrivateApp } from "./private-app";

const policy = (nonce: string) =>
    `script-src 'self' 'nonce-${nonce}'; frame-ancestors 'self'`;

function request(url: string, init: { method?: string; origin?: string } = {}) {
    return new NextRequest(url, {
        method: init.method ?? "GET",
        headers: init.origin ? { origin: init.origin } : {},
    });
}

function expectPrivate(res: Response) {
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(res.headers.get("Strict-Transport-Security")).toMatch(
        /^max-age=31536000\b/,
    );
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'self'",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
}

describe("withPrivateApp — a signed-in app is never indexed", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("a page it lets through carries the headers on to the page", async () => {
        const gate = withPrivateApp(() => NextResponse.next(), policy);
        const res = await gate(request("https://app.saroh.in/orders"));
        expectPrivate(res);
        // Still a pass-through: Next reads this to go on to the page.
        expect(res.headers.get("x-middleware-next")).toBe("1");
    });

    it("the redirect to sign-in carries them, which next.config's never did", async () => {
        const gate = withPrivateApp(
            createAuthMiddleware({
                loginUrl: "https://accounts.saroh.in/login",
            }),
            policy,
        );
        const res = await gate(request("https://app.saroh.in/orders"));
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toContain(
            "https://accounts.saroh.in/login?redirect=",
        );
        expectPrivate(res);
    });

    it("a refused request carries them", async () => {
        const gate = withPrivateApp(
            createAuthMiddleware({
                loginUrl: "https://accounts.saroh.in/login",
            }),
            policy,
        );
        const res = await gate(
            request("https://app.saroh.in/orders", {
                method: "POST",
                origin: "https://elsewhere.example.com",
            }),
        );
        expect(res.status).toBe(403);
        expectPrivate(res);
    });

    it("the dev environment's own redirect carries them", async () => {
        vi.stubEnv("DEV_ACCESS_KEY", "a-long-random-dev-key");
        vi.stubEnv("DEV_REDIRECT_ORIGIN", "https://app.saroh.in");
        const next = vi.fn(() => NextResponse.next());
        const gate = withPrivateApp(withDevAccess(next), policy);
        const res = await gate(request("https://app.saroh.io/orders"));
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(301);
        expect(res.headers.get("location")).toBe("https://app.saroh.in/orders");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expectPrivate(res);
    });

    it("copies an answer whose headers can't be written", async () => {
        const frozen = Response.redirect("https://accounts.saroh.in/login");
        const gate = withPrivateApp(() => frozen, policy);
        const res = await gate(request("https://app.saroh.in/"));
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(
            "https://accounts.saroh.in/login",
        );
        expectPrivate(res);
    });

    it("keeps what the answer already set, cookies among it", async () => {
        const gate = withPrivateApp(() => {
            const res = NextResponse.redirect("https://app.saroh.in/");
            res.cookies.set("seen", "1");
            return res;
        }, policy);
        const res = await gate(request("https://app.saroh.in/x"));
        expect(res.headers.get("set-cookie")).toContain("seen=1");
        expectPrivate(res);
    });

    it("says no more than the five headers", () => {
        expect(Object.keys(PRIVATE_APP_HEADERS)).toEqual([
            "X-Robots-Tag",
            "Strict-Transport-Security",
            "X-Frame-Options",
            "Content-Security-Policy",
            "X-Content-Type-Options",
        ]);
    });
});

describe("withNonce — the CSP is enforced with a fresh nonce (21 Nov 2026)", () => {
    const nonceOf = (res: Response) =>
        /'nonce-([^']+)'/.exec(
            res.headers.get("Content-Security-Policy") ?? "",
        )?.[1];

    it("sends a nonce, a different one on every request", async () => {
        const gate = withPrivateApp(() => NextResponse.next(), policy);
        const one = await gate(request("https://app.saroh.in/orders"));
        const two = await gate(request("https://app.saroh.in/orders"));
        expect(nonceOf(one)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        expect(nonceOf(two)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        expect(nonceOf(one)).not.toBe(nonceOf(two));
        // The floor in PRIVATE_APP_HEADERS is replaced, not sent beside it.
        expect(one.headers.get("Content-Security-Policy")).toContain(
            "script-src 'self' 'nonce-",
        );
    });

    it("hands the page its policy and nonce on the request, keeping the rest", async () => {
        const gate = withPrivateApp(() => NextResponse.next(), policy);
        const req = new NextRequest("https://app.saroh.in/orders", {
            headers: { cookie: "a=1" },
        });
        const res = await gate(req);
        const nonce = nonceOf(res);
        const listed = res.headers
            .get("x-middleware-override-headers")
            ?.split(",");
        expect(listed).toEqual(
            expect.arrayContaining([
                "cookie",
                "content-security-policy",
                "x-nonce",
            ]),
        );
        expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
        expect(
            res.headers.get("x-middleware-request-content-security-policy"),
        ).toBe(res.headers.get("Content-Security-Policy"));
        expect(res.headers.get("x-middleware-request-cookie")).toBe("a=1");
    });

    it("merges with request headers the inner middleware already set", async () => {
        const gate = withNonce(() => {
            const headers = new Headers({ "x-path": "/shop" });
            return NextResponse.rewrite("https://app.saroh.in/x", {
                request: { headers },
            });
        }, policy);
        const res = await gate(request("https://app.saroh.in/shop"));
        expect(res.headers.get("x-middleware-override-headers")).toBe(
            "x-path,content-security-policy,x-nonce",
        );
        expect(res.headers.get("x-middleware-request-x-path")).toBe("/shop");
    });

    it("a redirect carries the policy but hands nothing on", async () => {
        const gate = withNonce(
            () => NextResponse.redirect("https://accounts.saroh.in/login"),
            policy,
        );
        const res = await gate(request("https://app.saroh.in/"));
        expect(nonceOf(res)).toBeTruthy();
        expect(res.headers.get("x-middleware-override-headers")).toBeNull();
    });
});
