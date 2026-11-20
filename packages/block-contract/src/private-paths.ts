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
 * `/paid` is where Stripe's hosted Checkout sends a customer back to: its
 * address holds the session id or a cancel token.
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
    "/paid",
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

/** The longest page path kept (the analytics contract's own bound). */
const MAX_SITE_PAGE_PATH = 2048;

/**
 * A site page's path as an event may keep it (DEC-235), or null when it
 * may not be kept: cut at the query and the fragment, a trailing slash
 * dropped, and refused when it isn't a site path at all (not a string, not
 * starting with one `/`, spaces or control characters, too long) or is a
 * private page ({@link isPrivateSitePath}, the trackers' own rule). One
 * function for the site, which sends it, and the API, which checks it again.
 */
export function sitePagePathOf(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const cut = value.split(/[?#]/)[0] ?? "";
    if (!cut.startsWith("/") || cut.startsWith("//")) return null;
    if (
        cut.length > MAX_SITE_PAGE_PATH ||
        // eslint-disable-next-line no-control-regex -- refusing control characters is the point
        /[\s\u0000-\u001f\u007f\\]/.test(cut)
    ) {
        return null;
    }
    const path = cut.length > 1 ? cut.replace(/\/+$/, "") || "/" : cut;
    return isPrivateSitePath(path) ? null : path;
}
