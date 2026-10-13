import { readAddress } from "@/lib/page-address";

/**
 * Keeping a business's referral code from saroh.in to the business its
 * visitor later sets up (DEC-156).
 *
 * A site on Free links here as `saroh.in/?ref=<code>` ("Made with Saroh",
 * DEC-102). The business is made days and two hosts later (accounts, then
 * the workspace's setup), so the code is kept in one first-party cookie on
 * the domain those hosts share, and the workspace's server reads it as the
 * business is made (`apps/app.saroh.in/lib/organizations/referral-carry.ts`).
 *
 * - **What it holds**: the eight characters from the link, nothing about
 *   the visitor. It is functional, set whatever the cookie notice was
 *   answered, and it is never given to a tag: no analytics event, ad
 *   conversion or recording is sent it, and the address it came from is cut
 *   before any tag loads, as before (`lib/page-address.ts`, DEC-127).
 * - **How long**: {@link REFERRAL_DAYS} days, and the workspace clears it
 *   once a business has been made.
 * - **The last link wins.** The page can't tell a business's code from a
 *   mistyped one, so a newer link replaces an older one instead of the
 *   first, possibly wrong, one holding for the cookie's whole life.
 * - **Not from the waitlist page.** There `?ref=` is another entrant's
 *   referral id, the same shape and a different thing; the waitlist form
 *   sends that itself. Only the API can tell the two apart, by table.
 * - **Only shaped like a code.** Anything else is left alone. Whether it
 *   names a business, and whether that counts, is the API's to say.
 */
export const REFERRAL_COOKIE = "saroh_ref";

/** How long a kept code lasts. */
export const REFERRAL_DAYS = 90;

/** The page whose `?ref=` is an entrant's id (`referralLink`, `lib/waitlist.ts`). */
const WAITLIST_PATH = "/waitlist";

/** A referral code's shape, the API's `REF_CODE_PATTERN`. */
const CODE = /^[a-hj-km-np-z2-9]{8}$/;

/** The code in a page's query, or null when it holds none shaped like one. */
export function referralFromSearch(search: string): string | null {
    const ref = new URLSearchParams(search).get("ref")?.trim().toLowerCase();
    return ref && CODE.test(ref) ? ref : null;
}

/**
 * The domain a cookie set on `host` must name to reach accounts and the
 * workspace too: `host` without its `www.`, when accounts sits on or under
 * it (`saroh.in`, `saroh.io`, `saroh.localhost`). Null anywhere else (a
 * preview on a host of its own), where the cookie stays on that host and
 * goes nowhere.
 */
export function sharedDomain(
    host: string,
    accountsHost: string,
): string | null {
    const base = host.toLowerCase().replace(/^www\./, "");
    const accounts = accountsHost.toLowerCase();
    if (!base.includes(".")) return null;
    return accounts === base || accounts.endsWith(`.${base}`) ? base : null;
}

/** The kept code in a `document.cookie` string, or null. */
export function keptReferral(cookie: string): string | null {
    for (const part of cookie.split(";")) {
        const [name, value] = part.trim().split("=");
        if (name === REFERRAL_COOKIE && value && CODE.test(value)) {
            return value;
        }
    }
    return null;
}

/** The cookie, as `document.cookie` is assigned it. */
export function referralCookie(
    code: string,
    at: { host: string; accountsHost: string; secure: boolean },
): string {
    const domain = sharedDomain(at.host, at.accountsHost);
    return [
        `${REFERRAL_COOKIE}=${code}`,
        `Max-Age=${REFERRAL_DAYS * 24 * 60 * 60}`,
        "Path=/",
        ...(domain ? [`Domain=${domain}`] : []),
        "SameSite=Lax",
        ...(at.secure ? ["Secure"] : []),
    ].join("; ");
}

/**
 * Keeps the code this page was opened with, if it was opened with one. The
 * query is read through `readAddress`, so it is found whether or not the
 * address has been cut back for a tag yet.
 */
export function keepReferral(accountsUrl: string, win: Window = window): void {
    if (win.location.pathname === WAITLIST_PATH) return;
    const code = referralFromSearch(readAddress(win));
    if (!code) return;
    try {
        win.document.cookie = referralCookie(code, {
            host: win.location.hostname,
            accountsHost: new URL(accountsUrl).hostname,
            secure: win.location.protocol === "https:",
        });
    } catch {
        // Cookies are blocked, or the accounts address isn't one: nothing kept.
    }
}
