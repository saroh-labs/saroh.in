"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useState, useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { replyToReview, setReviewHidden } from "@/lib/product-reviews/actions";
import { useReviewSave } from "@/lib/product-reviews/use-product-reviews";

/** The longest reply the API takes. */
export const REPLY_MAX = 1000;

/**
 * What a merchant does to a review, wherever it is listed — the product's
 * Reviews and Customer Detail's (C6): reply once (shown under the review on
 * the shop), and hide or show. Hiding takes an Undo rather than a confirm —
 * it is reversible, and the review stays listed, marked. Both lists call the
 * same endpoints, so what is done in one shows in the other: a save reads
 * the reviews, the product's page and the customer's tab again where shown
 * (`reviewsSaved`, DEC-259).
 */
export function useReviewActions() {
    const { orgId, saved } = useReviewSave();
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [pending, startTransition] = useTransition();

    function startReply(id: string) {
        setReplyingTo(id);
        setDraft("");
    }

    function cancelReply() {
        setReplyingTo(null);
        setDraft("");
    }

    function postReply(id: string) {
        const text = draft.trim();
        if (!text) return;
        startTransition(async () => {
            const res = await runAction(() => replyToReview(id, text, orgId));
            if (!res) return;
            if (!res.ok) {
                showError("Your reply wasn't posted. Try again.");
                return;
            }
            showSuccess("Reply posted.");
            setReplyingTo(null);
            await saved();
        });
    }

    function toggleHidden(id: string, status: "PUBLISHED" | "HIDDEN") {
        const hide = status !== "HIDDEN";
        startTransition(async () => {
            const res = await runAction(() => setReviewHidden(id, hide, orgId));
            if (!res) return;
            if (!res.ok) {
                showError(
                    hide
                        ? "The review wasn't hidden. Try again."
                        : "The review wasn't shown again. Try again.",
                );
                return;
            }
            await saved();
            if (hide) {
                showUndo(
                    "Review hidden from the shop.",
                    async () => {
                        const back = await runAction(
                            () => setReviewHidden(id, false, orgId),
                            { quiet: true },
                        );
                        if (!back) return { ok: false, error: UNREACHED };
                        if (back.ok) await saved();
                        return back;
                    },
                    { description: "It stays here, marked." },
                );
            } else {
                showSuccess("Review shown on the shop again.");
            }
        });
    }

    return {
        replyingTo,
        draft,
        setDraft,
        pending,
        startReply,
        cancelReply,
        postReply,
        toggleHidden,
    };
}
