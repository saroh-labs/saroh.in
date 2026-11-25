"use client";

import { PartialRead } from "@saroh/ui/failed-read";
import { PageContainer } from "@saroh/ui/page-container";
import type { ComponentProps } from "react";

import { SinceNotice } from "@/components/shared/notices/since-notice";
import { ProductsTabs } from "@/components/stores/catalogue/products-tabs";
import { reviewEmailNote } from "@/lib/product-reviews/describe";
import {
    useProductReviews,
    useReviewInvites,
} from "@/lib/product-reviews/use-product-reviews";
import { useProductsList } from "@/lib/products/use-products";
import { isSince } from "@/lib/views/since";

import { ReviewsView } from "./reviews-view";

type Tabs = ComponentProps<typeof ProductsTabs>;

/**
 * Products → Reviews on React Query (DEC-259): the header and tabs at
 * once from the page's gates, the reviews (`/api/product-reviews`) and
 * what Invite reviews offers (`/api/product-reviews/invites`, only for a
 * role that may invite) read in the browser. The tabs' counts come from
 * the list's smallest page (its counts).
 */
export function ReviewsContainer({
    canWrite,
    may,
    hrefs,
    showInventory,
    hasStores,
    since,
    initialReviewId,
}: {
    canWrite: boolean;
    /** May connect an email provider; may see the plans (D11's note). */
    may: { connect: boolean; plans: boolean };
    hrefs: Tabs["hrefs"];
    showInventory: boolean;
    /** A business with no storefront has no list to count. */
    hasStores: boolean;
    /** From Home's "Last 24 hours" (F6), ISO; null: every review. */
    since: string | null;
    initialReviewId?: string;
}) {
    const reviews = useProductReviews();
    const invites = useReviewInvites(canWrite);
    // The smallest page the API takes (10, 25, 50, 100): only its counts are used.
    const counts = useProductsList({ size: 10 }, hasStores).data?.counts;

    const sinceAt = since ? new Date(since) : null;
    const all = reviews.data?.reviews;
    const shown = all?.filter((r) => isSince(r.createdAt, sinceAt));
    // Invitations go only through the business's own email (D11).
    const emailNote = invites.data
        ? reviewEmailNote(invites.data.emailSetup, may)
        : null;

    const tabs = (
        <ProductsTabs
            active="reviews"
            counts={{
                all: counts?.all,
                collections: counts?.collections,
                inventory: counts?.inventory,
                reviews: all ? all.length : reviews.isError ? null : undefined,
            }}
            hrefs={hrefs}
            showInventory={showInventory}
            showReviews
        />
    );

    return (
        <PageContainer width="full">
            <ReviewsView
                // A failed read is said, never an empty list.
                reviews={reviews.isError ? [] : shown}
                invitable={canWrite ? invites.data?.orders : []}
                canWrite={canWrite}
                emailNote={emailNote}
                tabs={
                    <>
                        {tabs}
                        {reviews.isError ? (
                            <div className="mt-4">
                                <PartialRead
                                    things="reviews"
                                    so="Their count can't be shown. It is not zero."
                                />
                            </div>
                        ) : null}
                        {since ? (
                            <div className="mt-4">
                                <SinceNotice
                                    count={shown ? shown.length : null}
                                    noun={{ one: "review", other: "reviews" }}
                                    verb="left"
                                    clearHref="/commerce/products?tab=reviews"
                                />
                            </div>
                        ) : null}
                    </>
                }
                initialReviewId={initialReviewId}
            />
        </PageContainer>
    );
}
