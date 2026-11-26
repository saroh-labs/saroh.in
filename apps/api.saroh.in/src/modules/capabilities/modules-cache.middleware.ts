import type { NextFunction, Request, Response } from "express";

import type { OrganizationContext } from "../../common/types/organization-context";
import { forgetModuleLists } from "./module-lists-cache";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const ORG_PATH = /^\/organizations\/([^/?#]+)/;

/**
 * Writes that can change module lists across businesses, so they forget
 * every business's: the admin console (flags, overrides, plans), billing
 * and payment webhooks, and MCP, whose calls name their business inside.
 */
const EVERY_BUSINESS = [
    "/admin/",
    "/public/billing/",
    "/public/webhooks",
    "/mcp",
];

/**
 * Forget the module lists a write may have changed, once it has answered
 * (so after its transaction), and only when it succeeded: a refused or
 * unknown write changed nothing. A write for one business (its path, or
 * the business its guard proved: a store's, the public API's) forgets that
 * business's; one of {@link EVERY_BUSINESS} forgets them all. Anything else
 * forgets nothing: a customer's write on a site (a visit, an order) can
 * turn only Insights ready, which waits out the cache's minute, and a
 * sign-in changes no business.
 */
export function modulesCacheMiddleware(
    req: Request & { organizationContext?: OrganizationContext },
    res: Response,
    next: NextFunction,
): void {
    if (!SAFE.has(req.method)) {
        const path = (req.originalUrl || req.url || "").split("?")[0] ?? "";
        res.on("finish", () => {
            if (res.statusCode >= 400) return;
            forgetFor(path, req.organizationContext?.organizationId);
        });
    }
    next();
}

/** What a successful write to `path`, for `organizationId` if proven, forgets. */
export function forgetFor(path: string, organizationId?: string): void {
    const org = ORG_PATH.exec(path)?.[1];
    if (org) return forgetModuleLists(decodeURIComponent(org));
    if (EVERY_BUSINESS.some((prefix) => path.startsWith(prefix))) {
        return forgetModuleLists();
    }
    if (organizationId) forgetModuleLists(organizationId);
}
