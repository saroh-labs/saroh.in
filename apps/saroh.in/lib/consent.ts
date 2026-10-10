/**
 * The visitor's answers to the cookie notice: whether Google Analytics may
 * set its cookies on saroh.in (the Privacy policy's "you can refuse them in
 * the cookie notice, and the site works the same"), and, separately, whether
 * the advertising tags may (Google Ads and the Meta Pixel, DEC-127).
 *
 * Two answers, because they are two different asks: someone who accepted
 * visit counts before saroh.in advertised has not accepted advertising
 * cookies, and is asked. Someone who refused is not asked again: a refusal
 * of the first covers the second until they open "Cookie choices".
 *
 * Kept in the browser's localStorage, and in memory as well, so a browser
 * that blocks storage (a private window, site data turned off) still gets
 * the answer it gave for as long as the page is open. Nothing about it goes
 * to Saroh. It is this origin's storage, so only saroh.in's own pages can
 * read it (the sign-up conversion's `/welcome` page is one of them).
 */
export type Consent = "granted" | "refused";

export const CONSENT_KEY = "saroh-analytics-consent";
export const ADS_CONSENT_KEY = "saroh-ads-consent";

/** Fired on this window when an answer changes; `storage` covers other tabs. */
const CHANGED = "saroh:consent";

const remembered: Record<string, Consent | null> = {};

const isConsent = (value: unknown): value is Consent =>
    value === "granted" || value === "refused";

function read(key: string): Consent | null {
    if (typeof window === "undefined") return null;
    try {
        const stored = window.localStorage.getItem(key);
        return isConsent(stored) ? stored : null;
    } catch {
        return remembered[key] ?? null;
    }
}

function write(key: string, choice: Consent | null): void {
    remembered[key] = choice;
    try {
        if (choice) window.localStorage.setItem(key, choice);
        else window.localStorage.removeItem(key);
    } catch {
        // Storage is blocked; the in-memory answer holds for this page.
    }
}

/** The answer given about visit counts, or null when none has been. */
export function readConsent(): Consent | null {
    return read(CONSENT_KEY);
}

/**
 * The answer given about advertising cookies, or null when none has been.
 * Refusing visit counts refuses these too, until the visitor says otherwise.
 */
export function readAdsConsent(): Consent | null {
    return (
        read(ADS_CONSENT_KEY) ??
        (readConsent() === "refused" ? "refused" : null)
    );
}

/**
 * Both answers as one string (`granted:refused`, `-` for none): a stable
 * snapshot for `useSyncExternalStore`.
 */
export function readChoices(): string {
    return `${readConsent() ?? "-"}:${readAdsConsent() ?? "-"}`;
}

/**
 * Records the visit-counts answer, or forgets BOTH answers (null) so the
 * notice asks again: "Cookie choices" takes back everything that was agreed.
 */
export function writeConsent(choice: Consent | null): void {
    if (typeof window === "undefined") return;
    write(CONSENT_KEY, choice);
    if (choice === null) write(ADS_CONSENT_KEY, null);
    window.dispatchEvent(new Event(CHANGED));
}

/** Records the answers the notice's buttons give; one left out is kept. */
export function writeChoices(choices: {
    analytics?: Consent;
    ads?: Consent;
}): void {
    if (typeof window === "undefined") return;
    if (choices.analytics) write(CONSENT_KEY, choices.analytics);
    if (choices.ads) write(ADS_CONSENT_KEY, choices.ads);
    window.dispatchEvent(new Event(CHANGED));
}

/** For `useSyncExternalStore`: calls back when an answer changes here or in another tab. */
export function subscribeConsent(onChange: () => void): () => void {
    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHANGED, onChange);
        window.removeEventListener("storage", onChange);
    };
}

/**
 * Whether the browser itself says "don't track me": Global Privacy Control
 * or Do Not Track. saroh.in reads either as a refusal of every optional
 * cookie and shows no notice: the visitor has already answered.
 */
export function privacySignal(
    nav: { doNotTrack?: unknown; globalPrivacyControl?: unknown },
    win: { doNotTrack?: unknown } = {},
): boolean {
    return (
        nav.globalPrivacyControl === true ||
        nav.doNotTrack === "1" ||
        nav.doNotTrack === "yes" ||
        win.doNotTrack === "1"
    );
}

function clearCookies(shape: RegExp, doc: Document, hostname: string): void {
    const names = doc.cookie
        .split(";")
        .map((c) => c.split("=")[0]?.trim() ?? "")
        .filter((name) => shape.test(name));
    const labels = hostname.split(".");
    const domains = [""];
    for (let i = 0; i < labels.length - 1; i++) {
        domains.push(`; domain=.${labels.slice(i).join(".")}`);
    }
    for (const name of names) {
        for (const domain of domains) {
            doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
        }
    }
}

/**
 * Removes the cookies Google Analytics set (`_ga`, `_ga_<id>`), on this
 * host and on its parent domains, once a visitor refuses after accepting.
 * Best effort: a cookie set on a domain we don't try stays until it expires.
 */
export function clearAnalyticsCookies(
    doc: Document = document,
    hostname: string = window.location.hostname,
): void {
    clearCookies(/^_ga(_|$)/, doc, hostname);
}

/**
 * Removes the cookies the advertising tags set on saroh.in: Google Ads'
 * (`_gcl_au`, `_gcl_aw` and the other `_gcl_…`, `_gac_<id>`) and the Meta
 * Pixel's (`_fbp`, `_fbc`). The same best effort. What Google and Meta keep
 * on their own domains is theirs; the site can't reach it.
 */
export function clearAdsCookies(
    doc: Document = document,
    hostname: string = window.location.hostname,
): void {
    clearCookies(/^(_gcl_|_gac_|_fbp$|_fbc$)/, doc, hostname);
}
