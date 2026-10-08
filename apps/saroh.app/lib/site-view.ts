/**
 * The page-view beacon's rules (UX-032): what a merchant site tells the API
 * when a visitor opens a page, so Insights and the plan's site-visits count
 * see real visits.
 *
 * Privacy by construction, so no cookie banner is needed for it:
 *
 * - no cookie, no storage, no identifier of any kind leaves the browser; the
 *   API turns the request's address into a salted hash and drops the address
 *   (`AnalyticsService.ingestPublic`), and the event is stamped `anonymous`;
 * - a visitor whose browser asks not to be tracked (Do Not Track or Global
 *   Privacy Control) sends nothing at all;
 * - only the path is sent, never the query (a pay link or a test-release
 *   token travels there), and the referrer only as its origin;
 * - the signed-in account area sends nothing: its paths name orders and
 *   bookings, and a customer reading their own account isn't a site visit.
 */

/** The event the public intake accepts (`PUBLIC_INGESTABLE_TYPES`). */
export const SITE_VIEW_TYPE = "site.view";

/** The intake's own bound on a path (`MAX_PATH_LEN` in the contract). */
const MAX_PATH = 2048;

/** What a browser says about tracking, read from `navigator`. */
export interface TrackingSignals {
    doNotTrack?: string | null;
    globalPrivacyControl?: boolean;
}

/** True when the visitor's browser asked not to be tracked. */
export function asksNotToTrack(signals: TrackingSignals): boolean {
    return signals.doNotTrack === "1" || signals.globalPrivacyControl === true;
}

/** True for a path the beacon never reports. */
export function isPrivatePath(path: string): boolean {
    return path === "/account" || path.startsWith("/account/");
}

/** A referrer reduced to its origin, or undefined (none, or this site). */
export function referrerOrigin(
    referrer: string,
    ownHost: string,
): string | undefined {
    if (!referrer) return undefined;
    try {
        const url = new URL(referrer);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return undefined;
        }
        if (url.host === ownHost) return undefined;
        return url.origin;
    } catch {
        return undefined;
    }
}

/** The intake's address for one site. */
export function siteViewUrl(apiUrl: string, siteId: string): string {
    return `${apiUrl.replace(/\/+$/, "")}/public/sites/${encodeURIComponent(siteId)}/analytics/events`;
}

/**
 * The body for one page view, or null when nothing should be sent.
 * `path` is the pathname only; a query is cut off if one slips in.
 */
export function siteViewBody(input: {
    path: string;
    referrer: string;
    ownHost: string;
    signals: TrackingSignals;
}): Record<string, unknown> | null {
    if (asksNotToTrack(input.signals)) return null;
    const path = (input.path.split(/[?#]/)[0] ?? "").slice(0, MAX_PATH) || "/";
    if (isPrivatePath(path)) return null;
    const properties: Record<string, string> = { path };
    const from = referrerOrigin(input.referrer, input.ownHost);
    if (from) properties.referrer = from;
    return {
        type: SITE_VIEW_TYPE,
        schemaVersion: 1,
        consent: "anonymous",
        properties,
    };
}
