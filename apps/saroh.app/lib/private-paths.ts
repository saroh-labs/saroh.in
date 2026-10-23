/**
 * The pages of a merchant's site that are about one customer, not the
 * business (their account, a checkout, an autopay setup, an order's status,
 * a pay link, a waitlist claim, a "stop waiting" link, a QR short link).
 *
 * The list itself lives in `@saroh/block-contract` (`private-paths.ts`),
 * shared with the API, whose `site.view` contract refuses a view of one
 * (U15 privacy review): the site and the server read one list. This module
 * adds what only the site needs: the robots rules and the response header.
 *
 * A plain module (no "use client"), so the robots route, the sitemap and
 * client components can share it.
 */
import {
    isPrivateSitePath,
    PRIVATE_PATH_PREFIXES,
    QR_PATH_PREFIX,
} from "@saroh/block-contract";

export { isPrivateSitePath, PRIVATE_PATH_PREFIXES, QR_PATH_PREFIX };

/**
 * What `robots.txt` disallows for each. A robots rule matches any address
 * that starts with it, so "Disallow: /q" would also keep crawlers out of a
 * merchant's `/quotes` or `/qr-menu` page; the short link is written with
 * its slash, which matches only `/q/<code>`.
 */
export const ROBOTS_DISALLOW: readonly string[] = PRIVATE_PATH_PREFIXES.map(
    (prefix) => (prefix === QR_PATH_PREFIX ? `${QR_PATH_PREFIX}/` : prefix),
);

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
