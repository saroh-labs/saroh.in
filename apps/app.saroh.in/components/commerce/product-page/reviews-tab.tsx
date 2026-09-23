import { Card } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/data-state";

import type { ProductOverview } from "@/lib/products/overview";
import { ratingBars } from "@/lib/products/overview-rules";

import { PanelFailed, PanelForbidden } from "./panel-state";
import { ReviewList } from "./review-list";

/**
 * What people who bought it said. Only customers with an order can review,
 * so every review names what they bought. The summary counts what the shop
 * shows; a hidden review stays listed here, marked, and can be shown again.
 */
export function ProductReviewsTab({
    overview,
    retryHref,
    canReply,
}: {
    overview: ProductOverview;
    retryHref: string;
    canReply: boolean;
}) {
    const { product, reviews } = overview;
    if (reviews.status === "failed") {
        return <PanelFailed what="reviews" retryHref={retryHref} />;
    }
    if (reviews.status === "forbidden")
        return <PanelForbidden what="reviews" />;
    const { summary, latest, toAnswer, hiddenCount } = reviews.data;

    if (latest.length === 0) {
        return (
            <EmptyState
                title="No reviews yet"
                description={
                    product.status === "PUBLISHED"
                        ? "Customers are asked after their order is delivered. Only people who bought it can review it."
                        : "It isn't on the shop, so nobody can order it yet — reviews start after it is published."
                }
            />
        );
    }

    return (
        <div className="flex flex-wrap items-start gap-5">
            <Card className="flex-[1_1_240px] px-5 py-4">
                <p className="font-display text-[30px] font-semibold tabular-nums leading-none">
                    {summary.average?.toFixed(1) ?? "—"}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    From {summary.count}{" "}
                    {summary.count === 1 ? "customer" : "customers"} who bought
                    it
                    {hiddenCount > 0
                        ? ` · ${hiddenCount} hidden from the shop`
                        : ""}
                </p>
                <ul
                    className="mt-4 flex flex-col gap-1.5"
                    aria-label="How the ratings spread"
                >
                    {ratingBars(summary.distribution).map((bar) => (
                        <li
                            key={bar.stars}
                            className="grid grid-cols-[2.5rem_minmax(0,1fr)_2rem] items-center gap-2 text-[12.5px]"
                        >
                            <span>{bar.stars} ★</span>
                            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                                <span
                                    className="block h-full rounded-full bg-foreground"
                                    style={{ width: `${bar.percent}%` }}
                                />
                            </span>
                            <span className="text-right tabular-nums text-muted-foreground">
                                {bar.count}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="mt-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
                    Customers are asked after their order is delivered. Only
                    people with an order can review, so each shows what they
                    bought.
                </p>
            </Card>
            <div className="min-w-0 flex-[2_1_420px]">
                <p className="mb-3 text-[13px] font-medium">
                    {toAnswer > 0
                        ? `${toAnswer} waiting for a reply · the latest ${latest.length}`
                        : `The latest ${latest.length}`}
                </p>
                <ReviewList reviews={latest} canReply={canReply} />
            </div>
        </div>
    );
}
