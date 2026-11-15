import { merchantSitesFor } from "@saroh/edition";
import type { NextFunction, Request, Response } from "express";

/**
 * What merchant sites' API address serves (DEC-204): this list and nothing
 * else. It's the routes saroh.app calls. A new public route is off this
 * address until someone adds it here, and `merchant-api.spec.ts` makes them
 * decide.
 */
export const MERCHANT_API_ROUTES = [
    "health",
    "public/forms",
    "public/invoices",
    "public/order-pay",
    "public/payments",
    "public/product-reviews",
    "public/services",
    // A published site's share pictures (#1375): its own items, its look.
    "public/share",
    "public/site-accounts",
    "public/sites",
] as const;

/** Public routes that belong to Saroh's own sites, providers or sign-in. */
export const NOT_ON_MERCHANT_API = [
    "public/billing",
    "public/business-reports",
    "public/contact-messages",
    "public/downloads",
    "public/funnel",
    "public/orders",
    "public/organization-invitations",
    "public/pricing",
    "public/search-pages",
    "public/sign-in-options",
    "public/staff-invites",
    "public/tools",
    "public/waitlist",
    "public/webhooks",
] as const;

const HOSTS: readonly string[] = [
    merchantSitesFor("production").api,
    merchantSitesFor("development").api,
];

export const isMerchantApiHost = (host: string | undefined) =>
    HOSTS.includes((host ?? "").trim().toLowerCase().replace(/:\d+$/, ""));

export function merchantApiAllows(path: string): boolean {
    const clean = path.replace(/^\/+/, "");
    return MERCHANT_API_ROUTES.some(
        (route) => clean === route || clean.startsWith(`${route}/`),
    );
}

/**
 * Middleware, not a guard: the Better Auth handler is mounted on the app, so a
 * guard would never see `/api/auth`. Other addresses pass untouched.
 */
export function merchantApiOnly(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (!isMerchantApiHost(req.headers.host) || merchantApiAllows(req.path)) {
        next();
        return;
    }
    res.status(404).json({ statusCode: 404, message: "Not found" });
}
