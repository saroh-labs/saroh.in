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
 *
 * An account manager's link (DEC-169), `saroh.in/?am=<code>`, is kept the
 * same way in its own cookie, {@link MANAGER_COOKIE}, beside the referral:
 * a sign-up can carry both, and both are recorded. Its differences:
 *
 * - **It holds when it was kept**, `<code>.<seconds since 1970>`, which the
 *   API stores as the link's evidence. Opening another page of the same
 *   link keeps the first time; a different manager's link replaces it (the
 *   last link wins, as for a referral).
 * - **It is kept from the waitlist page too.** `?am=` means one thing
 *   everywhere; only `?ref=` is told apart there.
 * - **Codes are capitals and digits** (`StaffProfile.managerCode`), read in
 *   any case, with spaces or dashes, the way one is read out.
 * - Like the referral, nothing about it is given to a tag: `am` is not on
 *   the address allow-list (`lib/page-address.ts`), so it is cut before a
 *   tag loads, and the cookie is never passed to one.
 *
 * Where a visitor came from (#1190), `src` and `utm_source`,
 * `utm_medium` and `utm_campaign` from the address they landed on, is kept
 * the same way in a third cookie, {@link SOURCE_COOKIE}, and written once on
 * the business they set up. Its differences:
 *
 * - **It holds the four values as a query** (`src=…&utm_source=…`), each
 *   only letters, digits, `.`, `_` or `-`, at most {@link SOURCE_MAX}
 *   characters. A value of any other shape is dropped; the rest are kept.
 * - **The last link wins, part by part**: a new `src` replaces the kept one,
 *   and a link with any utm replaces all three, so a later page opened from
 *   a call to action (`/waitlist?src=…`) keeps the campaign it came by.
 * - `src` and utm stay in the address for tags (`lib/page-address.ts`), as
 *   before; the cookie itself is never given to a tag.
 */
export const REFERRAL_COOKIE = "saroh_ref";

/** How long a kept code lasts. */
export const REFERRAL_DAYS = 90;

/** The page whose `?ref=` is an entrant's id (`referralLink`, `lib/waitlist.ts`). */
const WAITLIST_PATH = "/waitlist";

/** A referral code's shape, the API's `REF_CODE_PATTERN`. */
const CODE = /^[a-hj-km-np-z2-9]{8}$/;

/** The account manager's link (DEC-169): `?am=` kept for setup. */
export const MANAGER_COOKIE = "saroh_am";

/** A manager code's shape, the API's `MANAGER_CODE_PATTERN`. */
const MANAGER_CODE = /^[2-9A-HJKMNP-Z]{8}$/;

/** Where a visitor came from (#1190): `src` and utm, kept for setup. */
export const SOURCE_COOKIE = "saroh_src";

/** The longest value kept; the workspace and the API cap it the same. */
export const SOURCE_MAX = 64;

/** The query names kept, `src` first, then the campaign's three. */
const SOURCE_KEYS = [
    "src",
    "utm_source",
    "utm_medium",
    "utm_campaign",
] as const;

const SOURCE_VALUE = new RegExp(`^[A-Za-z0-9._-]{1,${SOURCE_MAX}}$`);

type Source = Partial<Record<(typeof SOURCE_KEYS)[number], string>>;

/** The source values in a query, each only when it is safely shaped. */
export function sourceFromSearch(search: string): Source {
    const query = new URLSearchParams(search);
    const source: Source = {};
    for (const key of SOURCE_KEYS) {
        const value = query.get(key)?.trim();
        if (value && SOURCE_VALUE.test(value)) source[key] = value;
    }
    return source;
}

/** The kept source in a `document.cookie` string, or an empty one. */
export function keptSource(cookie: string): Source {
    const value = cookieValue(cookie, SOURCE_COOKIE);
    return value ? sourceFromSearch(value) : {};
}

/** The source cookie, as `document.cookie` is assigned it. */
export function sourceCookie(source: Source, at: CookieAt): string {
    const query = new URLSearchParams();
    for (const key of SOURCE_KEYS) {
        const value = source[key];
        if (value) query.set(key, value);
    }
    return keptCookie(SOURCE_COOKIE, query.toString(), at);
}

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

/** The manager code in a page's `?am=`, or null when there is none. */
export function managerFromSearch(search: string): string | null {
    const raw = new URLSearchParams(search).get("am");
    if (!raw || raw.length > 64) return null;
    const code = raw.replace(/[\s-]+/g, "").toUpperCase();
    return MANAGER_CODE.test(code) ? code : null;
}

/** The value of cookie `name` in a `document.cookie` string, or null. */
function cookieValue(cookie: string, name: string): string | null {
    for (const part of cookie.split(";")) {
        const at = part.indexOf("=");
        if (at < 0) continue;
        const value = part.slice(at + 1).trim();
        if (part.slice(0, at).trim() === name && value) return value;
    }
    return null;
}

/** The kept manager link, its code and when it was kept, or null. */
export function keptManagerLink(
    cookie: string,
): { code: string; keptAt: Date } | null {
    const value = cookieValue(cookie, MANAGER_COOKIE);
    const [code, seconds] = value?.split(".") ?? [];
    if (
        !code ||
        !MANAGER_CODE.test(code) ||
        !seconds ||
        !/^\d{9,11}$/.test(seconds)
    ) {
        return null;
    }
    return { code, keptAt: new Date(Number(seconds) * 1000) };
}

/** The kept code in a `document.cookie` string, or null. */
export function keptReferral(cookie: string): string | null {
    const value = cookieValue(cookie, REFERRAL_COOKIE);
    return value && CODE.test(value) ? value : null;
}

interface CookieAt {
    host: string;
    accountsHost: string;
    secure: boolean;
}

/** The cookie, as `document.cookie` is assigned it. */
export function referralCookie(code: string, at: CookieAt): string {
    return keptCookie(REFERRAL_COOKIE, code, at);
}

/** The manager link's cookie: the code and when it was kept, in seconds. */
export function managerCookie(
    code: string,
    keptAt: Date,
    at: CookieAt,
): string {
    return keptCookie(
        MANAGER_COOKIE,
        `${code}.${Math.floor(keptAt.getTime() / 1000)}`,
        at,
    );
}

function keptCookie(name: string, value: string, at: CookieAt): string {
    const domain = sharedDomain(at.host, at.accountsHost);
    return [
        `${name}=${value}`,
        `Max-Age=${REFERRAL_DAYS * 24 * 60 * 60}`,
        "Path=/",
        ...(domain ? [`Domain=${domain}`] : []),
        "SameSite=Lax",
        ...(at.secure ? ["Secure"] : []),
    ].join("; ");
}

/**
 * Keeps the referral code, the manager link and the source this page was
 * opened with, whichever it was opened with. The query is read through `readAddress`,
 * so it is found whether or not the address has been cut back for a tag
 * yet.
 */
export function keepReferral(
    accountsUrl: string,
    win: Window = window,
    now: () => Date = () => new Date(),
): void {
    const search = readAddress(win);
    const code =
        win.location.pathname === WAITLIST_PATH
            ? null
            : referralFromSearch(search);
    const manager = managerFromSearch(search);
    const source = sourceFromSearch(search);
    const hasUtm = Boolean(
        source.utm_source ?? source.utm_medium ?? source.utm_campaign,
    );
    if (!code && !manager && source.src === undefined && !hasUtm) return;
    try {
        const at = {
            host: win.location.hostname,
            accountsHost: new URL(accountsUrl).hostname,
            secure: win.location.protocol === "https:",
        };
        if (code) win.document.cookie = referralCookie(code, at);
        // The same link opened again keeps when it was first kept.
        if (manager && keptManagerLink(win.document.cookie)?.code !== manager) {
            win.document.cookie = managerCookie(manager, now(), at);
        }
        if (source.src !== undefined || hasUtm) {
            const kept = keptSource(win.document.cookie);
            win.document.cookie = sourceCookie(
                hasUtm ? { src: kept.src, ...source } : { ...kept, ...source },
                at,
            );
        }
    } catch {
        // Cookies are blocked, or the accounts address isn't one: nothing kept.
    }
}
