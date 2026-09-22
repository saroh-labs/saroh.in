"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { MessageSquareQuote, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { ViewerDate } from "@/components/shared/viewer-date";
import { InviteReviewsSheet } from "@/components/stores/invite-reviews-sheet";
import { replyToReview, setReviewHidden } from "@/lib/product-reviews/actions";
import { stars } from "@/lib/product-reviews/describe";
import type { InvitableOrder, Review } from "@/lib/product-reviews/service";

const FILTERS: DataFilter<Review>[] = [
    { id: "all", label: "All" },
    {
        id: "needs-reply",
        label: "Needs a reply",
        predicate: (r) =>
            r.status === "PUBLISHED" && !r.reply && (r.rating <= 3 || !!r.body),
    },
    { id: "hidden", label: "Hidden", predicate: (r) => r.status === "HIDDEN" },
];

/**
 * Products → Reviews: what customers who bought have said.
 *
 * Every review came from an invitation for a paid, shipped order, so the list
 * is verified purchases only. A review can be replied to once (the reply can
 * be edited) and hidden — never deleted; hidden reviews stay here, marked.
 * Text is shown as text: nothing a customer typed is ever read as markup.
 */
export function ReviewsView({
    reviews,
    invitable,
    canWrite,
    tabs,
    initialReviewId,
}: {
    reviews: Review[];
    invitable: InvitableOrder[];
    canWrite: boolean;
    tabs: ReactNode;
    /** `?review=<id>` — opened on arrival, from a notification. */
    initialReviewId?: string;
}) {
    const [open, setOpen] = useState<Review | null>(
        () => reviews.find((r) => r.id === initialReviewId) ?? null,
    );
    const [inviting, setInviting] = useState(false);

    const columns: DataColumn<Review>[] = [
        {
            id: "review",
            header: "Review",
            priority: "primary",
            sortValue: (r) => `${r.displayName} ${r.body ?? ""}`,
            cell: (r) => (
                <span className="min-w-0">
                    <span className="flex items-center gap-2">
                        <span
                            aria-label={`${r.rating} out of 5 stars`}
                            className="text-[13px] tracking-[1px] text-highlight"
                        >
                            {stars(r.rating)}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                            {r.displayName}
                        </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px]">
                        {r.body ?? (
                            <span className="text-muted-foreground">
                                No comment
                            </span>
                        )}
                    </span>
                </span>
            ),
        },
        {
            id: "product",
            header: "Product",
            priority: "secondary",
            width: "200px",
            sortValue: (r) => r.productName,
            cell: (r) => <span className="truncate">{r.productName}</span>,
        },
        {
            id: "when",
            header: "Posted",
            priority: "secondary",
            width: "120px",
            sortValue: (r) => r.createdAt,
            cell: (r) => <ViewerDate iso={r.createdAt} />,
        },
        {
            id: "state",
            header: "State",
            priority: "secondary",
            width: "140px",
            sortValue: (r) => `${r.status}${r.reply ? 1 : 0}`,
            cell: (r) => (
                <span className="flex flex-wrap gap-1">
                    {r.status === "HIDDEN" ? (
                        <Badge variant="neutral">Hidden</Badge>
                    ) : null}
                    {r.reply ? <Badge variant="success">Replied</Badge> : null}
                    {r.status === "PUBLISHED" && !r.reply ? (
                        <Badge variant="outline">Published</Badge>
                    ) : null}
                </span>
            ),
        },
    ];

    const inviteAction =
        canWrite && invitable.length > 0 ? (
            <Button onClick={() => setInviting(true)}>
                <Send className="mr-1.5 size-4" />
                Invite reviews
            </Button>
        ) : undefined;

    return (
        <div className="space-y-5">
            <PageHeader
                breadcrumb={["Sell", "Products"]}
                title="Products"
                className="mb-0"
                actions={inviteAction}
            />
            {tabs}
            <DataView
                viewId="reviews"
                rows={reviews}
                columns={columns}
                rowKey={(r) => r.id}
                onRowClick={(r) => setOpen(r)}
                modes={["table", "list"]}
                hideModeToggle
                filters={FILTERS}
                noun={{ one: "review", other: "reviews" }}
                searchPlaceholder="Search reviews"
                searchableColumnIds={["review", "product"]}
                emptyState={{
                    icon: <MessageSquareQuote />,
                    title: "No reviews yet",
                    note: "Reviews appear here once a customer leaves one. You can invite reviews from a past order.",
                    action:
                        canWrite && invitable.length > 0 ? (
                            <Button onClick={() => setInviting(true)}>
                                Invite a review
                            </Button>
                        ) : canWrite ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                No shipped orders to ask about yet.
                            </p>
                        ) : undefined,
                }}
            />
            <p className="max-w-[68ch] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                Every review comes from a customer the business invited, for an
                order that was paid and shipped. Hiding a review keeps it here;
                nothing a customer wrote is deleted.
            </p>

            <ReviewSheet
                review={open}
                canWrite={canWrite}
                onClose={() => setOpen(null)}
            />
            {canWrite ? (
                <InviteReviewsSheet
                    open={inviting}
                    onOpenChange={setInviting}
                    orders={invitable}
                />
            ) : null}
        </div>
    );
}

/**
 * One review, and what the merchant can do with it: reply (once; editable)
 * and hide or show. Hiding takes an Undo, not a confirm — it is reversible.
 */
function ReviewSheet({
    review,
    canWrite,
    onClose,
}: {
    review: Review | null;
    canWrite: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const [reply, setReply] = useState("");
    const [pending, startTransition] = useTransition();
    const [loadedFor, setLoadedFor] = useState<string | null>(null);

    // A fresh reply box per review opened (the saved reply to edit, if any).
    if (review && review.id !== loadedFor) {
        setLoadedFor(review.id);
        setReply(review.reply ?? "");
    }

    const hidden = review?.status === "HIDDEN";

    const saveReply = () => {
        if (!review || !reply.trim()) return;
        startTransition(async () => {
            const res = await replyToReview(review.id, reply.trim());
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(review.reply ? "Reply updated" : "Reply posted");
            onClose();
            router.refresh();
        });
    };

    const toggleHidden = () => {
        if (!review) return;
        const next = !hidden;
        startTransition(async () => {
            const res = await setReviewHidden(review.id, next);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            onClose();
            router.refresh();
            if (next) {
                showUndo("Review hidden — it stays here, marked.", () => {
                    void setReviewHidden(review.id, false).then(() =>
                        router.refresh(),
                    );
                });
            } else {
                showSuccess("Review shown again");
            }
        });
    };

    return (
        <Sheet open={review !== null} onOpenChange={(o) => !o && onClose()}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-md">
                {review ? (
                    <>
                        <SheetHeader>
                            <SheetTitle>{review.productName}</SheetTitle>
                            <SheetDescription>
                                {review.displayName} · invited to{" "}
                                {review.invitedTo} ·{" "}
                                <ViewerDate iso={review.createdAt} />
                            </SheetDescription>
                        </SheetHeader>
                        <div className="mt-5 space-y-5">
                            <div>
                                <p
                                    aria-label={`${review.rating} out of 5 stars`}
                                    className="text-[18px] tracking-[2px] text-highlight"
                                >
                                    {stars(review.rating)}
                                </p>
                                <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.55]">
                                    {review.body ?? (
                                        <span className="text-muted-foreground">
                                            No comment left.
                                        </span>
                                    )}
                                </p>
                                {hidden ? (
                                    <Badge variant="neutral" className="mt-3">
                                        Hidden
                                    </Badge>
                                ) : null}
                            </div>

                            {canWrite ? (
                                <form
                                    className="grid gap-2"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        saveReply();
                                    }}
                                >
                                    <label
                                        htmlFor="review-reply"
                                        className="text-[12.5px] font-medium"
                                    >
                                        {review.reply
                                            ? "Your reply (edit it here)"
                                            : "Reply in public"}
                                    </label>
                                    <Textarea
                                        id="review-reply"
                                        value={reply}
                                        rows={4}
                                        maxLength={1000}
                                        onChange={(e) =>
                                            setReply(e.target.value)
                                        }
                                        aria-describedby="review-reply-note"
                                    />
                                    <p
                                        id="review-reply-note"
                                        className="text-[11.5px] text-muted-foreground"
                                    >
                                        {hidden
                                            ? "This review is hidden, so the reply isn't visible to anyone yet."
                                            : "One reply per review, shown with it. You can change it later."}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="submit"
                                            disabled={pending || !reply.trim()}
                                        >
                                            {review.reply
                                                ? "Save reply"
                                                : "Post reply"}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            disabled={pending}
                                            onClick={toggleHidden}
                                        >
                                            {hidden ? "Show again" : "Hide"}
                                        </Button>
                                    </div>
                                </form>
                            ) : review.reply ? (
                                <div className="rounded-lg bg-muted p-3">
                                    <p className="text-[11.5px] font-medium text-muted-foreground">
                                        The business replied
                                    </p>
                                    <p className="mt-1 whitespace-pre-line text-[13.5px]">
                                        {review.reply}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </>
                ) : null}
            </SheetContent>
        </Sheet>
    );
}
