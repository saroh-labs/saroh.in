/**
 * Reviewing a test release, and version history that names them (DEC-071,
 * T12): the words, and the frozen page a reviewer reads. Pure, so the
 * version list, the release view and vitest can all reach it.
 */

import type {
    PublicationRelease,
    PublishedPage,
    ReviewableSection,
    SitePublication,
    UnrenderableSection,
} from "./service";

/**
 * "Test release 2 · Diwali menu", or just "Test release 2" when the release
 * kept its default name, which would otherwise be said twice.
 */
export function releaseTitle(release: { number: number; name: string }) {
    const number = `Test release ${release.number}`;
    return release.name.trim() === number
        ? number
        : `${number} · ${release.name}`;
}

/** What a review panel is about: the draft, or one test release. */
export function reviewSubject(
    release: PublicationRelease | null | undefined,
): string {
    return release ? releaseTitle(release) : "Draft";
}

/**
 * Where a release's review stands, as the release view says it: the newest
 * word on its bytes, from anyone (T8). Unlike the editor's `standingCopy`,
 * which answers "could I go live with it", this is what a reviewer reads,
 * so their own approval reads as the approval it is.
 */
export function releaseVerdictLine(
    latest: { outcome: string; by: string | null } | null | undefined,
): string {
    if (!latest) return "Nobody has reviewed this test release yet.";
    const who = latest.by ?? "Someone";
    switch (latest.outcome) {
        case "APPROVED":
            return `${who} approved this test release.`;
        case "CHANGES_REQUESTED":
            return `${who} asked for changes.`;
        case "REQUESTED":
            return `${who} asked for a review.`;
        case "BYPASSED":
            return `${who} went live without waiting for approval.`;
        case "OVERRIDDEN":
            return `${who} went live without approval.`;
        default:
            return "Nobody has reviewed this test release yet.";
    }
}

// ---------------------------------------------------------------------------
// A version in the history
// ---------------------------------------------------------------------------

export type VersionBadgeTone = "success" | "neutral" | "warning" | "error";

export interface VersionBadge {
    label: string;
    tone: VersionBadgeTone;
}

export interface VersionLine {
    text: string;
    tone: "muted" | "warning";
    /** The test release this line names, to link to it. */
    releaseId?: string;
}

export interface VersionRowCopy {
    /** Beside the date: Live, and how it got past its reviewers. */
    badges: VersionBadge[];
    /** Under it: who put it live, what it came from, and any record. */
    lines: VersionLine[];
}

/**
 * How one version reads in the history (#278, #283, T12).
 *
 * - The route is a badge for what a merchant acts on: Approved, Bypassed
 *   (past a change request, #199), or "Overridden by ‹owner›" (past
 *   "Publishing needs approval", T9). NONE, nobody was asked, is the
 *   ordinary case and says nothing: repeating it down fifteen versions is
 *   noise.
 * - A bypass and an override each keep their line saying who and why,
 *   never only a badge, so the record reads without hover.
 * - A version that went live from a test release says which.
 */
export function versionRowCopy(p: SitePublication): VersionRowCopy {
    const badges: VersionBadge[] = [];
    const lines: VersionLine[] = [];

    if (p.isCurrent) badges.push({ label: "Live", tone: "success" });

    const override = p.override ?? null;
    const route = p.reviewRoute;
    if (route === "APPROVED") {
        badges.push({ label: "Approved", tone: "neutral" });
    }
    if (p.bypass || route === "BYPASSED") {
        badges.push({ label: "Bypassed", tone: "warning" });
    }
    if (override || route === "OVERRIDDEN") {
        badges.push({
            label: override ? `Overridden by ${override.by}` : "Overridden",
            tone: "error",
        });
    }

    const release = p.testRelease ?? null;
    lines.push({
        text: p.publishedBy
            ? `${release ? "Went live" : "Published"} by ${p.publishedBy}`
            : "Publisher not recorded",
        tone: "muted",
    });
    if (release) {
        lines.push({
            text: `From ${releaseTitle(release).replace(/^Test/, "test")}`,
            tone: "muted",
            releaseId: release.id,
        });
    }
    if (route === "APPROVED") {
        lines.push({
            text: "A reviewer approved this version",
            tone: "muted",
        });
    }
    if (p.bypass) {
        lines.push({
            text: `Published without approval by ${p.bypass.by} — a reviewer had asked for changes.`,
            tone: "warning",
        });
    }
    if (override) {
        lines.push({
            text: `${override.by} went live without approval. Publishing needs approval on this site, and an owner overrode it.`,
            tone: "warning",
        });
    }
    return { badges, lines };
}

// ---------------------------------------------------------------------------
// A frozen page, as a reviewer reads it
// ---------------------------------------------------------------------------

/**
 * A release's frozen page as sections to read and pin notes to (T8, T12).
 *
 * The snapshot keeps no section keys, so a note on a release pins a section
 * by its POSITION on the frozen page: "0", "1", … in the page's own order.
 * Positions are taken before anything is left out, so a section this build
 * can no longer draw leaves a gap rather than shifting every note after it
 * onto the wrong section.
 */
export function frozenSections(
    page: PublishedPage,
    unrenderable: UnrenderableSection[],
): ReviewableSection[] {
    const skipped = new Set(
        unrenderable.filter((u) => u.path === page.path).map((u) => u.index),
    );
    return page.sections.flatMap((section, index) =>
        skipped.has(index)
            ? []
            : [
                  {
                      key: String(index),
                      type: section.type,
                      contractVersion: 1,
                      label: null,
                      hidden: false,
                      content: section.content,
                  },
              ],
    );
}

// ---------------------------------------------------------------------------
// Restoring while "Publishing needs approval" is on
// ---------------------------------------------------------------------------

/**
 * Whether Restore is open to this person (DEC-071, Q3): with the setting on,
 * a restore is refused unless an owner overrides, and the override is
 * recorded (T9). Anyone else sees why beside the control.
 */
export type RestoreGate =
    { kind: "go" } | { kind: "override" } | { kind: "blocked"; why: string };

export const RESTORE_NEEDS_OWNER =
    "Publishing needs approval, so only an approved test release can go live. Only an owner can restore a version without approval.";

/** What an owner's restore past the setting leaves behind, said first. */
export const RESTORE_OVERRIDE_LINE =
    "Publishing needs approval on this site. As an owner you can restore without it, and it's recorded as gone live without approval: in version history, in the review history and in the business's activity log.";

export function restoreGate(site: {
    publishNeedsApproval?: boolean;
    canOverride?: boolean;
}): RestoreGate {
    if (site.publishNeedsApproval !== true) return { kind: "go" };
    return site.canOverride === true
        ? { kind: "override" }
        : { kind: "blocked", why: RESTORE_NEEDS_OWNER };
}
