"use client";

import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { customerHref } from "@/lib/customers/links";
import type { OverviewReview } from "@/lib/products/overview-rules";

import { REPLY_MAX, useReviewActions } from "./use-review-actions";

/**
 * The latest reviews, each with what the merchant can do: reply once (shown
 * under the review on the shop), and hide or show (`useReviewActions`).
 */
export function ReviewList({
    reviews,
    canReply,
    storeId,
}: {
    reviews: OverviewReview[];
    canReply: boolean;
    storeId: string;
}) {
    const {
        replyingTo,
        draft,
        setDraft,
        pending,
        startReply,
        cancelReply,
        postReply,
        toggleHidden,
    } = useReviewActions();

    return (
        <ul className="flex flex-col gap-2.5">
            {reviews.map((r) => {
                const hidden = r.status === "HIDDEN";
                return (
                    <li key={r.id}>
                        <Card
                            className={cn(
                                "rounded-[12px] px-4 py-[13px]",
                                hidden && "opacity-[.72]",
                            )}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    role="img"
                                    aria-label={`${r.rating} out of 5`}
                                    className="tracking-[1px] text-highlight"
                                >
                                    {"★".repeat(r.rating)}
                                    {"☆".repeat(5 - r.rating)}
                                </span>
                                {r.customerId ? (
                                    <Link
                                        href={customerHref(
                                            storeId,
                                            r.customerId,
                                        )}
                                        className="text-[13px] font-semibold text-brand hover:text-foreground"
                                    >
                                        {r.displayName}
                                    </Link>
                                ) : (
                                    <span className="text-[13px] font-semibold">
                                        {r.displayName}
                                    </span>
                                )}
                                <span className="text-[12px] text-muted-foreground">
                                    {r.variantTitle
                                        ? `bought ${r.variantTitle} · `
                                        : ""}
                                    <ViewerDate
                                        iso={r.createdAt}
                                        variant="dayMonth"
                                    />
                                </span>
                                {hidden ? (
                                    <span className="rounded-full bg-muted px-[7px] py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-foreground/75">
                                        Hidden from the shop
                                    </span>
                                ) : null}
                            </div>
                            {r.body ? (
                                <p className="mt-1.5 whitespace-pre-line text-pretty text-[13.5px] leading-[1.55] text-foreground/75">
                                    {r.body}
                                </p>
                            ) : (
                                <p className="mt-1.5 text-[13px] text-muted-foreground">
                                    No comment left — just a rating.
                                </p>
                            )}
                            {r.reply && replyingTo !== r.id ? (
                                <p className="mt-2 rounded-[8px] bg-muted/60 px-[11px] py-2 text-[13px] leading-[1.5] text-foreground/75">
                                    <strong className="font-semibold text-foreground">
                                        Your reply:
                                    </strong>{" "}
                                    {r.reply}
                                </p>
                            ) : null}

                            {replyingTo === r.id ? (
                                <form
                                    className="mt-[9px]"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        postReply(r.id);
                                    }}
                                >
                                    <Textarea
                                        aria-label={`Reply to ${r.displayName}`}
                                        rows={2}
                                        value={draft}
                                        maxLength={REPLY_MAX}
                                        onChange={(e) =>
                                            setDraft(e.target.value)
                                        }
                                        placeholder="Shown under the review, on the shop"
                                        disabled={pending}
                                        className="min-h-0 rounded-[8px] px-2.5 py-2 text-[13px] leading-[1.5]"
                                    />
                                    <div className="mt-1.5 flex items-center gap-[7px]">
                                        <Button
                                            type="submit"
                                            disabled={pending || !draft.trim()}
                                            className="h-[30px] rounded-[8px] px-3 text-[12px] font-semibold"
                                        >
                                            Post reply
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={cancelReply}
                                            disabled={pending}
                                            className="h-[30px] rounded-[8px] px-[11px] text-[12px] font-semibold"
                                        >
                                            Cancel
                                        </Button>
                                        {draft.length > REPLY_MAX - 100 ? (
                                            <span className="ml-auto text-[11.5px] tabular-nums text-muted-foreground">
                                                {draft.length} / {REPLY_MAX}
                                            </span>
                                        ) : null}
                                    </div>
                                </form>
                            ) : null}
                            {canReply && replyingTo !== r.id ? (
                                <div className="mt-[9px] flex gap-3.5">
                                    {r.reply ? null : (
                                        <button
                                            type="button"
                                            onClick={() => startReply(r.id)}
                                            disabled={pending}
                                            className="text-[12.5px] font-semibold text-brand hover:text-foreground disabled:opacity-50 coarse:min-h-11"
                                        >
                                            Reply
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            toggleHidden(r.id, r.status)
                                        }
                                        disabled={pending}
                                        className="text-[12.5px] text-muted-foreground hover:text-foreground disabled:opacity-50 coarse:min-h-11"
                                    >
                                        {hidden
                                            ? "Show on the shop"
                                            : "Hide from the shop"}
                                    </button>
                                </div>
                            ) : null}
                        </Card>
                    </li>
                );
            })}
        </ul>
    );
}
