/**
 * "Help improve Saroh" (DEC-125): the rules for the workspace's session
 * recordings that are this app's to decide. The recorder's own rules
 * (who may be recorded at all, and what a recording can hold) are in
 * `@saroh/error-tracking/browser`; the person's choice is kept by the API on
 * their user row, the same on every device.
 *
 * Pure, so it is tested without a browser or an API.
 */

/** What a person is asked, word for word, in Settings › Your profile. */
export const USAGE_SHARING_LABEL = "Help improve Saroh";
export const USAGE_SHARING_HELP =
    "Share how I use the workspace (your customers' details and anything you type are hidden).";

/**
 * The one-time notice (owner, 10 Oct), word for word. Shown above the
 * workspace the first time a person opens it where recording is on, and
 * until they dismiss it; nothing is recorded before it has been shown.
 */
export const USAGE_NOTICE = {
    body: "We record how the workspace is used to make Saroh easier. Your customers' details and anything you type are hidden.",
    turnOff: "Turn it off in",
    settings: "Settings › Your profile",
    href: "/settings/profile",
    dismiss: "Got it",
} as const;

/** The API's answer: `null` when the person has never chosen. */
export interface UsageSharing {
    sharesUsage: boolean | null;
    /** When they dismissed the notice (ISO), or null while it is still due. */
    noticeSeenAt: string | null;
}

/**
 * Whether the notice is still to be shown: recording could start for this
 * person (their choice was read, and they share) and they have not
 * dismissed it. Someone who has turned sharing off has already been to the
 * setting it points at, and is not recorded: nothing to tell them.
 */
export function usageNoticeDue(read: UsageSharing | null): boolean {
    return sharesUsageNow(read) && !read?.noticeSeenAt;
}

/**
 * Whether the notice has been shown to this person: dismissed on an earlier
 * visit, or on screen in this tab now. The recorder waits for it.
 */
export function usageNoticeShown(
    read: UsageSharing | null,
    onScreenNow: boolean,
): boolean {
    return Boolean(read?.noticeSeenAt) || onScreenNow;
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
