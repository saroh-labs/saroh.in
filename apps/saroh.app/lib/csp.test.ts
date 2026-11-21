import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import middleware from "../middleware";
import { SITE_SCRIPT_HOSTS, sitePolicy, withSitePolicy } from "./csp";
import { LOADER_HOSTS } from "./trackers";

const scriptSrc = (policy: string) =>
    policy.split("; ")[0]?.split(" ").slice(1) ?? [];
const nonceOf = (res: Response) =>
    /'nonce-([^']+)'/.exec(
        res.headers.get("Content-Security-Policy") ?? "",
    )?.[1];

describe("the merchant sites' CSP (21 Nov 2026)", () => {
    it("runs scripts from Saroh, by nonce, or from a tracker's or checkout's host only", () => {
        const sources = scriptSrc(sitePolicy("n"));
        expect(sources).toContain("'self'");
        expect(sources).toContain("'nonce-n'");
        expect(sources).not.toContain("'unsafe-inline'");
        expect(sources).not.toContain("'strict-dynamic'");
        expect(sources).not.toContain("'unsafe-eval'");
        // Every host a tracker loader comes from.
        for (const host of LOADER_HOSTS)
            expect(sources).toContain(`https://${host}`);
        expect(sources.slice(2)).toEqual([...SITE_SCRIPT_HOSTS]);
    });

    it("keeps the enforced floor: no inline handler, framing, plugins or moved base", () => {
        const policy = sitePolicy("n");
        for (const part of [
            "script-src-attr 'none'",
            "frame-ancestors 'self'",
            "object-src 'none'",
            "base-uri 'self'",
        ])
            expect(policy).toContain(part);
    });

    it("every answer gets a fresh nonce, and a rewritten page gets it on its request", () => {
        const req = () => new NextRequest("https://rye.saroh.app/shop");
        const one = middleware(req());
        const two = middleware(req());
        expect(nonceOf(one)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
        expect(nonceOf(one)).not.toBe(nonceOf(two));
        expect(one.headers.get("x-middleware-request-x-nonce")).toBe(
            nonceOf(one),
        );
        expect(
            one.headers.get("x-middleware-request-content-security-policy"),
        ).toBe(one.headers.get("Content-Security-Policy"));
        // The middleware's own request headers survive the merge.
        expect(
            one.headers.get("x-middleware-override-headers")?.split(","),
        ).toEqual(
            expect.arrayContaining([
                "x-saroh-request-path",
                "content-security-policy",
                "x-nonce",
            ]),
        );
    });

    it("a page passed through untouched gets the whole request plus the nonce", () => {
        const res = withSitePolicy(() => NextResponse.next())(
            new NextRequest("https://saroh.app/", {
                headers: { cookie: "a=1" },
            }),
        );
        expect(res.headers.get("x-middleware-request-cookie")).toBe("a=1");
        expect(res.headers.get("x-middleware-request-x-nonce")).toBe(
            nonceOf(res),
        );
    });
});
