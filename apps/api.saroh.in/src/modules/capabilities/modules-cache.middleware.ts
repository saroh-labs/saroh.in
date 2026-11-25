import type { NextFunction, Request, Response } from "express";

import { forgetModuleLists } from "./module-lists-cache";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const ORG_PATH = /^\/organizations\/([^/?#]+)/;

/**
 * Forget the module lists a write may have changed, once it has answered
 * (so after its transaction): a write to one business forgets that
 * business's; any other write but a customer's on a merchant site or a
 * sign-in forgets them all — the admin console, a flag, a billing webhook,
 * a store's or the public API's write, MCP. A customer's write (a visit, an
 * order) can turn only Insights ready, which waits out the cache's minute.
 */
export function modulesCacheMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (!SAFE.has(req.method)) {
        const path = (req.originalUrl || req.url || "").split("?")[0] ?? "";
        res.on("finish", () => forgetFor(path));
    }
    next();
}

/** What a write to `path` forgets. */
export function forgetFor(path: string): void {
    const org = ORG_PATH.exec(path)?.[1];
    if (org) return forgetModuleLists(decodeURIComponent(org));
    const customers =
        (path.startsWith("/public/") &&
            !path.startsWith("/public/billing/") &&
            !path.startsWith("/public/webhooks")) ||
        path.startsWith("/api/auth/");
    if (!customers) forgetModuleLists();
}
