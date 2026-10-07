import { showError, showSuccess } from "@saroh/ui/toast";
import { useRef, useState } from "react";

import {
    getReviewState,
    listComments,
    requestReview,
    withdrawReview,
} from "@/lib/sites/actions";
import type { ReviewState, SiteCommentView } from "@/lib/sites/service";

/**
 * Reviewer notes, the verdict, and asking for a review (#193, #278, #335).
 * Moved out of `site-editor.tsx` unchanged (#260).
 */
export function useEditorReview({
    siteId,
    pageId,
    initialComments,
    initialReview,
}: {
    siteId: string;
    pageId: string;
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
}) {
    const [comments, setComments] =
        useState<SiteCommentView[]>(initialComments);
    const [review, setReview] = useState<ReviewState>(initialReview);
    const [asking, setAsking] = useState(false);
    const openNotes = review.openNotes;

    /*
     * One counter per re-read. It fires from several places — publishing, a
     * note changing, asking for review — and nothing orders the responses, so
     * a slow early read landing after a fast later one would put back the
     * state from before. Each call takes the next number and only the newest
     * may write; the same rule `measuring` keeps for the share image in site
     * settings.
     */
    const reviewRequest = useRef(0);

    /** Re-read notes and the verdict together — they move together. */
    async function refreshReview() {
        const request = ++reviewRequest.current;
        const [next, state] = await Promise.all([
            listComments(siteId),
            getReviewState(siteId),
        ]);
        if (request !== reviewRequest.current) return;
        setComments(next);
        setReview(state);
    }

    /**
     * Share for review (#335): ask for a review, which is what reviewers
     * are notified of and what puts the page In review (#278). It blocks
     * nothing — publishing while it stands is recorded as a bypass.
     */
    async function askForReview() {
        setAsking(true);
        try {
            const res = await requestReview(siteId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(
                "Asked for a review. Reviewers can comment on any block and cannot change the page.",
            );
            // Still disabled until the refreshed state reads In review, so a
            // second click cannot send a second request in between.
            await refreshReview();
        } finally {
            setAsking(false);
        }
    }

    /**
     * Take the request back (UX-068): the site stops reading In review.
     * Notes stay where they are.
     */
    async function withdraw() {
        setAsking(true);
        try {
            const res = await withdrawReview(siteId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess("Review request withdrawn.");
            await refreshReview();
        } finally {
            setAsking(false);
        }
    }

    /*
     * Section keys on this page carrying an unresolved note. The issue asks
     * for it directly: "the section list should show which sections carry
     * unresolved ones." Resolved notes do not mark anything — a settled note
     * is history, and a dot for it would never go out.
     */
    const notedKeys = new Set(
        comments
            .filter(
                (c) =>
                    c.pageId === pageId && c.resolvedAt === null && !c.orphaned,
            )
            .map((c) => c.sectionKey),
    );

    /** Open notes per block on this page — the canvas draws them as pins. */
    const notesByKey = new Map<string, number>();
    for (const c of comments) {
        if (c.pageId !== pageId || c.resolvedAt !== null || c.orphaned)
            continue;
        notesByKey.set(c.sectionKey, (notesByKey.get(c.sectionKey) ?? 0) + 1);
    }

    return {
        comments,
        review,
        openNotes,
        asking,
        refreshReview,
        askForReview,
        withdrawReview: withdraw,
        notedKeys,
        notesByKey,
    };
}

export type EditorReview = ReturnType<typeof useEditorReview>;
