import {
    heldBackSummary,
    unfinishedPhrase,
} from "@/components/sites/held-back-copy";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import type { EditorStatus, EditorStatusTone } from "@/lib/sites/editor-status";
import { editorStatus } from "@/lib/sites/editor-status";
import { exactDate } from "@/lib/sites/format-date";
import type { ApprovalOutcome, ReviewState } from "@/lib/sites/service";

/**
 * The bar's verdict badge, worded per outcome. Keyed by the union so a new
 * outcome is a type error here rather than a badge that falls through to
 * "asked for changes". Only an approval takes the accent: it is the one
 * good-news verdict.
 *
 * `stale` is whether the newest approval was of a different draft than the one
 * that would go live now (#278). #193: an approval "does not survive later
 * edits to that draft" — so the badge must not keep claiming it does, and an
 * approval that no longer covers the work does not keep the accent either.
 */
export const APPROVAL_BADGE: Record<
    ApprovalOutcome,
    {
        approved: (stale: boolean) => boolean;
        text: (by: string, stale: boolean) => string;
    }
> = {
    REQUESTED: {
        approved: () => false,
        text: (by) => `In review — asked by ${by}`,
    },
    APPROVED: {
        approved: (stale) => !stale,
        text: (by, stale) =>
            stale ? `Approved by ${by}, then edited` : `Approved by ${by}`,
    },
    CHANGES_REQUESTED: {
        approved: () => false,
        text: (by) => `${by} asked for changes`,
    },
    BYPASSED: {
        approved: () => false,
        text: (by) => `Published without approval by ${by}`,
    },
    // An owner went live past "Publishing needs approval" (DEC-071, T9).
    OVERRIDDEN: {
        approved: () => false,
        text: (by) => `Gone live without approval by ${by}`,
    },
};

/**
 * Why Publish reads "Needs approval" (DEC-071, R10): the API's own words for
 * the refusal (`APPROVAL_REQUIRED`), said before it is pressed.
 */
export const NEEDS_APPROVAL_HINT =
    "This site goes live only from an approved test release.";

/** The status pill's colour, by what it means (#335). */
export const STATUS_BADGE: Record<
    EditorStatusTone,
    "error" | "draft" | "neutral" | "success"
> = {
    danger: "error",
    attention: "draft",
    quiet: "neutral",
    done: "success",
};

/**
 * What the top bar says about the draft: the pill, the line beside it, and
 * the fuller account its title gives on hover (#260). Since G2 the pill says
 * what publishing would put live itself, and the line carries only what the
 * pill leaves out.
 */
export function statusReadout({
    saving,
    styleSaving,
    saveError,
    onlyHeldBack,
    heldBack,
    dirty,
    styleDirty,
    review,
    neverPublished,
    pendingSummary,
    pendingShort,
    pendingKnown,
    lastSavedAt,
    openNotes,
    scheduled = null,
}: {
    saving: boolean;
    styleSaving: boolean;
    saveError: boolean;
    onlyHeldBack: boolean;
    heldBack: HeldBackSection[];
    dirty: boolean;
    styleDirty: boolean;
    review: ReviewState;
    neverPublished: boolean;
    pendingSummary: string | null;
    /** The same, in the pill's words: "2 blocks, footer". */
    pendingShort: string | null;
    /** Whether the server's count of what's changed arrived (G2). */
    pendingKnown: boolean;
    lastSavedAt: Date | null;
    openNotes: number;
    /**
     * A scheduled go-live, in the business's zone: "Going live Fri 6:00pm ·
     * Diwali menu" (DEC-071, T11). First on the line: it is what happens
     * next to the live site, whatever the draft says.
     */
    scheduled?: string | null;
}): { status: EditorStatus; detail: string; line: string } {
    const status = editorStatus({
        // The style is saved on its own clock; unsaved or saving style is
        // unsaved work too, and the pill has to say so (#282).
        saving: saving || styleSaving,
        saveError,
        heldBackSummary: onlyHeldBack ? heldBackSummary(heldBack) : null,
        dirty: dirty || styleDirty,
        review: {
            pending: review.pending,
            outcome: review.latestApproval?.outcome ?? null,
            approvalIsStale: review.approvalIsStale,
            openNotes,
        },
        neverPublished,
        pending: pendingShort,
        pendingKnown,
    });
    /*
     * Whether the pill already names what would go live. When a review or
     * an approval outranks it, the line says it instead, so it is never only
     * in a hover title (00-universal §15).
     */
    const pillSaysPending =
        pendingShort !== null &&
        status.label === `Not published · ${pendingShort}`;
    /*
     * What the pill leaves out, for anyone who hovers it: when it last saved,
     * what publishing would change, and the reviewer's verdict in full.
     */
    const detail = [
        scheduled,
        lastSavedAt && !dirty
            ? `Saved at ${lastSavedAt.toLocaleTimeString(DISPLAY_LOCALE, { hour: "2-digit", minute: "2-digit" })}`
            : null,
        pendingSummary
            ? `${pendingSummary} changed since the last publish`
            : null,
        review.latestApproval
            ? `${APPROVAL_BADGE[review.latestApproval.outcome].text(
                  review.latestApproval.by,
                  review.approvalIsStale,
              )} · ${exactDate(review.latestApproval.at)}`
            : null,
        openNotes > 0
            ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}`
            : null,
    ]
        .filter(Boolean)
        .join("\n");

    /** The visible line beside the pill: the same facts, in one row. */
    const line = [
        scheduled,
        pendingSummary && !pillSaysPending ? `${pendingSummary} changed` : null,
        review.latestApproval
            ? APPROVAL_BADGE[review.latestApproval.outcome].text(
                  review.latestApproval.by,
                  review.approvalIsStale,
              )
            : null,
        openNotes > 0
            ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return { status, detail, line };
}

/**
 * What the Publish button says it will do, on hover and to assistive tech
 * (G2): what it puts live, or why it is waiting. The button stays pressable
 * when nothing has changed — publishing again is how a new version is made,
 * and how a bypass is recorded — so the title says that instead.
 */
export function publishTitle({
    publishing,
    dirty,
    saveError = false,
    onlyHeldBack,
    heldBack,
    neverPublished,
    pendingShort,
    pendingKnown,
    needsApproval = false,
    canOverride = false,
}: {
    publishing: boolean;
    dirty: boolean;
    /** A save failed: publish waits, and not "in a moment" (review G-4). */
    saveError?: boolean;
    onlyHeldBack: boolean;
    heldBack: HeldBackSection[];
    neverPublished: boolean;
    pendingShort: string | null;
    pendingKnown: boolean;
    /** "Publishing needs approval" is on (DEC-071, R10). */
    needsApproval?: boolean;
    /** An owner, who may still publish past it, on the record (KTD-11). */
    canOverride?: boolean;
}): string {
    if (publishing) return "Publishing your site";
    if (onlyHeldBack) {
        return `Finish or remove ${unfinishedPhrase(heldBack)} before publishing`;
    }
    if (dirty && saveError) {
        return "Not saved — publish waits until your changes save";
    }
    if (dirty) return "Saving your changes — publish is available in a moment";
    if (needsApproval) {
        return canOverride
            ? `${NEEDS_APPROVAL_HINT} As an owner you can still publish without approval; it's recorded.`
            : `${NEEDS_APPROVAL_HINT} Make a test release and ask for a review.`;
    }
    if (neverPublished) return "Put this site live";
    if (!pendingKnown) return "Put this site live as it is now";
    if (pendingShort) return `Put live: ${pendingShort}`;
    return "Nothing has changed since the last publish";
}
