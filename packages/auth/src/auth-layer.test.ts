import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrustedOrigins, isTrustedOrigin } from "./origins";

describe("origins", () => {
    it("matches a trusted *.saroh.in origin (with or without path)", () => {
        expect(isTrustedOrigin("https://app.saroh.in")).toBe(true);
        expect(isTrustedOrigin("https://app.saroh.in/some/path")).toBe(true);
    });

    it("rejects an untrusted origin", () => {
        expect(isTrustedOrigin("https://evil.example.com")).toBe(false);
    });

    it("rejects a malformed origin", () => {
        expect(isTrustedOrigin("not-a-url")).toBe(false);
    });

    it("no longer trusts the dropped dashboard app", () => {
        expect(isTrustedOrigin("https://dashboard.saroh.in")).toBe(false);
    });

    it("honors the BETTER_AUTH_TRUSTED_ORIGINS env override", () => {
        const prev = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
        process.env.BETTER_AUTH_TRUSTED_ORIGINS =
            "https://a.test, https://b.test";
        expect(getTrustedOrigins()).toEqual([
            "https://a.test",
            "https://b.test",
        ]);
        if (prev === undefined) delete process.env.BETTER_AUTH_TRUSTED_ORIGINS;
        else process.env.BETTER_AUTH_TRUSTED_ORIGINS = prev;
    });
});

vi.mock("better-auth/cookies", () => ({ getSessionCookie: vi.fn() }));
// eslint-disable-next-line import/first
import { getSessionCookie } from "better-auth/cookies";
// eslint-disable-next-line import/first
import { createAuthMiddleware } from "./middleware";

function fakeRequest({
    method = "GET",
    pathname = "/",
    href = "https://app.saroh.in/",
    origin,
}: {
    method?: string;
    pathname?: string;
    href?: string;
    origin?: string;
}) {
    const headers = new Map<string, string>();
    if (origin) headers.set("origin", origin);
    return {
        method,
        headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
        nextUrl: { pathname, href },
    } as never;
}

describe("createAuthMiddleware", () => {
    const mw = createAuthMiddleware({
        loginUrl: "https://accounts.saroh.in/login",
    });

    beforeEach(() => vi.mocked(getSessionCookie).mockReset());

    it("redirects unauthenticated users to accounts with a redirect back-link", () => {
        vi.mocked(getSessionCookie).mockReturnValue(null);
        const res = mw(
            fakeRequest({
                pathname: "/dashboard",
                href: "https://app.saroh.in/dashboard",
            }),
        );
        expect(res.status).toBe(307);
        const location = res.headers.get("location") ?? "";
        expect(location).toContain("accounts.saroh.in/login");
        expect(location).toContain("redirect=");
    });

    it("allows an authenticated request through", () => {
        vi.mocked(getSessionCookie).mockReturnValue("session-token");
        const res = mw(fakeRequest({}));
        expect(res.status).toBe(200);
    });

    it("rejects a mutating request from an untrusted origin (403)", () => {
        const res = mw(
            fakeRequest({ method: "POST", origin: "https://evil.example.com" }),
        );
        expect(res.status).toBe(403);
    });

    it("allows a mutating request from a trusted origin when authenticated", () => {
        vi.mocked(getSessionCookie).mockReturnValue("session-token");
        const res = mw(
            fakeRequest({ method: "POST", origin: "https://app.saroh.in" }),
        );
        expect(res.status).toBe(200);
    });

    it("skips the gate for paths the app marks public", () => {
        vi.mocked(getSessionCookie).mockReturnValue(null);
        const mw2 = createAuthMiddleware({
            loginUrl: "https://accounts.saroh.in/login",
            isProtected: (p) => p.startsWith("/private"),
        });
        const res = mw2(fakeRequest({ pathname: "/public" }));
        expect(res.status).toBe(200);
    });
});
