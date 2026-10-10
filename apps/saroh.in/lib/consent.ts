/**
 * The visitor's answers to the cookie notice on saroh.in (the Privacy
 * policy's "you can refuse them in the cookie notice, and the site works
 * the same"). The notice asks about two things, and each is its own answer:
 *
 * 1. **Understanding the site**: Google Analytics' visit counts, and
 *    recording how the site is used (session replay, DEC-125). One answer
 *    covers both.
 * 2. **Advertising**: Google Ads and the Meta Pixel (DEC-127).
 *
 * Someone who accepted the first before saroh.in advertised has not
 * accepted advertising cookies, and is asked. Someone who refused is not
 * asked again: a refusal of the first covers the second until they open
 * "Cookie choices".
 *
 * **What an accept covered is kept with it** ({@link CONSENT_SCOPE_KEY}).
 * Until 10 Oct the notice asked about visit counts alone, and it still does
 * wherever recording is switched off. An "Accept" given to those words is
 * never stretched to cover recording: visit counts carry on as agreed, and
 * the notice asks once about recording ({@link readRecordingConsent}).
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

/**
 * What an accepted first answer covers:
 *
 * - `analytics`: visit counts. The notice that was answered said nothing of
 *   recording (every accept from before 10 Oct, which has no scope stored,
 *   reads as this too).
 * - `analytics+recording`: visit counts and recording; the notice said so.
 * - `analytics-only`: visit counts, and "Refuse" when asked afterwards
 *   about recording. Only someone who had accepted the older notice can
 *   hold it: they keep what they agreed to and are not asked again.
 */
export type ConsentScope =
    "analytics" | "analytics+recording" | "analytics-only";

export const CONSENT_SCOPE_KEY = "saroh-analytics-consent-scope";

/** Fired on this window when an answer changes; `storage` covers other tabs. */
const CHANGED = "saroh:consent";

const remembered: Record<string, string | null> = {};

const isConsent = (value: unknown): value is Consent =>
    value === "granted" || value === "refused";

const isScope = (value: unknown): value is ConsentScope =>
    value === "analytics" ||
    value === "analytics+recording" ||
    value === "analytics-only";

function stored(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return remembered[key] ?? null;
    }
}

function read(key: string): Consent | null {
    const value = stored(key);
    return isConsent(value) ? value : null;
}

function write(key: string, value: string | null): void {
    remembered[key] = value;
    try {
        if (value) window.localStorage.setItem(key, value);
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
 * The answer given about recording how the site is used, or null when none
 * has been. It is part of the first answer, so a refusal of that refuses
 * this, and an accept covers it only if the notice that was accepted said
 * it records. An accept from before it did is no answer yet (null): the
 * notice asks once, and nothing is recorded meanwhile.
 */
export function readRecordingConsent(): Consent | null {
    const choice = readConsent();
    if (choice !== "granted") return choice;
    const scope = stored(CONSENT_SCOPE_KEY);
    if (!isScope(scope)) return null;
    if (scope === "analytics+recording") return "granted";
    return scope === "analytics-only" ? "refused" : null;
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
 * The answers as one string, `counts:ads:recording` (`granted:refused:-`,
 * `-` for none): a stable snapshot for `useSyncExternalStore`.
 */
export function readChoices(): string {
    return [readConsent(), readAdsConsent(), readRecordingConsent()]
        .map((answer) => answer ?? "-")
        .join(":");
}

function writeFirst(choice: Consent | null, scope: ConsentScope): void {
    write(CONSENT_KEY, choice);
    // What a refusal was a refusal of doesn't matter: it covers everything.
    write(CONSENT_SCOPE_KEY, choice === "granted" ? scope : null);
}

/**
 * Records the first answer, or forgets EVERY answer (null) so the notice
 * asks again: "Cookie choices" takes back everything that was agreed.
 * `scope` is what the notice that was answered asked about.
 */
export function writeConsent(
    choice: Consent | null,
    scope: ConsentScope = "analytics",
): void {
    if (typeof window === "undefined") return;
    writeFirst(choice, scope);
    if (choice === null) write(ADS_CONSENT_KEY, null);
    window.dispatchEvent(new Event(CHANGED));
}

/**
 * Records the answers the notice's buttons give; one left out is kept.
 *
 * - `analytics` is the first answer. `recording: true` beside an accept
 *   says the notice that was accepted said it records.
 * - `recording` alone is the answer of someone who had already accepted
 *   visit counts and was asked about recording afterwards: visit counts
 *   stay as they were either way.
 */
export function writeChoices(choices: {
    analytics?: Consent;
    recording?: boolean;
    ads?: Consent;
}): void {
    if (typeof window === "undefined") return;
    if (choices.analytics) {
        writeFirst(
            choices.analytics,
            choices.recording ? "analytics+recording" : "analytics",
        );
    } else if (choices.recording !== undefined && readConsent() === "granted") {
        write(
            CONSENT_SCOPE_KEY,
            choices.recording ? "analytics+recording" : "analytics-only",
        );
    }
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
 * cookie and of recording, and shows no notice: the visitor has already
 * answered.
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
 * The recorder sets none (it keeps nothing in the browser), so there is
 * nothing of its to remove.
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
