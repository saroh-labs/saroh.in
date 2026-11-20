"use client";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { formatDate } from "@/lib/format/datetime";
import type { ReviewState } from "@/lib/sites/service";

/**
 * A reader's request strip under the bar (`fix/WXMReviewer`): who asked,
 * when, and how much of the site they have read. Drawn only while a
 * review was asked for; "Next change" and the number of changes wait for
 * a read of the waiting changes a reader may make.
 */
export function ReviewerStrip({ review }: { review: ReviewState }) {
    const zone = useBusinessZone();
    const request = review.request;
    if (!request || !review.pending) return null;
    const read = review.pagesRead;
    return (
        <div
            role="region"
            aria-label="Review request"
            className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 text-sm"
        >
            <span className="min-w-0 truncate">
                <b className="font-semibold">
                    {`${request.by} asked you to review`}
                </b>
                {` · ${formatDate(request.at, zone)}`}
            </span>
            <span className="flex-1" />
            {read && read.total > 0 ? (
                <span className="flex shrink-0 items-center gap-2 text-[0.8125rem] text-muted-foreground">
                    {`Read ${read.read} of ${read.total} pages`}
                    <span
                        aria-hidden
                        className="relative h-1.5 w-20 overflow-hidden rounded-full bg-secondary"
                    >
                        <i
                            className="absolute inset-y-0 left-0 bg-foreground"
                            style={{
                                width: `${Math.round((100 * read.read) / read.total)}%`,
                            }}
                        />
                    </span>
                </span>
            ) : null}
        </div>
    );
}
