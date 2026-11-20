"use client";

import { TextLink } from "@saroh/ui/text-link";

import { BlockFeedback } from "@/components/sites/blocks/block-feedback";
import { ReviewerStatus } from "@/components/sites/review/reviewer-status";
import type {
    ReviewState,
    Section,
    SiteCommentView,
} from "@/lib/sites/service";

import { SECTION_LABELS } from "../editor-constants";
import { useEditorReadOnly, useEditorReviewCan } from "../read-only";

export interface FeedbackTabProps {
    siteId: string;
    pageId: string;
    section: Section;
    /** Every note on the site; the pane picks this section's. */
    comments: SiteCommentView[];
    review: ReviewState;
    /** The last re-read of notes and verdict failed (RVD4). */
    loadFailed: boolean;
    refreshReview: () => Promise<void>;
    /** "All notes on this site": the whole site's Feedback. */
    onWholeSite?: () => void;
}

/**
 * Inspector › Feedback (U47): this section's notes, as today's block
 * Feedback (`block-feedback.tsx`): reply, settle and reopen for the editor,
 * a note box for whoever may comment. A reader first sees where the review
 * stands. The whole site's notes are a link away (desk: Rail › Feedback).
 * The phone's section sheet (U49) reuses it.
 */
export function FeedbackTab({
    siteId,
    pageId,
    section,
    comments,
    review,
    loadFailed,
    refreshReview,
    onWholeSite,
}: FeedbackTabProps) {
    const readOnly = useEditorReadOnly();
    const reviewCan = useEditorReviewCan();
    return (
        <div className="grid gap-3">
            {readOnly ? (
                <ReviewerStatus
                    review={review}
                    loadFailed={loadFailed}
                    onRetry={() => void refreshReview()}
                    onSeeSettled={() => onWholeSite?.()}
                />
            ) : null}
            <div className="-mx-4">
                <BlockFeedback
                    // Remounted per section: a half-typed reply must not
                    // follow the selection to another section.
                    key={section.key}
                    siteId={siteId}
                    pageId={pageId}
                    sectionKey={section.key}
                    label={SECTION_LABELS[section.type]}
                    comments={comments}
                    onChanged={refreshReview}
                    canSettle={!readOnly}
                    canComment={reviewCan.comment}
                    reviewer={readOnly}
                />
            </div>
            {onWholeSite ? (
                <TextLink
                    onClick={onWholeSite}
                    className="justify-self-start text-sm"
                >
                    All notes on this site
                </TextLink>
            ) : null}
        </div>
    );
}
