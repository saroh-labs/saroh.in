import type { Prisma } from "@saroh/database";

import { resolveCapabilities } from "../organizations/organization-policy";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * The website's review, told to the other side (UX-043). Before, sharing
 * for review, a new test release, an approval, a note and a change request
 * notified nobody: a reviewer found a test release only by its link, and
 * the owner saw a verdict only by opening the editor.
 *
 * - **To the reviewers** (Saroh's own mail: a reviewer has no bell): a
 *   review asked for, and a new test release to look at.
 * - **To the people who publish** (the bell and the Website row's email,
 *   `site:publish`): a reviewer approved or asked for changes, or left the
 *   first note of a round. Later notes in the round land where the team is
 *   already pointed.
 *
 * Re-read when the alert runs: a release gone live or discarded since, or
 * a note on a release that has, says nothing.
 */

type Tx = Prisma.TransactionClient;

/** The bell's notice types, on the Website row (`alert-preferences.ts`). */
export const SITE_REVIEW_APPROVED_NOTIFICATION_TYPE = "site.review.approved";
export const SITE_REVIEW_CHANGES_NOTIFICATION_TYPE = "site.review.changes";
export const SITE_REVIEW_NOTE_NOTIFICATION_TYPE = "site.review.note";

/** How much of a note the notice quotes. */
const NOTE_QUOTE_MAX = 140;

type ReviewPayload = Extract<TeamAlertPayload, { event: "review" }>;

/** The review alert, worded; null when it no longer stands. */
export async function wordReview(
    tx: Tx,
    organizationId: string,
    p: ReviewPayload,
): Promise<WordedAlert | null> {
    switch (p.about) {
        case "approval":
            return wordApproval(tx, organizationId, p.approvalId);
        case "note":
            return wordNote(tx, organizationId, p.commentId);
        case "release":
            return wordRelease(tx, organizationId, p.testReleaseId);
    }
}

function nameOf(user: { name: string | null; email: string }): string {
    // `||`, not `??`: an empty name falls through too.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return user.name?.trim() || user.email;
}

/** A release still open to review: not discarded, not live. */
function open(release: {
    discardedAt: Date | null;
    wentLiveAt: Date | null;
}): boolean {
    return !release.discardedAt && !release.wentLiveAt;
}

/** "Spring menu on Rye & Co" or "Rye & Co". */
function subjectOf(
    site: string,
    release: { name: string } | null | undefined,
): string {
    return release ? `${release.name} on ${site}` : site;
}

/** "N open notes", for a verdict's body. */
async function openNotes(
    tx: Tx,
    organizationId: string,
    siteId: string,
    testReleaseId: string | null,
): Promise<number> {
    return tx.siteComment.count({
        where: { organizationId, siteId, testReleaseId, resolvedAt: null },
    });
}

/** Who last asked for this review: told of its verdict whatever they chose. */
async function lastAsker(
    tx: Tx,
    organizationId: string,
    siteId: string,
    testReleaseId: string | null,
    before: Date,
): Promise<string | null> {
    const asked = await tx.siteApproval.findFirst({
        where: {
            organizationId,
            siteId,
            testReleaseId,
            outcome: "REQUESTED",
            createdAt: { lte: before },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { byUserId: true },
    });
    return asked?.byUserId ?? null;
}

async function wordApproval(
    tx: Tx,
    organizationId: string,
    approvalId: string,
): Promise<WordedAlert | null> {
    const a = await tx.siteApproval.findFirst({
        where: { id: approvalId, organizationId },
        select: {
            id: true,
            siteId: true,
            outcome: true,
            byUserId: true,
            createdAt: true,
            testReleaseId: true,
            by: { select: { name: true, email: true } },
            site: { select: { name: true } },
            testRelease: {
                select: { name: true, discardedAt: true, wentLiveAt: true },
            },
        },
    });
    if (!a) return null;
    if (a.testRelease && !open(a.testRelease)) return null;
    const who = nameOf(a.by);
    const subject = subjectOf(a.site.name, a.testRelease);
    const base = {
        event: "site" as const,
        eventKey: `team:review:${a.id}`,
        notificationId: null,
        skipUserId: a.byUserId,
    };

    if (a.outcome === "REQUESTED") {
        return {
            ...base,
            type: "site.review.requested",
            title: `${who} asked you to review ${subject}`,
            body: "Open it to leave notes on what you see, then approve it or ask for changes.",
            path: a.testReleaseId
                ? `/sites/${a.siteId}/releases/${a.testReleaseId}`
                : `/sites/${a.siteId}/review`,
            noBell: true,
            sarohMail: "REVIEWERS",
            siteId: a.siteId,
            cta: "Open the review",
        };
    }
    if (a.outcome !== "APPROVED" && a.outcome !== "CHANGES_REQUESTED") {
        return null;
    }
    const [notes, asker] = await Promise.all([
        openNotes(tx, organizationId, a.siteId, a.testReleaseId),
        lastAsker(tx, organizationId, a.siteId, a.testReleaseId, a.createdAt),
    ]);
    const noteWords = `${notes} open note${notes === 1 ? "" : "s"}`;
    const path = a.testReleaseId
        ? `/sites/${a.siteId}/releases`
        : `/sites/${a.siteId}/pages`;
    if (a.outcome === "APPROVED") {
        return {
            ...base,
            type: SITE_REVIEW_APPROVED_NOTIFICATION_TYPE,
            title: `${who} approved ${subject}`,
            body:
                notes > 0
                    ? `With ${noteWords} to look at before it goes live.`
                    : "No notes are left open.",
            path,
            alwaysUserId: asker,
        };
    }
    return {
        ...base,
        type: SITE_REVIEW_CHANGES_NOTIFICATION_TYPE,
        title: `${who} asked for changes to ${subject}`,
        body:
            notes > 0
                ? `Their ${noteWords} say what to change.`
                : "Open the review to see what they asked for.",
        path,
        alwaysUserId: asker,
    };
}

/**
 * A reviewer's note, told once per reviewer per round of review (the
 * latest time it was asked for): the first says "come and look", the rest
 * are on the page they open. A note by someone who publishes is the team
 * talking to itself, and says nothing.
 */
async function wordNote(
    tx: Tx,
    organizationId: string,
    commentId: string,
): Promise<WordedAlert | null> {
    const c = await tx.siteComment.findFirst({
        where: { id: commentId, organizationId },
        select: {
            siteId: true,
            body: true,
            pageTitle: true,
            authorUserId: true,
            createdAt: true,
            testReleaseId: true,
            author: { select: { name: true, email: true } },
            site: { select: { name: true } },
            testRelease: {
                select: { name: true, discardedAt: true, wentLiveAt: true },
            },
        },
    });
    if (!c) return null;
    if (c.testRelease && !open(c.testRelease)) return null;
    const member = await tx.membership.findUnique({
        where: {
            organizationId_userId: { organizationId, userId: c.authorUserId },
        },
        select: { role: true },
    });
    if (!member) return null;
    const custom = await tx.organizationRole.findFirst({
        where: { organizationId, key: member.role },
        select: { actions: true },
    });
    if (
        resolveCapabilities(member.role, custom?.actions ?? null).has(
            "site:publish",
        )
    ) {
        return null;
    }
    const round = await tx.siteApproval.findFirst({
        where: {
            organizationId,
            siteId: c.siteId,
            testReleaseId: c.testReleaseId,
            outcome: "REQUESTED",
            createdAt: { lte: c.createdAt },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true },
    });
    const line = c.body.replace(/\s+/g, " ").trim();
    const quote =
        line.length > NOTE_QUOTE_MAX
            ? `${line.slice(0, NOTE_QUOTE_MAX - 1).trimEnd()}…`
            : line;
    const where = c.pageTitle ? `On ${c.pageTitle}: ` : "";
    return {
        event: "site",
        eventKey: `team:review-note:${c.siteId}:${c.testReleaseId ?? "draft"}:${c.authorUserId}:${round?.id ?? "none"}`,
        notificationId: null,
        type: SITE_REVIEW_NOTE_NOTIFICATION_TYPE,
        title: `${nameOf(c.author)} left a note on ${subjectOf(c.site.name, c.testRelease)}`,
        body: `${where}“${quote}”`,
        path: c.testReleaseId
            ? `/sites/${c.siteId}/releases`
            : `/sites/${c.siteId}/pages`,
        skipUserId: c.authorUserId,
    };
}

/** A new test release, for the site's reviewers to look over. */
async function wordRelease(
    tx: Tx,
    organizationId: string,
    testReleaseId: string,
): Promise<WordedAlert | null> {
    const r = await tx.siteTestRelease.findFirst({
        where: { id: testReleaseId, organizationId },
        select: {
            id: true,
            siteId: true,
            name: true,
            discardedAt: true,
            wentLiveAt: true,
            createdByUserId: true,
            site: { select: { name: true } },
        },
    });
    if (!r || !open(r)) return null;
    const by = await tx.user.findUnique({
        where: { id: r.createdByUserId },
        select: { name: true, email: true },
    });
    const who = by ? nameOf(by) : "Someone on the team";
    return {
        event: "site",
        eventKey: `team:review-release:${r.id}`,
        notificationId: null,
        type: "site.release.new",
        title: `${who} made a test release of ${r.site.name}: ${r.name}`,
        body: "It isn't live. Open it to look it over and leave notes before it goes live.",
        path: `/sites/${r.siteId}/releases/${r.id}`,
        skipUserId: r.createdByUserId,
        noBell: true,
        sarohMail: "REVIEWERS",
        siteId: r.siteId,
        cta: "Open the test release",
    };
}
