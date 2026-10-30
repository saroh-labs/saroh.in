"use client";

import { Button } from "@saroh/ui/button";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { Notice } from "@saroh/ui/notice";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { formatDate } from "@/lib/format/datetime";
import type { ReviewState } from "@/lib/sites/service";
import { reviewOwner, sentenceStart, youApproved } from "./verdict-controls";

/**
 * Where a Reviewer's review stands, at the top of Feedback (DEC-200, RVD1 and
 * RVD4). One message at a time, the most useful first: the last re-read
 * failed; you approved; the owner settled your notes since you last looked;
 * who asked you to review; or nobody has asked yet.
 */
export function ReviewerStatus({
    review,
    loadFailed,
    onRetry,
    onSeeSettled,
}: {
    review: ReviewState;
    loadFailed: boolean;
    onRetry: () => void;
    /** Whole site, filtered to settled notes. */
    onSeeSettled: () => void;
}) {
    const zone = useBusinessZone();
    const owner = reviewOwner(review);
    const link = "h-auto p-0 font-semibold underline underline-offset-[3px]";

    if (loadFailed) {
        return (
            <Notice
                tone="error"
                // The house's words, as the editor page's own failed read.
                title={couldntLoad("the draft")}
                data-reviewer-status="failed"
            >
                Nothing you wrote is lost.{" "}
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    className={link}
                    onClick={onRetry}
                >
                    Try again
                </Button>
            </Notice>
        );
    }
    if (youApproved(review) && review.yourVerdict) {
        return (
            <Notice
                tone="success"
                title={`You approved this on ${formatDate(review.yourVerdict.at, zone)}.`}
                data-reviewer-status="approved"
            >
                Approving doesn&rsquo;t publish. {sentenceStart(owner)} decides
                when it goes live.
            </Notice>
        );
    }
    if (review.settledForYou) {
        const { count, at } = review.settledForYou;
        return (
            <Notice tone="neutral" icon={false} data-reviewer-status="settled">
                <b>
                    {sentenceStart(owner)} settled {count} of your notes
                </b>{" "}
                · {formatDate(at, zone)}{" "}
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    className={link}
                    onClick={onSeeSettled}
                >
                    See the notes
                </Button>
            </Notice>
        );
    }
    if (review.request) {
        return (
            <Notice tone="neutral" icon={false} data-reviewer-status="asked">
                <b>{review.request.by} asked you to review</b> ·{" "}
                {formatDate(review.request.at, zone)}
            </Notice>
        );
    }
    return (
        <Notice
            tone="neutral"
            icon={false}
            title="Nobody has asked for a review yet."
            data-reviewer-status="nobody"
        >
            You can still read the draft and leave feedback, and {owner} sees it
            in the editor.
        </Notice>
    );
}
