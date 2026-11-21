import type { NextRequest, NextResponse } from "next/server";

import { env } from "@/env";

import { LOADER_HOSTS } from "./trackers";

/**
 * The merchant sites' enforced Content-Security-Policy (21 Nov 2026): a
 * script runs only if it carries this answer's nonce (Next's own, the
 * theme's, a tracker's loader text) or comes from Saroh or a host below.
 * No 'strict-dynamic': what a tracker loads must come from a listed host
 * too, and Cloudflare's injected analytics beacon carries no nonce.
 *
 * The rest of ENFORCED_CSP (@saroh/auth/security-headers) rides along: no
 * framing by another site, no inline event handler, no plugins, no moved
 * base. Styles, images and connections stay open: each business's media,
 * checkout and trackers' endpoints would all need listing.
 *
 * The page cache (`lib/page-cache/worker.ts`) keeps a page with its headers,
 * so a kept page is served with the nonce it was drawn with, for at most its
 * TTL. shortcut: a kept page's nonce is shared by its visitors for that
 * time; a per-visitor nonce would mean rewriting kept HTML on every hit.
 */
export const SITE_SCRIPT_HOSTS = [
    // Every tracker loader (`lib/trackers.ts`), and what each loads in turn.
    ...LOADER_HOSTS.map((host) => `https://${host}`),
    "https://*.googletagmanager.com",
    "https://www.googleadservices.com",
    "https://googleads.g.doubleclick.net",
    "https://www.google.com",
    "https://scripts.clarity.ms",
    // Cloudflare Web Analytics, injected by the zone.
    "https://static.cloudflareinsights.com",
    // A customer's sign-in check (Turnstile) and the checkout windows.
    "https://challenges.cloudflare.com",
    "https://checkout.razorpay.com",
    "https://sdk.cashfree.com",
    "https://js.stripe.com",
] as const;

export function sitePolicy(nonce: string): string {
    const dev = env.NODE_ENV === "development";
    return [
        `script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""} ${SITE_SCRIPT_HOSTS.join(" ")}`,
        "script-src-attr 'none'",
        "frame-ancestors 'self'",
        "object-src 'none'",
        "base-uri 'self'",
    ].join("; ");
}

const OVERRIDES = "x-middleware-override-headers";

/**
 * Sends `sitePolicy` with a fresh nonce on every answer, and hands the page
 * the policy and `x-nonce` on its request, merged with any request headers
 * the middleware already set: Next stamps the nonce on its own scripts from
 * the request's CSP. The same as `withNonce` in @saroh/auth/private-app,
 * which this app doesn't depend on.
 */
export function withSitePolicy(
    next: (request: NextRequest) => NextResponse,
): (request: NextRequest) => NextResponse {
    return function nonced(request) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const nonce = btoa(
            Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
        );
        const policy = sitePolicy(nonce);
        const out = next(request);
        const headers = out.headers;
        headers.set("Content-Security-Policy", policy);
        if (
            !headers.has("x-middleware-next") &&
            !headers.has("x-middleware-rewrite")
        )
            return out;
        const listed = headers.get(OVERRIDES);
        const keys = new Set(listed === null ? [] : listed.split(","));
        if (listed === null)
            request.headers.forEach((value, key) => {
                headers.set(`x-middleware-request-${key}`, value);
                keys.add(key);
            });
        for (const [key, value] of [
            ["content-security-policy", policy],
            ["x-nonce", nonce],
        ] as const) {
            headers.set(`x-middleware-request-${key}`, value);
            keys.add(key);
        }
        headers.set(OVERRIDES, Array.from(keys).join(","));
        return out;
    };
}

/** The page's nonce, for a script the browser adds (a tracker's loader). */
export function pageNonce(): string {
    return (
        document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce ?? ""
    );
}
