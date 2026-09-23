"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { replyToReview, setReviewHidden } from "@/lib/product-reviews/actions";
import type { OverviewReview } from "@/lib/products/overview-rules";

const REPLY_MAX = 1000;

/**
 * The latest reviews, each with what the merchant can do: reply once (shown
 * under the review on the shop, and editable), and hide or show. Hiding takes
 * an Undo rather than a confirm — it is reversible, and the review stays
 * listed here, marked.
 */
export function ReviewList({
    reviews,
    canReply,
}: {
    reviews: OverviewReview[];
    canReply: boolean;
}) {
    const router = useRouter();
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [pending, startTransition] = useTransition();

    function startReply(review: OverviewReview) {
        setReplyingTo(review.id);
        setDraft(review.reply ?? "");
    }

    function postReply(review: OverviewReview) {
        const text = draft.trim();
        if (!text) return;
        startTransition(async () => {
            const res = await replyToReview(review.id, text);
            if (!res.ok) {
                showError("Your reply wasn't posted. Try again.");
                return;
            }
            showSuccess(review.reply ? "Reply updated." : "Reply posted.");
            setReplyingTo(null);
            router.refresh();
        });
    }

    function toggleHidden(review: OverviewReview) {
        const hide = review.status !== "HIDDEN";
        startTransition(async () => {
            const res = await setReviewHidden(review.id, hide);
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
                        void setReviewHidden(review.id, false).then(() =>
                            router.refresh(),
                        );
                    },
                );
            } else {
                showSuccess("Review shown on the shop again.");
            }
        });
    }

    return (
        <ul className="flex flex-col gap-3">
            {reviews.map((r) => {
                const hidden = r.status === "HIDDEN";
                return (
                    <li key={r.id}>
                        <Card
                            className={cn(
                                "px-4 py-3.5",
                                hidden && "bg-muted/50",
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                                <span
                                    role="img"
                                    aria-label={`${r.rating} out of 5`}
                                    className="tracking-[1px] text-highlight"
                                >
                                    {"★".repeat(r.rating)}
                                    <span className="text-muted-foreground/40">
                                        {"★".repeat(5 - r.rating)}
                                    </span>
                                </span>
                                <span className="font-medium">
                                    {r.displayName}
                                </span>
                                <span className="text-muted-foreground">
                                    {r.variantTitle
                                        ? `bought ${r.variantTitle} · `
                                        : ""}
                                    <ViewerDate iso={r.createdAt} />
                                </span>
                                {hidden ? (
                                    <Badge variant="neutral">
                                        Hidden from the shop
                                    </Badge>
                                ) : !r.reply ? (
                                    <Badge variant="draft">
                                        Waiting for a reply
                                    </Badge>
                                ) : null}
                            </div>
                            {r.body ? (
                                <p className="mt-2 whitespace-pre-line text-[13.5px] leading-[1.55]">
                                    {r.body}
                                </p>
                            ) : (
                                <p className="mt-2 text-[13px] text-muted-foreground">
                                    No comment left — just a rating.
                                </p>
                            )}
                            {r.reply && replyingTo !== r.id ? (
                                <p className="mt-3 rounded-md bg-muted px-3 py-2 text-[13px]">
                                    <span className="font-medium">
                                        Your reply:{" "}
                                    </span>
                                    {r.reply}
                                </p>
                            ) : null}

                            {replyingTo === r.id ? (
                                <form
                                    className="mt-3 flex flex-col gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        postReply(r);
                                    }}
                                >
                                    <label
                                        htmlFor={`reply-${r.id}`}
                                        className="text-[12.5px] font-medium"
                                    >
                                        Reply to {r.displayName}
                                    </label>
                                    <Textarea
                                        id={`reply-${r.id}`}
                                        rows={3}
                                        value={draft}
                                        maxLength={REPLY_MAX}
                                        onChange={(e) =>
                                            setDraft(e.target.value)
                                        }
                                        placeholder="Shown under the review, on the shop"
                                        disabled={pending}
                                    />
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="submit"
                                            size="sm"
                                            disabled={pending || !draft.trim()}
                                        >
                                            {r.reply
                                                ? "Update reply"
                                                : "Post reply"}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => setReplyingTo(null)}
                                            disabled={pending}
                                        >
                                            Cancel
                                        </Button>
                                        <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">
                                            {draft.length} / {REPLY_MAX}
                                        </span>
                                    </div>
                                </form>
                            ) : canReply ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => startReply(r)}
                                        disabled={pending}
                                    >
                                        {r.reply ? "Edit reply" : "Reply"}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => toggleHidden(r)}
                                        disabled={pending}
                                    >
                                        {hidden
                                            ? "Show on the shop"
                                            : "Hide from the shop"}
                                    </Button>
                                </div>
                            ) : null}
                        </Card>
                    </li>
                );
            })}
        </ul>
    );
}
