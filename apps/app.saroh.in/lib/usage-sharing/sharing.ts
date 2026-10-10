/**
 * "Help improve Saroh" (DEC-125): the rules for the workspace's masked
 * session recordings that are this app's to decide. The recorder's own rules
 * (who may be recorded at all, and what a recording can hold) are in
 * `@saroh/error-tracking/browser`; the person's choice is kept by the API on
 * their user row, the same on every device.
 *
 * Pure, so it is tested without a browser or an API.
 */

/** What a person is asked, word for word, in Settings › Your profile. */
export const USAGE_SHARING_LABEL = "Help improve Saroh";
export const USAGE_SHARING_HELP =
    "Share how I use the workspace (text and numbers are hidden).";

/** The API's answer: `null` when the person has never chosen. */
export interface UsageSharing {
    sharesUsage: boolean | null;
}

/**
 * Whether recording is switched on for this environment at all: a PostHog
 * key and `NEXT_PUBLIC_POSTHOG_REPLAY` exactly "on". Off, the choice is not
 * even shown: a switch that does nothing would not be true.
 */
export function replaySwitchedOn(settings: {
    key: string | undefined;
    replay: string | undefined;
}): boolean {
    return Boolean(settings.key) && settings.replay === "on";
}

/**
 * Whether this person shares, where recording is switched on.
 *
 * - A saved `true` or `false` is what it says.
 * - Never chosen (`null`) is yes: the default, on only where recording is
 *   on, and theirs to turn off.
 * - A choice that could not be read (`read` is null) is no: nobody is
 *   recorded on a guess.
 */
export function sharesUsageNow(read: UsageSharing | null): boolean {
    if (!read) return false;
    return read.sharesUsage ?? true;
}
