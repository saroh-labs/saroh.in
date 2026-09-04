import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTrustedOrigins, isTrustedOrigin, safeDestination } from "./origins";
import { sessionCookieDomain } from "./server";

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

import { getSessionCookie } from "better-auth/cookies";

import { createAuthMiddleware } from "./middleware";

function fakeRequest({
    method = "GET",
    pathname,
    href = "https://app.saroh.in/",
    origin,
    headers: extraHeaders = {},
}: {
    method?: string;
    pathname?: string;
    href?: string;
    origin?: string;
    headers?: Record<string, string>;
}) {
    const headers = new Map<string, string>(
        Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v]),
    );
    if (origin) headers.set("origin", origin);
    // The shape Next gives middleware: `nextUrl` is a URL built from the
    // server's own address, and the public host lives only in the headers.
    const url = new URL(href);
    return {
        method,
        headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
        nextUrl: {
            pathname: pathname ?? url.pathname,
            href: url.href,
            protocol: url.protocol,
            host: url.host,
            search: url.search,
        },
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

    it("builds the back-link from the forwarded host behind a proxy", () => {
        vi.mocked(getSessionCookie).mockReturnValue(null);
        // In development Next hands middleware its own bound address; the
        // proxy (portless locally, the edge in production) forwards the real
        // one in headers.
        const res = mw(
            fakeRequest({
                href: "http://localhost:4040/sites/abc?tab=pages",
                headers: {
                    host: "localhost:4040",
                    "x-forwarded-host": "app.saroh.localhost",
                    "x-forwarded-proto": "https",
                },
            }),
        );
        const location = new URL(res.headers.get("location") ?? "");
        expect(location.searchParams.get("redirect")).toBe(
            "https://app.saroh.localhost/sites/abc?tab=pages",
        );
    });

    it("falls back to the Host header, then the URL, when nothing is forwarded", () => {
        vi.mocked(getSessionCookie).mockReturnValue(null);
        const viaHost = mw(
            fakeRequest({
                href: "http://localhost:4040/sites",
                headers: { host: "app.saroh.in" },
            }),
        );
        expect(
            new URL(viaHost.headers.get("location") ?? "").searchParams.get(
                "redirect",
            ),
        ).toBe("http://app.saroh.in/sites");

        const viaUrl = mw(fakeRequest({ href: "https://app.saroh.in/sites" }));
        expect(
            new URL(viaUrl.headers.get("location") ?? "").searchParams.get(
                "redirect",
            ),
        ).toBe("https://app.saroh.in/sites");
    });

    it("takes the first hop when a forwarded header lists several", () => {
        vi.mocked(getSessionCookie).mockReturnValue(null);
        const res = mw(
            fakeRequest({
                href: "http://localhost:4040/sites",
                headers: {
                    "x-forwarded-host": "app.saroh.in, edge.internal",
                    "x-forwarded-proto": "https, http",
                },
            }),
        );
        expect(
            new URL(res.headers.get("location") ?? "").searchParams.get(
                "redirect",
            ),
        ).toBe("https://app.saroh.in/sites");
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

describe("sessionCookieDomain", () => {
    it("shares the cookie across the api's parent domain", () => {
        expect(sessionCookieDomain("https://api.saroh.in")).toBe(".saroh.in");
        expect(sessionCookieDomain("https://api.saroh.localhost")).toBe(
            ".saroh.localhost",
        );
    });

    it("keeps a host-only cookie when there is no parent to share with", () => {
        expect(sessionCookieDomain("http://localhost:3333")).toBeNull();
        expect(sessionCookieDomain("http://127.0.0.1:3333")).toBeNull();
        expect(sessionCookieDomain("https://saroh.in")).toBeNull();
        expect(sessionCookieDomain(undefined)).toBeNull();
        expect(sessionCookieDomain("not a url")).toBeNull();
    });
});

describe("safeDestination — where to land after sign-in (#222)", () => {
    beforeEach(() => {
        process.env.BETTER_AUTH_TRUSTED_ORIGINS =
            "https://app.saroh.in,https://admin.saroh.in";
    });

    it("follows a full URL on a trusted origin, keeping its path and query", () => {
        expect(
            safeDestination("https://app.saroh.in/sites/abc?tab=pages"),
        ).toBe("https://app.saroh.in/sites/abc?tab=pages");
    });

    it("refuses an untrusted origin", () => {
        // The parameter is attacker-controllable: following this would hand an
        // attacker someone who has just typed their password.
        expect(safeDestination("https://evil.example/looks-like-saroh")).toBe(
            null,
        );
        expect(safeDestination("https://app.saroh.in.evil.example/")).toBe(
            null,
        );
    });

    it("follows a same-origin path, and refuses a protocol-relative one", () => {
        expect(safeDestination("/sites/abc")).toBe("/sites/abc");
        // Browsers read `//host` as protocol-relative and leave the origin —
        // the one case where a leading slash is not a same-origin path.
        expect(safeDestination("//evil.example/x")).toBe(null);
    });

    it("is null when there is nothing to return to", () => {
        expect(safeDestination(undefined)).toBe(null);
        expect(safeDestination("")).toBe(null);
        expect(safeDestination("   ")).toBe(null);
    });

    it("takes the first of a repeated parameter rather than guessing", () => {
        expect(
            safeDestination(["https://app.saroh.in/a", "https://evil.example"]),
        ).toBe("https://app.saroh.in/a");
        // And the first still has to be trusted.
        expect(
            safeDestination(["https://evil.example", "https://app.saroh.in/a"]),
        ).toBe(null);
    });

    it("refuses a javascript: URL", () => {
        expect(safeDestination("javascript:alert(1)")).toBe(null);
    });
});
