"use client";

import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { replyToReview, setReviewHidden } from "@/lib/product-reviews/actions";

/** The longest reply the API takes. */
export const REPLY_MAX = 1000;

/**
 * What a merchant does to a review, wherever it is listed — the product's
 * Reviews and Customer Detail's (C6): reply once (shown under the review on
 * the shop), and hide or show. Hiding takes an Undo rather than a confirm —
 * it is reversible, and the review stays listed, marked. Both lists call the
 * same endpoints, so what is done in one shows in the other.
 */
export function useReviewActions() {
    const router = useRouter();
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
            const res = await replyToReview(id, text);
            if (!res.ok) {
                showError("Your reply wasn't posted. Try again.");
                return;
            }
            showSuccess("Reply posted.");
            setReplyingTo(null);
            router.refresh();
        });
    }

    function toggleHidden(id: string, status: "PUBLISHED" | "HIDDEN") {
        const hide = status !== "HIDDEN";
        startTransition(async () => {
            const res = await setReviewHidden(id, hide);
            if (!res.ok) {
                showError(
                    hide
                        ? "The review wasn't hidden. Try again."
                        : "The review wasn't shown again. Try again.",
                );
                return;
            }
            router.refresh();
            if (hide) {
                showUndo(
                    "Review hidden from the shop — it stays here, marked.",
                    () => {
                        void setReviewHidden(id, false).then(() =>
                            router.refresh(),
                        );
                    },
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
