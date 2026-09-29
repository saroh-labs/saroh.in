"use client";

import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import Link from "next/link";

import {
    REPLY_MAX,
    useReviewActions,
} from "@/components/commerce/product-page/use-review-actions";
import { ViewerDate } from "@/components/shared/viewer-date";
import { stars } from "@/lib/product-reviews/describe";
import type { Review } from "@/lib/product-reviews/service";
import { productHref } from "@/lib/products/links";

import { Empty } from "./parts";

/** A text action under a review: pointer, hover, focus and pressed. */
const TEXT_ACTION =
    "cursor-pointer rounded-sm text-[12.5px] transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-50 coarse:min-h-11";

/**
 * Customer Detail's Reviews tab (C6, after "Saroh Customer Detail"): what
 * this person said about what they bought, newest first — from every store
 * customer linked to them — with the product it was about. Reply and hide
 * are the product page's own (`useReviewActions`), so what is done here
 * shows on the product's Reviews too. Without `product-review:write` (a
 * Member) there are no controls; the API refuses them all the same.
 */
export function ReviewsTab({
    reviews,
    firstName,
    canReply,
}: {
    reviews: Review[];
    firstName: string;
    canReply: boolean;
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

    if (reviews.length === 0) {
        return (
            <Empty title={`No reviews from ${firstName} yet`}>
                Customers are asked after their order is delivered.
            </Empty>
        );
    }

    return (
        <ul className="flex flex-col gap-2.5">
            {reviews.map((r) => {
                const hidden = r.status === "HIDDEN";
                const replying = replyingTo === r.id;
                return (
                    <li key={r.id}>
                        <Card className="rounded-xl px-4 py-[13px]">
                            <div className="flex flex-wrap items-center gap-2">
                                <span
                                    role="img"
                                    aria-label={`${r.rating} out of 5`}
                                    className="tracking-[1px] text-highlight"
                                >
                                    {stars(r.rating)}
                                </span>
                                {r.productId ? (
                                    <Link
                                        href={productHref(
                                            r.storeId,
                                            r.productId,
                                            "reviews",
                                        )}
                                        className="cursor-pointer rounded-sm text-[13px] font-semibold text-foreground underline-offset-2 transition-colors duration-fast hover:text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:opacity-70"
                                    >
                                        {r.productName}
                                    </Link>
                                ) : (
                                    <span className="text-[13px] font-semibold">
                                        {r.productName}
                                    </span>
                                )}
                                <span className="text-[12px] text-muted-foreground">
                                    ·{" "}
                                    <ViewerDate
                                        iso={r.createdAt}
                                        variant="dayMonth"
                                    />
                                </span>
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
                            {hidden ? (
                                <span className="mt-1.5 inline-block rounded-full bg-muted px-[7px] py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-foreground/75">
                                    Hidden from the shop
                                </span>
                            ) : null}
                            {r.reply ? (
                                <p className="mt-2 rounded-lg bg-muted/60 px-[11px] py-2 text-[13px] leading-[1.5] text-foreground/75">
                                    <strong className="font-semibold text-foreground">
                                        Your reply:
                                    </strong>{" "}
                                    {r.reply}
                                </p>
                            ) : null}

                            {canReply && replying ? (
                                <form
                                    className="mt-[9px]"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        postReply(r.id);
                                    }}
                                >
                                    <Textarea
                                        aria-label={`Reply to this review of ${r.productName}`}
                                        rows={2}
                                        value={draft}
                                        maxLength={REPLY_MAX}
                                        onChange={(e) =>
                                            setDraft(e.target.value)
                                        }
                                        placeholder="Shown under the review, on the shop"
                                        disabled={pending}
                                        autoFocus
                                        className="min-h-0 rounded-lg px-2.5 py-2 text-[13px] leading-[1.5]"
                                    />
                                    <div className="mt-1.5 flex items-center gap-[7px]">
                                        <Button
                                            type="submit"
                                            disabled={pending || !draft.trim()}
                                            className="h-[30px] rounded-lg px-3 text-[12px] font-semibold"
                                        >
                                            Post reply
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={cancelReply}
                                            disabled={pending}
                                            className="h-[30px] rounded-lg px-[11px] text-[12px] font-semibold"
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
                            {canReply ? (
                                <div className="mt-[9px] flex gap-3.5">
                                    {r.reply || replying ? null : (
                                        <button
                                            type="button"
                                            onClick={() => startReply(r.id)}
                                            disabled={pending}
                                            className={cn(
                                                TEXT_ACTION,
                                                "font-semibold text-brand",
                                            )}
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
                                        className={cn(
                                            TEXT_ACTION,
                                            "text-muted-foreground",
                                        )}
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
