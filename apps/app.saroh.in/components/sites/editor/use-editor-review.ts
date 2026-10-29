import { showError, showSuccess } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import { runAction } from "@/lib/api/run-action";
import {
    createApproval,
    getReviewState,
    listComments,
    recordPageView,
    requestReview,
    withdrawReview,
} from "@/lib/sites/actions";
import type {
    ReviewerVerdict,
    ReviewState,
    SiteCommentView,
} from "@/lib/sites/service";

/**
 * Reviewer notes, the verdict, and asking for a review (#193, #278, #335).
 * Moved out of `site-editor.tsx` unchanged (#260).
 */
export function useEditorReview({
    siteId,
    pageId,
    initialComments,
    initialReview,
    readOnly = false,
}: {
    siteId: string;
    pageId: string;
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
    /** A Reviewer (DEC-200): opening the page counts as reading it. */
    readOnly?: boolean;
}) {
    const [comments, setComments] =
        useState<SiteCommentView[]>(initialComments);
    const [review, setReview] = useState<ReviewState>(initialReview);
    const [asking, setAsking] = useState(false);
    const [recording, setRecording] = useState(false);
    /**
     * The last re-read failed (RVD4 "Couldn't load"). What is on screen
     * stays, unsent words included; Try again re-reads.
     */
    const [loadFailed, setLoadFailed] = useState(false);
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
        try {
            const [next, state] = await Promise.all([
                listComments(siteId),
                getReviewState(siteId),
            ]);
            if (request !== reviewRequest.current) return;
            setComments(next);
            setReview(state);
            setLoadFailed(false);
        } catch {
            if (request === reviewRequest.current) setLoadFailed(true);
        }
    }

    /*
     * A Reviewer opening a page reads it (DEC-200, U9): recorded once per
     * page open (the editor is keyed on the page), then the count re-read.
     */
    useEffect(() => {
        if (!readOnly) return;
        // Not counted is not worth a word: the line keeps its last number.
        recordPageView(siteId, pageId)
            .then((res) => (res.ok ? refreshReview() : undefined))
            .catch(() => undefined);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page open
    }, [readOnly, siteId, pageId]);

    /**
     * A Reviewer's verdict from the top bar (#277, DEC-200). Neither
     * changes what the public sees. Resolves true once recorded; on a
     * failure the toast says why and the caller keeps what was typed.
     */
    async function record(
        outcome: ReviewerVerdict,
        reason?: string,
    ): Promise<boolean> {
        const res = await runAction(
            () => createApproval(siteId, outcome, undefined, reason),
            { setBusy: setRecording },
        );
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(
            outcome === "APPROVED"
                ? "Marked as approved."
                : "Recorded that you asked for changes.",
        );
        await refreshReview();
        return true;
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
        recording,
        record,
        loadFailed,
        refreshReview,
        askForReview,
        withdrawReview: withdraw,
        notedKeys,
        notesByKey,
    };
}

export type EditorReview = ReturnType<typeof useEditorReview>;
