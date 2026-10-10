import {
    clearAdsCookies,
    clearAnalyticsCookies,
    privacySignal,
    readAdsConsent,
    readConsent,
} from "@/lib/consent";
import type { TagConfig } from "@/lib/ga";
import { hasAdTags } from "@/lib/ga";
import {
    cleanUrl,
    guardHistory,
    resetAddress,
    takeAddress,
} from "@/lib/page-address";
import { isTeamBrowser } from "@/lib/team-browser";

/**
 * The one place saroh.in loads a third party's tag and sends it anything
 * (DEC-127): Google's tag (gtag.js, for Google Analytics and Google Ads) and
 * the Meta Pixel. Everything here runs in the browser.
 *
 * - **Nothing loads until it is allowed.** `syncTags` is told what the
 *   visitor has agreed to; a tag's script is added to the page only once its
 *   kind is allowed, so before an answer, after a refusal, in a team browser
 *   and under Do Not Track or Global Privacy Control no request goes to
 *   Google or Meta at all.
 * - **Google Consent Mode v2.** Before Google's tag is configured the four
 *   consent types (`ad_storage`, `ad_user_data`, `ad_personalization`,
 *   `analytics_storage`) default to denied, then are updated to what was
 *   agreed: visit counts grant `analytics_storage` only, advertising the
 *   three `ad_…` types.
 * - **Taking it back stops it.** A later `syncTags` with less allowed tells
 *   Google the consent is denied, switches Google Analytics off for the
 *   page, tells the Pixel consent is revoked, and deletes the cookies the
 *   tags set here. The scripts already in the page can't be unloaded, but
 *   they are sent nothing more, and the next page loads none.
 * - **No personal data.** No email, phone, name or anything typed is given
 *   to either: no enhanced conversions, no advanced matching, and the
 *   Pixel's automatic reading of the page (buttons, page metadata) is off.
 * - **The address is cut back first.** Both tags report the page's address.
 *   Before a tag's script is added, the address itself is cut to the
 *   allow-list in `lib/page-address.ts` (no `ref`, `invite`, `email`,
 *   `token`, `next` or anything unlisted), and every later address is cut
 *   as it is set, so no tag ever has the whole one to read. The Pixel takes
 *   no address from us and reads the page's, which is why the page's own is
 *   what is cut. Each event sent to Google also names the cut address
 *   (`page_location`).
 */
type Fbq = ((...args: unknown[]) => void) & {
    callMethod?: (...args: unknown[]) => void;
    queue: unknown[];
    push: Fbq;
    loaded: boolean;
    version: string;
};

declare global {
    interface Window {
        dataLayer?: unknown[];
        gtag?: (...args: unknown[]) => void;
        fbq?: Fbq;
        _fbq?: Fbq;
    }
}

/** What the visitor has agreed to, after every rule that overrides it. */
export interface Allowed {
    analytics: boolean;
    ads: boolean;
}

export const NOTHING_ALLOWED: Allowed = { analytics: false, ads: false };

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js?id=";
const PIXEL_SRC = "https://connect.facebook.net/en_US/fbevents.js";
/** Marks the scripts this file added. */
const MARK = "data-saroh-tag";

interface State {
    config: TagConfig;
    analytics: boolean;
    ads: boolean;
    /** gtag.js is in the page. */
    google: boolean;
    /** The Pixel is in the page. */
    meta: boolean;
    /** The Google ids already given a `config`. */
    configured: Set<string>;
    /** Conversions sent from this page, as `name:id`. */
    fired: Set<string>;
}

const fresh = (): State => ({
    config: {},
    analytics: false,
    ads: false,
    google: false,
    meta: false,
    configured: new Set(),
    fired: new Set(),
});

let state = fresh();

/**
 * A browser that is never tagged, whatever was clicked: the Saroh team's
 * (`lib/team-browser.ts`), or one sending Do Not Track or Global Privacy
 * Control, which is a refusal the visitor gave before arriving.
 */
export function browserOptsOut(
    win: Window = window,
    doc: Document = document,
): boolean {
    return (
        isTeamBrowser(doc.cookie) ||
        privacySignal(win.navigator, win as { doNotTrack?: unknown })
    );
}

/** What this browser allows right now, from its answers to the notice. */
export function allowedNow(
    win: Window = window,
    doc: Document = document,
): Allowed {
    if (browserOptsOut(win, doc)) return NOTHING_ALLOWED;
    return {
        analytics: readConsent() === "granted",
        ads: readAdsConsent() === "granted",
    };
}

const said = (yes: boolean) => (yes ? "granted" : "denied");

function addScript(doc: Document, src: string): void {
    const script = doc.createElement("script");
    script.async = true;
    script.src = src;
    script.setAttribute(MARK, "");
    doc.head.appendChild(script);
}

function syncGoogle(win: Window, doc: Document): void {
    const { gaId, adsId } = state.config;
    const analytics = state.analytics && Boolean(gaId);
    const ads = state.ads && Boolean(adsId);
    const consent = {
        ad_storage: said(ads),
        ad_user_data: said(ads),
        ad_personalization: said(ads),
        analytics_storage: said(analytics),
    };
    if (!analytics && !ads) {
        if (!state.google) return;
        win.gtag?.("consent", "update", consent);
    } else if (!state.google) {
        const layer = (win.dataLayer = win.dataLayer ?? []);
        // Google's tag reads each entry as an `arguments` object, not an
        // array, so this is the documented function, not a rest parameter.
        win.gtag = function gtag() {
            // eslint-disable-next-line prefer-rest-params
            layer.push(arguments);
        };
        // The default must come before anything that measures.
        win.gtag("consent", "default", {
            ad_storage: "denied",
            ad_user_data: "denied",
            ad_personalization: "denied",
            analytics_storage: "denied",
        });
        win.gtag("consent", "update", consent);
        win.gtag("js", new Date());
        // Named for a tag that is allowed: never Analytics' id while only
        // advertising is, nor the other way round.
        const first = (analytics ? gaId : adsId) ?? "";
        addScript(doc, `${GTAG_SRC}${encodeURIComponent(first)}`);
        state.google = true;
    } else {
        win.gtag?.("consent", "update", consent);
    }
    // Google Analytics' own off switch: with it set, the tag sends nothing.
    if (gaId)
        (win as unknown as Record<string, unknown>)[`ga-disable-${gaId}`] =
            !analytics;
    if (analytics && gaId && !state.configured.has(gaId)) {
        win.gtag?.("config", gaId);
        state.configured.add(gaId);
    }
    if (ads && adsId && !state.configured.has(adsId)) {
        // Enhanced conversions would send a hashed email or phone: never.
        win.gtag?.("config", adsId, { allow_enhanced_conversions: false });
        state.configured.add(adsId);
    }
}

function syncMeta(win: Window, doc: Document): void {
    const { pixelId } = state.config;
    const on = state.ads && Boolean(pixelId);
    if (!on) {
        if (state.meta) win.fbq?.("consent", "revoke");
        return;
    }
    if (state.meta) {
        win.fbq?.("consent", "grant");
        return;
    }
    // Meta's base code: calls wait in `queue` until fbevents.js arrives.
    const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    win.fbq = fbq;
    win._fbq = fbq;
    fbq("consent", "grant");
    // Off: the Pixel reading button text and page metadata by itself.
    fbq("set", "autoConfig", false, pixelId);
    // The id alone: no second argument, so no advanced matching.
    fbq("init", pixelId);
    fbq("track", "PageView");
    addScript(doc, PIXEL_SRC);
    state.meta = true;
}

/**
 * Brings the page's tags in line with what is allowed: loads what has just
 * been allowed, stops what no longer is, and clears the cookies of a kind
 * that isn't. Safe to call again with the same answer.
 */
export function syncTags(
    config: TagConfig,
    allowed: Allowed,
    win: Window = window,
    doc: Document = document,
): void {
    state.config = config;
    state.analytics = allowed.analytics && Boolean(config.gaId);
    state.ads = allowed.ads && hasAdTags(config);
    // Before any script is added or any call queued: nothing a tag reads
    // from the address, now or after a page change, is about someone else.
    if (state.analytics || state.ads) {
        takeAddress(win);
        guardHistory(win);
    }
    syncGoogle(win, doc);
    syncMeta(win, doc);
    if (!state.analytics) clearAnalyticsCookies(doc, win.location.hostname);
    if (!state.ads) clearAdsCookies(doc, win.location.hostname);
}

/**
 * Where a Google Analytics event goes: the measurement id, or null when
 * visit counts aren't allowed here. Events name it (`send_to`), so one
 * meant for Analytics never reaches the Google Ads account.
 */
export function analyticsDestination(): string | null {
    return state.analytics ? (state.config.gaId ?? null) : null;
}

/** The two things an ad can lead to that Saroh counts (DEC-127). */
export type Conversion = "waitlist_joined" | "sign_up_completed";

/** Meta's standard event for each. */
const META_EVENT: Record<Conversion, string> = {
    waitlist_joined: "Lead",
    sign_up_completed: "CompleteRegistration",
};

const firedKey = (name: Conversion) => `saroh-conversion:${name}`;

function alreadyFired(name: Conversion, id: string, win: Window): boolean {
    if (state.fired.has(`${name}:${id}`)) return true;
    try {
        return win.localStorage.getItem(firedKey(name)) === id;
    } catch {
        return false;
    }
}

function rememberFired(name: Conversion, id: string, win: Window): void {
    state.fired.add(`${name}:${id}`);
    try {
        win.localStorage.setItem(firedKey(name), id);
    } catch {
        // Storage is blocked; the page's own memory still stops a repeat.
    }
}

/**
 * Tells Google Ads and Meta that one conversion happened, and says which of
 * them was told. Nothing is sent unless advertising cookies were accepted
 * and that platform's tag is running, so it is a no-op without an id, before
 * consent, for the team and under a privacy signal. Google Ads needs the
 * conversion's label as well; without one only Meta is told.
 *
 * Only the fact is sent: the conversion's name and, when `id` is given, that
 * id (a time stamp, never a person), which lets each platform drop a repeat.
 * With an `id` the same conversion is sent once per browser, however often
 * the page is reloaded.
 */
export function fireConversion(
    name: Conversion,
    options: { id?: string; onSent?: () => void } = {},
    win: Window = window,
): { google: boolean; meta: boolean } {
    const told = { google: false, meta: false };
    if (!state.ads) return told;
    const { id, onSent } = options;
    if (id && alreadyFired(name, id, win)) return told;
    const { adsId, pixelId } = state.config;
    const label =
        name === "waitlist_joined"
            ? state.config.adsWaitlistLabel
            : state.config.adsSignupLabel;
    if (state.google && adsId && label && win.gtag) {
        win.gtag("event", "conversion", {
            send_to: `${adsId}/${label}`,
            page_location: cleanUrl(win.location.href),
            ...(id ? { transaction_id: id } : {}),
            ...(onSent ? { event_callback: onSent } : {}),
        });
        told.google = true;
    }
    if (state.meta && pixelId && win.fbq) {
        if (id) win.fbq("track", META_EVENT[name], {}, { eventID: id });
        else win.fbq("track", META_EVENT[name]);
        told.meta = true;
    }
    if (id && (told.google || told.meta)) rememberFired(name, id, win);
    return told;
}

/** For tests: a page that has loaded nothing. */
export function resetTags(
    win: Window = window,
    doc: Document = document,
): void {
    state = fresh();
    resetAddress(win);
    doc.querySelectorAll(`script[${MARK}]`).forEach((s) => s.remove());
    delete win.gtag;
    delete win.dataLayer;
    delete win.fbq;
    delete win._fbq;
}
