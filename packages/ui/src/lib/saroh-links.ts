/**
 * Saroh's own Privacy, Terms and Help pages, for the quiet line under every
 * screen outside the workspace (`SplitShell`): signing up, signing in and
 * setting up a business.
 *
 * They live on the marketing site, which serves each page only from its
 * `publishOn` day (`apps/saroh.in/content/resources.ts`); before that day the
 * address is a 404, and a link to a 404 is worse than no link. So each link
 * here carries the same day and is drawn only once it has begun in India.
 * `saroh-links.test.ts` keeps the days equal to the marketing site's.
 *
 * Help is the exception: before it publishes on saroh.in it lives on
 * help.saroh.in, which redirects to the new pages afterwards, so Help always
 * has somewhere real to go (the workspace does the same,
 * `apps/app.saroh.in/lib/help/links.ts`).
 */

/** The marketing site. `www`, as saroh.in redirects to it. */
export const SAROH_SITE_URL = "https://www.saroh.in";

/** Where Help lives until it publishes on the marketing site. */
export const SAROH_OLD_HELP_URL = "https://help.saroh.in";

/** Each page's `publishOn` on the marketing site. */
export const PUBLISHED_ON = {
    privacy: "2026-10-10",
    terms: "2026-10-08",
    help: "2026-10-17",
} as const;

/** Midnight in India on the day: India keeps no daylight saving, so +05:30. */
function hasBegun(day: string, now: Date): boolean {
    return now.getTime() >= new Date(`${day}T00:00:00+05:30`).getTime();
}

export interface SarohLink {
    label: string;
    href: string;
}

/** Privacy · Terms · Help, each only where it has a page to open at `now`. */
export function sarohFooterLinks(now: Date = new Date()): SarohLink[] {
    const links: SarohLink[] = [];
    if (hasBegun(PUBLISHED_ON.privacy, now)) {
        links.push({ label: "Privacy", href: `${SAROH_SITE_URL}/privacy` });
    }
    if (hasBegun(PUBLISHED_ON.terms, now)) {
        links.push({ label: "Terms", href: `${SAROH_SITE_URL}/terms` });
    }
    links.push({
        label: "Help",
        href: hasBegun(PUBLISHED_ON.help, now)
            ? `${SAROH_SITE_URL}/help`
            : SAROH_OLD_HELP_URL,
    });
    return links;
}
