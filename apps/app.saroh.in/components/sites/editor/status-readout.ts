import { heldBackSummary } from "@/components/sites/held-back-copy";
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
};

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
 * the fuller account its title gives on hover. Moved out of `site-editor.tsx`
 * unchanged (#260).
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
    lastSavedAt,
    openNotes,
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
    lastSavedAt: Date | null;
    openNotes: number;
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
        },
        neverPublished,
        hasPendingChanges: pendingSummary !== null,
    });
    /*
     * What the pill leaves out, for anyone who hovers it: when it last saved,
     * what publishing would change, and the reviewer's verdict in full.
     */
    const detail = [
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
        pendingSummary ? `${pendingSummary} changed` : null,
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
