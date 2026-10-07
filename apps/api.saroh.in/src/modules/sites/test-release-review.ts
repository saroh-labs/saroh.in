import type { ApprovalRow, ReviewStanding } from "./review-route";
import { ReviewRoute, reviewStanding } from "./review-route";

/**
 * Review on a test release (DEC-071, KTD-10, T8). Pure: given verdict rows,
 * never a query, so going live, the schedule, its job and the list all ask
 * the same question of their own rows and get the same answer.
 *
 * A review request or verdict that names a release carries `testReleaseId`
 * and the release's fingerprint, never the draft's. So:
 *
 *  - **A release reads only verdicts given on a release**, never the draft's
 *    own review. Asking for a review of the draft doesn't hold up a release,
 *    and approving the draft doesn't approve one: a reviewer approves what
 *    they looked at.
 *  - **Verdicts match by fingerprint.** An approval of release 2 doesn't
 *    settle release 3 unless both froze the same bytes. When they did, it
 *    settles both, which is honest: it is the same content.
 *  - **The rule is `reviewStanding`'s**, with the release's fingerprint as
 *    the current one. So an approval by the person going live settles
 *    nothing (#278), and a change request, or a new review request, newer
 *    than the approval unsettles it.
 */

/** A verdict row, and the release it was given on (null: the draft). */
export interface VerdictRow extends ApprovalRow {
    testReleaseId?: string | null;
    /** What a change request asked for (UX-043). */
    reason?: string | null;
}

/** The verdicts about the draft: every one that names no release. */
export function draftVerdicts<T extends VerdictRow>(verdicts: T[]): T[] {
    return verdicts.filter((v) => !onRelease(v));
}

function onRelease(v: VerdictRow): boolean {
    // `??`: a row read without the column is a draft verdict, as every
    // verdict was before releases existed.
    return (v.testReleaseId ?? null) !== null;
}

/**
 * The verdicts about a release: given on a release that froze exactly
 * these bytes. Keeps the order it is given (newest first).
 */
export function releaseVerdicts<T extends VerdictRow>(
    verdicts: T[],
    release: { fingerprint: string },
): T[] {
    return verdicts.filter(
        (v) => onRelease(v) && v.draftFingerprint === release.fingerprint,
    );
}

/** Where a release stands with its reviewers, for `actorUserId` going live. */
export function releaseStanding(
    /** Every REQUESTED / APPROVED / CHANGES_REQUESTED row, newest first. */
    verdicts: VerdictRow[],
    release: { fingerprint: string },
    actorUserId: string | null,
): ReviewStanding {
    return reviewStanding(
        releaseVerdicts(verdicts, release),
        release.fingerprint,
        actorUserId,
    );
}

/**
 * "An approved test release" (KTD-10): its newest approval is by someone
 * other than `actorUserId`, and no change request or review request on it
 * is newer. What going live records as APPROVED, and what "Publishing needs
 * approval" asks for (R10).
 */
export function releaseApproved(
    verdicts: VerdictRow[],
    release: { fingerprint: string },
    actorUserId: string,
): boolean {
    return (
        releaseStanding(verdicts, release, actorUserId).route ===
        ReviewRoute.Approved
    );
}

/**
 * A note on a release names its section by position: `"0"` for the page's
 * first section in the frozen snapshot. A snapshot keeps no section keys
 * (it is the site as served), and a frozen page's sections never move, so
 * the position is the section.
 */
export function releaseSectionKey(index: number): string {
    return String(index);
}

/** Whether `sectionKey` names a section of a frozen page with `count` sections. */
export function isReleaseSectionKey(
    sectionKey: string,
    count: number,
): boolean {
    if (!/^(0|[1-9]\d*)$/.test(sectionKey)) return false;
    return Number(sectionKey) < count;
}
