"use client";

import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";

import { ViewerDate } from "@/components/shared/viewer-date";
import { customerHref } from "@/lib/customers/links";
import type { OverviewReview } from "@/lib/products/overview-rules";

import { StatusBadge } from "@/components/shared/status-badge";
import { TextLink } from "@saroh/ui/text-link";

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
                                    className="tracking-[1px] text-foreground"
                                >
                                    {"★".repeat(r.rating)}
                                    {"☆".repeat(5 - r.rating)}
                                </span>
                                {r.customerId ? (
                                    <TextLink
                                        href={customerHref(
                                            storeId,
                                            r.customerId,
                                        )}
                                        className="text-[13px]"
                                    >
                                        {r.displayName}
                                    </TextLink>
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
                                    <StatusBadge tone="neutral">
                                        Hidden from the shop
                                    </StatusBadge>
                                ) : null}
                            </div>
                            {r.body ? (
                                <p className="mt-1.5 whitespace-pre-line text-pretty text-[13.5px] leading-[1.55] text-foreground/75">
                                    {r.body}
                                </p>
                            ) : (
                                <p className="mt-1.5 text-[13px] text-muted-foreground">
                                    No comment left, only a rating.
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
                                    onKeyDown={submitOnModEnter}
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
                                        className="min-h-0 px-2.5 py-2 leading-[1.5]"
                                    />
                                    <div className="mt-1.5 flex items-center gap-[7px]">
                                        <Button
                                            size="sm"
                                            type="submit"
                                            disabled={!draft.trim()}
                                            busy={pending}
                                            busyLabel="Posting…"
                                        >
                                            Post reply
                                        </Button>
                                        <Button
                                            size="sm"
                                            type="button"
                                            variant="outline"
                                            onClick={cancelReply}
                                            disabled={pending}
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
                                // Reply leads; hiding a buyer's voice is the
                                // rarer act, a quiet word with Undo after it.
                                <div className="mt-[9px] flex flex-wrap items-center gap-3.5">
                                    {r.reply ? null : (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            type="button"
                                            onClick={() => startReply(r.id)}
                                            disabled={pending}
                                        >
                                            Reply
                                        </Button>
                                    )}
                                    <Button
                                        variant="link"
                                        size="inline"
                                        type="button"
                                        onClick={() =>
                                            toggleHidden(r.id, r.status)
                                        }
                                        disabled={pending}
                                        className="text-[12.5px] font-normal text-muted-foreground no-underline hover:text-foreground hover:underline coarse:min-h-11"
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
