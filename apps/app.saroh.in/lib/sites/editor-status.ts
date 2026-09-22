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
    };
    neverPublished: boolean;
    /** Whether publishing would change anything, as the server counted it. */
    hasPendingChanges: boolean;
}

export function editorStatus(input: EditorStatusInput): EditorStatus {
    if (input.saving) return { label: "Saving…", tone: "quiet" };
    if (input.saveError) return { label: "Not saved", tone: "danger" };
    if (input.heldBackSummary) {
        return { label: input.heldBackSummary, tone: "danger" };
    }
    if (input.dirty) return { label: "Unsaved changes", tone: "attention" };

    if (input.review.pending) return { label: "In review", tone: "attention" };
    if (input.review.outcome === "CHANGES_REQUESTED") {
        return { label: "Changes asked for", tone: "attention" };
    }

    if (input.neverPublished) {
        return { label: "Not published yet", tone: "attention" };
    }
    if (input.hasPendingChanges) {
        // An approval that still covers the draft is worth saying: it is the
        // difference between "ready" and "waiting on someone".
        return input.review.outcome === "APPROVED" &&
            !input.review.approvalIsStale
            ? { label: "Approved, not published", tone: "attention" }
            : { label: "Saved, not published", tone: "attention" };
    }
    return { label: "Published", tone: "done" };
}
