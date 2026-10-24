import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { withDevAccess } from "./dev-access";
import { createAuthMiddleware } from "./middleware";
import { PRIVATE_APP_HEADERS, withPrivateApp } from "./private-app";

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
        const gate = withPrivateApp(() => NextResponse.next());
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
        const gate = withPrivateApp(withDevAccess(next));
        const res = await gate(request("https://app.saroh.io/orders"));
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toBe(301);
        expect(res.headers.get("location")).toBe("https://app.saroh.in/orders");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expectPrivate(res);
    });

    it("copies an answer whose headers can't be written", async () => {
        const frozen = Response.redirect("https://accounts.saroh.in/login");
        const gate = withPrivateApp(() => frozen);
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
        });
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
