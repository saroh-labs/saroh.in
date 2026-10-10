/**
 * The names and limits every app shares when it reports to PostHog
 * (DEC-123). One PostHog project holds development and production, so every
 * event says which environment and which app it came from.
 */

/** Where reports go when `POSTHOG_HOST` is unset: PostHog's EU cloud. */
export const DEFAULT_TRACKING_HOST = "https://eu.i.posthog.com";

/** Which Saroh app sent an event: the Turbo package names, plus the API. */
export type TrackedApp =
    "api" | "application" | "auth" | "admin" | "web" | "sites";

export type TrackedEnvironment = "development" | "production";

/**
 * A deployed Next app's environment, from the marker its wrangler.jsonc sets
 * (`VERCEL_ENV`, DEC-107). An allowlist: only the production Worker says
 * "production"; the dev Workers, a preview and a laptop are "development".
 */
export function trackedEnvironment(
    vercelEnv: string | undefined,
): TrackedEnvironment {
    return vercelEnv === "production" ? "production" : "development";
}

/** The tracker's address without a trailing slash, or the default. */
export function trackingHost(host: string | undefined): string {
    const value = (host ?? "").trim().replace(/\/+$/u, "");
    return value || DEFAULT_TRACKING_HOST;
}

/**
 * How long a server waits for PostHog before giving up on one report. PostHog
 * being slow or down never holds a response longer than this, and never
 * fails one.
 */
export const SEND_TIMEOUT_MS = 2_000;

/**
 * Per-process caps on exceptions sent, so one bad bug can't spend the
 * month's quota (the free plan's 100,000 exceptions). Past a cap, errors are
 * still logged; they are only not forwarded. Worst case for one process:
 * 100 an hour, about 72,000 a month.
 */
export const MAX_EXCEPTIONS_PER_MINUTE = 10;
export const MAX_EXCEPTIONS_PER_HOUR = 100;

/**
 * Browser caps, per page load ("session": nothing is stored, so a reload
 * starts again). The same error is sent once; at most this many different
 * errors are sent.
 */
export const MAX_BROWSER_EXCEPTIONS_PER_SESSION = 20;

/**
 * A sliding cap: `allow()` is true until `perMinute` in the last minute or
 * `perHour` in the last hour have been allowed.
 */
export function createRateCap(
    perMinute: number = MAX_EXCEPTIONS_PER_MINUTE,
    perHour: number = MAX_EXCEPTIONS_PER_HOUR,
    now: () => number = Date.now,
): { allow(): boolean } {
    let sent: number[] = [];
    return {
        allow() {
            const at = now();
            sent = sent.filter((t) => at - t < 3_600_000);
            if (sent.length >= perHour) return false;
            if (sent.filter((t) => at - t < 60_000).length >= perMinute)
                return false;
            sent.push(at);
            return true;
        },
    };
}
