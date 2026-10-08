/**
 * The pages of a merchant's site that are about one customer, not the
 * business: their account, a checkout, an autopay setup, an order's status
 * and a pay link. Search engines are kept out of them (`robots.txt`, #890),
 * and they never appear in the sitemap.
 *
 * A plain module (no "use client"), so the robots route, the sitemap and
 * client components can share one list.
 */
export const PRIVATE_PATH_PREFIXES = [
    "/account",
    "/checkout",
    "/autopay",
    "/shop/order",
    "/pay",
] as const;

/** Whether `path` is one of those pages or under one. */
export function isPrivateSitePath(path: string): boolean {
    return PRIVATE_PATH_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}
