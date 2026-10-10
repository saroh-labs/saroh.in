/**
 * The pages of a merchant's site that are about one customer, not the
 * business: their account, a checkout, an autopay setup, an order's status
 * and a pay link. Search engines are kept out of them (`robots.txt`, #890),
 * and they never appear in the sitemap.
 *
 * `/q` is here too: a QR code's short link (`/q/<code>`) is not a page at
 * all. It counts a scan and forwards, so a crawler following it would add
 * scans nobody made, and it must never be kept by the page cache.
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
    "/q",
] as const;

/** The short link's own prefix: only ever `/q/<code>`. */
export const QR_PATH_PREFIX = "/q";

/**
 * What `robots.txt` disallows for each. A robots rule matches any address
 * that starts with it, so "Disallow: /q" would also keep crawlers out of a
 * merchant's `/quotes` or `/qr-menu` page; the short link is written with
 * its slash, which matches only `/q/<code>`.
 */
export const ROBOTS_DISALLOW: readonly string[] = PRIVATE_PATH_PREFIXES.map(
    (prefix) => (prefix === QR_PATH_PREFIX ? `${QR_PATH_PREFIX}/` : prefix),
);

/** Whether `path` is one of those pages or under one. */
export function isPrivateSitePath(path: string): boolean {
    return PRIVATE_PATH_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}
