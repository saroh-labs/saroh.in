/**
 * The pages of a merchant's site that are about one customer, not the
 * business: their account, a checkout, an autopay setup, an order's status
 * and a pay link. ONE list, shared by the site (`apps/saroh.app`: robots,
 * sitemap, page cache, the page-view beacon) and the API (the `site.view`
 * contract refuses a view of one, U15 privacy review), so the two sides can
 * never disagree about what is private.
 *
 * - Search engines are kept out of them (`robots.txt`, #890), and they
 *   never appear in the sitemap.
 * - The page-view beacon never reports them, and the API refuses a view of
 *   one: their paths name an order, a booking or a token.
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

/** Whether `path` (a pathname, no query) is one of those pages or under one. */
export function isPrivateSitePath(path: string): boolean {
    return PRIVATE_PATH_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
}
