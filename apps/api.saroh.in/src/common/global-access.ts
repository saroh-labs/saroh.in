import { createHash, timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

/**
 * Global's API behind the access key while saroh.tech isn't open (owner,
 * 16 Nov 2026): on a `*.saroh.tech` address, only a request carrying the
 * access cookie the saroh.tech sites set (`saroh-dev-access`, the key's
 * SHA-256, on `.saroh.tech`) gets in. Browsers send it from those sites, and
 * the apps' servers forward the visitor's cookies, so both pass. A page load
 * without it goes to saroh.in; anything else is refused.
 *
 * Off unless `GLOBAL_API_ACCESS_KEY` is set: India's addresses, and Global
 * once it opens (unset it), are untouched. Health checks and the published
 * plans (saroh.tech's build reads them, with no cookie) stay open.
 */
export const GLOBAL_ACCESS_COOKIE = "saroh-dev-access";
const AWAY = "https://saroh.in/";

const OPEN = [
    { method: "GET", path: /^\/health(\/.*)?$/ },
    { method: "GET", path: /^\/public\/pricing\/?$/ },
];

export const isGlobalHost = (host: string | undefined) => {
    const name = (host ?? "").trim().toLowerCase().split(":")[0] ?? "";
    return name === "saroh.tech" || name.endsWith(".saroh.tech");
};

const sha256Hex = (value: string) =>
    createHash("sha256").update(value).digest("hex");

/** The access cookie's value in a Cookie header, or null. */
export function accessCookieOf(header: string | undefined): string | null {
    for (const part of (header ?? "").split(";")) {
        const [name, ...rest] = part.trim().split("=");
        if (name === GLOBAL_ACCESS_COOKIE) return rest.join("=");
    }
    return null;
}

/** Whether `cookie` is the digest of `key`, compared in constant time. */
export function cookieOpens(cookie: string | null, key: string): boolean {
    if (!cookie) return false;
    const want = Buffer.from(sha256Hex(key));
    const got = Buffer.from(cookie);
    return got.length === want.length && timingSafeEqual(got, want);
}

/** Middleware, before everything that answers: the mounted Better Auth too. */
export function globalAccessGate(key: string | undefined) {
    const secret = key?.trim();
    return function gate(req: Request, res: Response, next: NextFunction) {
        if (!secret || !isGlobalHost(req.headers.host)) {
            next();
            return;
        }
        // A CORS preflight carries no cookies and no data: let CORS answer it.
        if (req.method === "OPTIONS") {
            next();
            return;
        }
        const method = req.method === "HEAD" ? "GET" : req.method;
        const open = OPEN.some(
            (o) => o.method === method && o.path.test(req.path),
        );
        if (open || cookieOpens(accessCookieOf(req.headers.cookie), secret)) {
            next();
            return;
        }
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        if (method === "GET") {
            res.redirect(302, AWAY);
            return;
        }
        res.status(403).json({ statusCode: 403, message: "Forbidden" });
    };
}
