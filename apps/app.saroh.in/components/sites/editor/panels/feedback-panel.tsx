"use client";

import { ReviewPanel } from "@/components/sites/review/review-panel";
import { ReviewerStatus } from "@/components/sites/review/reviewer-status";
import type { EditorModel } from "../shell/editor-model";

/** A reader writes notes and nothing else (DEC-200). */
const READ_ONLY_REVIEW = { approve: false, ask: false, settle: false };

export interface FeedbackPanelProps {
    model: EditorModel;
}

/**
 * Rail › Feedback (U46): the whole site's notes, with the preview links an
 * owner shares from here. Stub body: today's Whole site view from
 * `inspector-host.tsx`; a later unit may redraw it without touching the
 * shell. A note's Go to section selects it, with its notes, on its page.
 */
export function FeedbackPanel({ model }: FeedbackPanelProps) {
    const { siteId, pages, review, readOnly } = model;
    return (
        <section aria-label="Feedback" className="flex min-h-0 flex-1 flex-col">
            <h2 className="flex h-12 shrink-0 items-center px-4 text-[0.9375rem] font-semibold">
                Feedback
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {readOnly ? (
                    <div className="px-4">
                        <ReviewerStatus
                            review={review.review}
                            loadFailed={review.loadFailed}
                            onRetry={() => void review.refreshReview()}
                            onSeeSettled={() => undefined}
                        />
                    </div>
                ) : null}
                <ReviewPanel
                    siteId={siteId}
                    pages={pages}
                    comments={review.comments}
                    review={review.review}
                    {...(readOnly
                        ? {
                              can: READ_ONLY_REVIEW,
                              previewLinks: false,
                          }
                        : {})}
                    onChanged={() => void review.refreshReview()}
                    // Selects the section, its notes in the inspector.
                    onJump={model.jumpToNote}
                />
            </div>
        </section>
    );
}
