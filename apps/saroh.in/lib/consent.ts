/**
 * The visitor's answer to the cookie notice: whether Google Analytics may
 * set its cookies on saroh.in (the Privacy policy's "you can refuse them in
 * the cookie notice, and the site works the same").
 *
 * Kept in the browser's localStorage, and in memory as well, so a browser
 * that blocks storage (a private window, site data turned off) still gets
 * the answer it gave for as long as the page is open. Nothing about it goes
 * to Saroh.
 */
export type Consent = "granted" | "refused";

export const CONSENT_KEY = "saroh-analytics-consent";

/** Fired on this window when the answer changes; `storage` covers other tabs. */
const CHANGED = "saroh:consent";

let remembered: Consent | null = null;

const isConsent = (value: unknown): value is Consent =>
    value === "granted" || value === "refused";

/** The answer given, or null when none has been. */
export function readConsent(): Consent | null {
    if (typeof window === "undefined") return null;
    try {
        const stored = window.localStorage.getItem(CONSENT_KEY);
        return isConsent(stored) ? stored : null;
    } catch {
        return remembered;
    }
}

/** Records an answer, or forgets it (null) so the notice asks again. */
export function writeConsent(choice: Consent | null): void {
    if (typeof window === "undefined") return;
    remembered = choice;
    try {
        if (choice) window.localStorage.setItem(CONSENT_KEY, choice);
        else window.localStorage.removeItem(CONSENT_KEY);
    } catch {
        // Storage is blocked; the in-memory answer holds for this page.
    }
    window.dispatchEvent(new Event(CHANGED));
}

/** For `useSyncExternalStore`: calls back when the answer changes here or in another tab. */
export function subscribeConsent(onChange: () => void): () => void {
    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    return () => {
        window.removeEventListener(CHANGED, onChange);
        window.removeEventListener("storage", onChange);
    };
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
    const names = doc.cookie
        .split(";")
        .map((c) => c.split("=")[0]?.trim() ?? "")
        .filter((name) => /^_ga(_|$)/.test(name));
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
