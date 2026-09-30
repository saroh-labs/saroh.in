/**
 * Test releases in the editor (DEC-071, T11): what the API says about them,
 * and every word the editor says back. Pure, and free of `next/headers`, so
 * the panel, its sheets and the top bar (client components) and vitest can
 * all read it. The reads and writes are `test-releases-api.ts` and
 * `test-releases-actions.ts`.
 *
 * The API decides who may do what, and refuses; these words only say it
 * first, beside the control it disables (frontend-design-system.md: "Say why
 * a control is disabled, nearby").
 */

// "What's live" (R6) is one list, shared with the Test release bar on the
// merchant's site (T5) rather than copied.
export { LIVE_OUTSIDE_RELEASE } from "@saroh/site-blocks/test-release-words";

export type {
    CreatedTestReleaseLink,
    GoLiveResult,
    TestRelease,
    TestReleaseLink,
    TestReleaseLinkState,
    TestReleaseList,
    TestReleasesRead,
    TestReleaseStanding,
    TestReleaseStatus,
} from "./test-release-types";
export { clockTime, dayKey, nextSlot, whenIn, zoneName } from "./zone-time";
import type {
    GoLiveResult,
    TestRelease,
    TestReleaseLink,
    TestReleaseStanding,
} from "./test-release-types";
import { shortDay, whenIn, zoneName } from "./zone-time";

/** How long a shared link works, as the API accepts it. */
export type TestReleaseLinkDays = 1 | 7 | 30;

export const LINK_DAY_CHOICES: { days: TestReleaseLinkDays; label: string }[] =
    [
        { days: 1, label: "1 day" },
        { days: 7, label: "7 days" },
        { days: 30, label: "30 days" },
    ];

/**
 * What a test release freezes: everything a publish puts live. The rest (R6,
 * `LIVE_OUTSIDE_RELEASE`) comes from the live business.
 */
export const FROZEN_IN_RELEASE = [
    "Every page and its blocks",
    "The menu and the footer",
    "The look: colours, type and logo",
    "Search and share settings",
] as const;

// ---------------------------------------------------------------------------
// A release's status
// ---------------------------------------------------------------------------

export type ReleaseTone = "success" | "draft" | "neutral" | "error" | "info";

export interface ReleaseStatusCopy {
    label: string;
    tone: ReleaseTone;
    /** The line under the name: what happened, when and by whom. */
    line: string;
}

function by(name: string | null): string {
    return name ? ` by ${name}` : "";
}

/**
 * A release's pill and its line, from what the API says it is. A schedule is
 * said in the business's zone; a scheduled go-live that didn't happen says
 * why, in the API's words, which end with what to do next.
 */
export function releaseStatusCopy(
    release: TestRelease,
    zone: string,
    now: Date = new Date(),
): ReleaseStatusCopy {
    const made = `Made ${whenIn(release.createdAt, zone, now)}${by(release.createdBy.name)}`;
    switch (release.status) {
        case "live":
            return {
                label: "Live",
                tone: "success",
                line: `Went live ${whenIn(release.wentLiveAt ?? release.createdAt, zone, now)}`,
            };
        case "discarded":
            return {
                label: "Discarded",
                tone: "neutral",
                line: `Discarded ${whenIn(release.discardedAt ?? release.createdAt, zone, now)}. Its links no longer open it.`,
            };
        case "scheduled": {
            const schedule = release.schedule;
            const at = schedule
                ? whenIn(schedule.goLiveAt, schedule.zone ?? zone, now)
                : null;
            return {
                label: "Scheduled",
                tone: "info",
                line: at
                    ? `Goes live ${at} (${zoneName(schedule?.zone ?? zone)})${by(schedule?.by.name ?? null)}`
                    : made,
            };
        }
        case "ready":
        default:
            if (release.lastGoLive?.outcome === "NOT_LIVE") {
                return {
                    label: "Didn't go live",
                    tone: "error",
                    line:
                        release.lastGoLive.reason ??
                        "The scheduled go-live didn't happen. Go live now, or schedule it again.",
                };
            }
            return { label: "Ready", tone: "draft", line: made };
    }
}

/**
 * The top bar's word on a scheduled go-live: "Going live Fri 6:00pm · Diwali
 * menu". Null when nothing is scheduled.
 */
export function scheduledReadout(
    releases: TestRelease[],
    zone: string,
    now: Date = new Date(),
): string | null {
    const next = releases.find((r) => r.status === "scheduled" && r.schedule);
    if (!next?.schedule) return null;
    return `Going live ${whenIn(next.schedule.goLiveAt, next.schedule.zone ?? zone, now)} · ${next.name}`;
}

/** The release a scheduled go-live belongs to, if any (one per site). */
export function scheduledRelease(releases: TestRelease[]): TestRelease | null {
    return releases.find((r) => r.status === "scheduled" && r.schedule) ?? null;
}

/**
 * Publish while a go-live is scheduled (KTD-14): the schedule won't run,
 * because the live site will have moved on since it was made.
 */
export function publishOverScheduleWarning(
    release: TestRelease,
    zone: string,
    now: Date = new Date(),
): string {
    const at = release.schedule
        ? whenIn(release.schedule.goLiveAt, release.schedule.zone ?? zone, now)
        : "later";
    return `“${release.name}” is scheduled to go live ${at}. If you publish now, it won't go live then, because the live site will have changed since it was scheduled. You can go live with it now or schedule it again.`;
}

// ---------------------------------------------------------------------------
// Review standing
// ---------------------------------------------------------------------------

/**
 * Where a release stands with its reviewers, in a line: the newest verdict
 * on these bytes, never on the draft (KTD-10).
 */
export function standingCopy(standing: TestReleaseStanding): {
    text: string;
    approved: boolean;
} {
    const latest = standing.latest;
    const who = latest?.by ?? "Someone";
    if (latest === null) {
        return { text: "Not reviewed yet", approved: false };
    }
    switch (latest.outcome) {
        case "APPROVED":
            return standing.approved
                ? { text: `Approved by ${who}`, approved: true }
                : {
                      // Self-approval never counts (KTD-10): said, not hidden.
                      text: `Approved by ${who}. It needs someone else's approval to count for you.`,
                      approved: false,
                  };
        case "CHANGES_REQUESTED":
            return { text: `${who} asked for changes`, approved: false };
        case "REQUESTED":
            return { text: `In review — asked by ${who}`, approved: false };
        default:
            return { text: "Not reviewed yet", approved: false };
    }
}

// ---------------------------------------------------------------------------
// What this person may do with a release
// ---------------------------------------------------------------------------

export interface ReleaseAbilities {
    /** `site:publish`: go live, schedule, cancel. */
    canPublish: boolean;
    /** `site:update`: make, rename, share, discard. */
    canUpdate: boolean;
    /** "Publishing needs approval" is on for the site (R10). */
    needsApproval: boolean;
    /** An owner who can publish: may go live past that setting (KTD-11). */
    canOverride: boolean;
}

/**
 * Whether Go live (and Schedule) is open to this person for this release:
 * `go`, `override` (an owner, past the setting, with a record), or
 * `blocked` with the reason said beside the disabled control.
 */
export type GoLiveGate =
    | { kind: "go" }
    | { kind: "override"; why: string }
    | { kind: "blocked"; why: string };

export const NEEDS_PUBLISH_PERMISSION =
    "Going live needs permission to publish the site. An owner or admin can go live with it.";
export const NEEDS_APPROVAL_OTHERS =
    "Publishing needs approval: this test release can go live once someone other than you approves it. Only an owner can go live without approval.";
export const NEEDS_APPROVAL_OWNER =
    "Publishing needs approval, and this test release isn't approved yet.";

export function goLiveGate(
    release: TestRelease,
    can: ReleaseAbilities,
): GoLiveGate {
    if (release.status === "live") {
        return { kind: "blocked", why: "This test release is live now." };
    }
    if (release.status === "discarded") {
        return { kind: "blocked", why: "This test release was discarded." };
    }
    if (release.status === "scheduled") {
        return {
            kind: "blocked",
            why: "It's scheduled to go live. Cancel the scheduled go-live first.",
        };
    }
    if (!can.canPublish)
        return { kind: "blocked", why: NEEDS_PUBLISH_PERMISSION };
    if (can.needsApproval && !release.standing.approved) {
        return can.canOverride
            ? { kind: "override", why: NEEDS_APPROVAL_OWNER }
            : { kind: "blocked", why: NEEDS_APPROVAL_OTHERS };
    }
    return { kind: "go" };
}

/**
 * What going live leaves behind when it's an owner's override (KTD-11):
 * named before it happens, in the destructive confirmation.
 */
export const OVERRIDE_RECORD =
    "It's recorded as gone live without approval: in version history, in the review history and in the business's activity log.";

/** "Replaces the version live since today, 3:10pm." Or the first go-live. */
export function replacesLine(
    livePublishedAt: string | null,
    zone: string,
    now: Date = new Date(),
): string {
    return livePublishedAt
        ? `It replaces the version that's been live since ${whenIn(livePublishedAt, zone, now)}. Your draft is left as it is.`
        : "Nothing is live yet, so this puts the site live for the first time. Your draft is left as it is.";
}

/** The toast after going live, from what the API says it replaced. */
export function wentLiveToast(
    result: GoLiveResult,
    zone: string,
    now: Date = new Date(),
): string {
    const name = result.release.name;
    const replaced = result.replaced
        ? ` It replaced the version published ${whenIn(result.replaced.publishedAt, zone, now)}${by(result.replaced.publishedBy.name)}.`
        : "";
    const record = result.overridden
        ? " Recorded as gone live without approval."
        : result.bypassed
          ? " Recorded as published without approval."
          : "";
    return `“${name}” is live.${replaced}${record}`;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** A shared link's line: until when it works, and whether it was opened. */
export function linkLine(
    link: TestReleaseLink,
    zone: string,
    now: Date = new Date(),
): string {
    const opened = link.lastUsedAt
        ? `Last opened ${whenIn(link.lastUsedAt, zone, now)}`
        : "Not opened yet";
    switch (link.state) {
        case "active":
            return `Works until ${shortDay(link.expiresAt, zone)} · ${opened}`;
        case "expired":
            return `Stopped working on ${shortDay(link.expiresAt, zone)} · ${opened}`;
        case "revoked":
            return `Turned off · ${opened}`;
        case "ended":
        default:
            return `Stopped working with its release · ${opened}`;
    }
}

/** The links a row lists: the shared ones, not the ones made to open it. */
export function sharedLinks(release: TestRelease): TestReleaseLink[] {
    return release.links.filter((l) => l.purpose === "SHARE");
}
