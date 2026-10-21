/**
 * The pages of a merchant's site that are about one customer, not the
 * business: their account, a checkout, an autopay setup, an order's status
 * and a pay link. Search engines are kept out of them (`robots.txt`, #890),
 * and they never appear in the sitemap.
 *
 * A waitlist offer's claim page (`/book/claim/<token>`, #1149) is one
 * customer's held place, and its token is the link: never kept, never
 * crawled, while `/book` itself stays public.
 *
 * "Stop waiting" for a product to be back (`/shop/stop-waiting/<token>`,
 * #1155) is one visitor's watch, and its token is the way to stop it:
 * never kept, never crawled, while `/shop` stays public.
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
    "/book/claim",
    "/shop/stop-waiting",
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

/**
 * What every private page answers with, as a header (DEC-142): a crawler
 * that reaches one anyway is told not to index it or follow its links, on
 * the response itself and not only in the page's `<meta>` (which a
 * streamed page sends late, and a file or a redirect never sends at all).
 * The middleware sets it for every prefix above (`privatePathHeaders`).
 */
export const PRIVATE_ROBOTS_TAG = "noindex, nofollow";

/** The headers a private path's response carries; none for a public one. */
export function privatePathHeaders(path: string): Record<string, string> {
    return isPrivateSitePath(path)
        ? { "X-Robots-Tag": PRIVATE_ROBOTS_TAG }
        : {};
}
