/**
 * Whether this browser is the Saroh team's: one opened the team link, and a
 * Cloudflare rule set `saroh_team=1` on the domain for a year (the links and
 * the rules aren't in the repo). Such a browser loads no Google Analytics
 * and sees no cookie notice, and a second Cloudflare rule keeps it out of
 * Cloudflare Web Analytics, so the counts are visitors, not us.
 *
 * Not a lock: anyone can set the cookie, and all it does is leave their
 * own visits uncounted.
 */
export const TEAM_COOKIE = "saroh_team";

export function isTeamBrowser(cookie: string): boolean {
    return cookie.split(";").some((part) => part.trim() === `${TEAM_COOKIE}=1`);
}
