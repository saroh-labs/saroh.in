/**
 * The editor bar's one status pill (#335): where this page stands, in the
 * fewest words that are true.
 *
 * One pill rather than the three things the bar used to carry — the autosave
 * state, what publishing would change, and the reviewer's verdict — because
 * they answer one question between them, "is my work safe, and is it live",
 * and the answer that matters most wins. The rest goes in the pill's title.
 *
 * Order is priority: work that is not safe outranks everything, then what a
 * reviewer is waiting on, then whether the saved draft is live.
 *
 * Since G2 the pill is still true after a reload: "Published", "Not published
 * · 2 blocks, footer" or "Not published yet", all worked out from the
 * server's count of what publishing would change. Nothing new is stored. When
 * that count is missing the pill says so, and never claims "Published".
 */

import type { ApprovalOutcome } from "./service";

export type EditorStatusTone = "danger" | "attention" | "quiet" | "done";

export interface EditorStatus {
    label: string;
    tone: EditorStatusTone;
}

export interface EditorStatusInput {
    saving: boolean;
    saveError: boolean;
    /** Only unfinished blocks are waiting; everything else is saved. */
    heldBackSummary: string | null;
    dirty: boolean;
    review: {
        /** Asked for and not answered (#278). */
        pending: boolean;
        outcome: ApprovalOutcome | null;
        /** The approval was of an earlier draft (#278). */
        approvalIsStale: boolean;
        /** Reviewer notes still open, site-wide. */
        openNotes: number;
    };
    neverPublished: boolean;
    /**
     * What publishing would change, in the pill's short words ("2 blocks,
     * footer"), as the server counted it. Null when nothing is waiting or
     * the count is missing; `pendingKnown` tells the two apart.
     */
    pending: string | null;
    /**
     * Whether the server's count is here at all. A published site whose
     * count failed to arrive must not read "Published" (G2).
     */
    pendingKnown: boolean;
}

/** The pill when the count of what's changed is missing (G2). */
export const PENDING_UNKNOWN = "Couldn't check what's changed";

export function editorStatus(input: EditorStatusInput): EditorStatus {
    if (input.saving) return { label: "Saving…", tone: "quiet" };
    if (input.saveError) return { label: "Not saved", tone: "danger" };
    if (input.heldBackSummary) {
        return { label: input.heldBackSummary, tone: "danger" };
    }
    if (input.dirty) return { label: "Unsaved changes", tone: "attention" };

    if (input.review.pending) return { label: "In review", tone: "attention" };
    if (input.review.outcome === "CHANGES_REQUESTED") {
        // The design's words: how many notes are left to settle, or that
        // changes were asked for without a note to point at.
        const n = input.review.openNotes;
        return {
            label: n > 0 ? `${n} to settle` : "Changes requested",
            tone: "danger",
        };
    }

    if (input.neverPublished) {
        return { label: "Not published yet", tone: "attention" };
    }
    if (!input.pendingKnown) {
        return { label: PENDING_UNKNOWN, tone: "attention" };
    }
    if (input.pending) {
        // An approval that still covers the draft is worth saying: it is the
        // difference between "ready" and "waiting on someone".
        return input.review.outcome === "APPROVED" &&
            !input.review.approvalIsStale
            ? { label: "Approved", tone: "done" }
            : { label: `Not published · ${input.pending}`, tone: "attention" };
    }
    return { label: "Published", tone: "done" };
}
