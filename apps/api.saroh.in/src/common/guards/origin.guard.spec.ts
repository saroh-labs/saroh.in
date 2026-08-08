// @saroh/auth transitively imports better-auth (ESM), which ts-jest cannot
// parse; the guard only needs `isTrustedOrigin`, whose own behavior is covered
// by the auth package's tests. Mock it with the same *.saroh.in trust rule so
// this spec exercises ONLY the guard's method/path/header logic.
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";

import { OriginGuard } from "./origin.guard";

/**
 * Build a minimal ExecutionContext wrapping a fake request. Only the fields the
 * guard reads (method, path, headers) are provided.
 */
function ctx(req: {
    method: string;
    path: string;
    headers?: Record<string, string | string[] | undefined>;
}): ExecutionContext {
    const request = { headers: {}, ...req };
    return {
        switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
}

describe("OriginGuard (B3 CSRF origin check)", () => {
    const guard = new OriginGuard();

    // ---- safe methods are never checked ----------------------------------
    it("allows GET/HEAD/OPTIONS regardless of Origin", () => {
        for (const method of ["GET", "HEAD", "OPTIONS"]) {
            expect(
                guard.canActivate(
                    ctx({
                        method,
                        path: "/organizations/o1/leads",
                        headers: { origin: "https://evil.com" },
                    }),
                ),
            ).toBe(true);
        }
    });

    // ---- authenticated business routes -----------------------------------
    it("allows an unsafe request from a trusted *.saroh.in Origin", () => {
        expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/organizations/o1/leads",
                    headers: { origin: "https://app.saroh.in" },
                }),
            ),
        ).toBe(true);
    });

    it("REJECTS an unsafe request from an untrusted Origin (the CSRF vector)", () => {
        expect(() =>
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/organizations/o1/leads",
                    headers: { origin: "https://evil.com" },
                }),
            ),
        ).toThrow(ForbiddenException);
    });

    it("falls back to Referer when Origin is absent, and rejects an untrusted one", () => {
        expect(() =>
            guard.canActivate(
                ctx({
                    method: "DELETE",
                    path: "/organizations/o1/automations/a1",
                    headers: { referer: "https://evil.com/attack" },
                }),
            ),
        ).toThrow(ForbiddenException);
    });

    it("allows a trusted Referer when Origin is absent", () => {
        expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/organizations/o1/leads",
                    headers: { referer: "https://app.saroh.in/leads" },
                }),
            ),
        ).toBe(true);
    });

    it("ALLOWS a missing Origin+Referer (server-to-server frontend fetch)", () => {
        expect(
            guard.canActivate(
                ctx({ method: "POST", path: "/organizations/o1/leads" }),
            ),
        ).toBe(true);
    });

    // ---- public + auth routes are exempt ---------------------------------
    it("exempts /public/* even with an untrusted Origin (cross-origin intake is intentional)", () => {
        for (const path of [
            "/public/forms/f1/submit",
            "/public/sites/s1/analytics/events",
            "/public/billing/webhooks/razorpay",
            "/public/webhooks/razorpay",
        ]) {
            expect(
                guard.canActivate(
                    ctx({
                        method: "POST",
                        path,
                        headers: { origin: "https://a-customer-site.example" },
                    }),
                ),
            ).toBe(true);
        }
    });

    it("exempts Better Auth /api/auth/* and /health", () => {
        expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/api/auth/sign-in/email",
                    headers: { origin: "https://evil.com" },
                }),
            ),
        ).toBe(true);
    });

    it("ignores the query string when matching exempt prefixes", () => {
        expect(
            guard.canActivate(
                ctx({
                    method: "POST",
                    path: "/public/forms/f1/submit?utm=x",
                    headers: { origin: "https://evil.com" },
                }),
            ),
        ).toBe(true);
    });
});
