/**
 * "Publishing needs approval" (DEC-071, R10), as the site's settings show it.
 *
 * Pure, so a client component and a test can both reach it; the read that
 * asks the API lives in `publish-approval-read.ts`.
 */

/** The setting, for the settings screen. */
export interface PublishApproval {
    /** Whether only an approved test release can go live now. */
    on: boolean;
    /**
     * Whether this person may turn it on or off: an owner who can publish
     * (the API's `canOverride`, KTD-11). Everyone else reads it.
     */
    canChange: boolean;
}

/**
 * What the site read carries about the setting. The API's `getSite` sends
 * both (T9); they are optional here because an older API image doesn't.
 */
export interface PublishApprovalFields {
    publishNeedsApproval?: boolean;
    canOverride?: boolean;
}

/**
 * The setting to show, or null to show nothing.
 *
 * Hidden while test releases are off for the business (`SITE_TEST_RELEASES`):
 * the setting is about them, and the API refuses to turn it on without them.
 * The one exception is a setting already on — the API still enforces it, so
 * it stays in sight, and the owner can turn it off.
 */
export function publishApprovalOf(
    site: PublishApprovalFields,
    testReleasesOn: boolean,
): PublishApproval | null {
    const on = site.publishNeedsApproval === true;
    if (!testReleasesOn && !on) return null;
    return { on, canChange: site.canOverride === true };
}

/** What the rule does, said beside the owner's switch. */
export const PUBLISH_APPROVAL_RULE =
    "Only an approved test release can go live. You can still go live without approval; it's recorded.";

/** What someone who can't change it reads: only the owner can (KTD-11). */
export function publishApprovalLine(on: boolean): string {
    return `${on ? "On" : "Off"} · only the owner can change this`;
}
