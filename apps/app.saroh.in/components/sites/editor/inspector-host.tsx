"use client";

import { useState } from "react";

import { BlockFeedback } from "@/components/sites/blocks/block-feedback";
import { BlockInspector } from "@/components/sites/blocks/block-inspector";
import type { FixedBlockText } from "@/components/sites/blocks/fixed-block-inspector";
import { FixedBlockInspector } from "@/components/sites/blocks/fixed-block-inspector";
import type { HeldBackSection } from "@/components/sites/blocks/saveable-sections";
import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import type {
    ActiveSection,
    EditorInspectorTab,
    FixedPart,
} from "@/components/sites/editor/use-editor-selection";
import { ReviewPanel } from "@/components/sites/review/review-panel";
import { ReviewerStatus } from "@/components/sites/review/reviewer-status";
import type {
    Flag,
    ReviewState,
    Section,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { Segmented } from "@saroh/ui/segmented";
import { EditorTabs } from "./editor-chrome";
import { SECTION_LABELS } from "./editor-constants";
import { useEditorReadOnly, useEditorReviewCan } from "./read-only";

/** A Reviewer's powers in Feedback (DEC-200): notes, nothing else here. */
const READ_ONLY_REVIEW = { approve: false, ask: false, settle: false };

/**
 * The right column: the inspector (#340). Block is what can be changed about
 * the selected block; Feedback is what reviewers have said. Both answer
 * questions about the thing selected on the page, which is why they sit
 * beside it rather than under the list. Moved out of `site-editor.tsx`
 * unchanged (#260).
 */
export function InspectorHost({
    siteId,
    pageId,
    pages,
    inspector,
    setInspector,
    active,
    sections,
    selectedChrome,
    fixedText,
    setSelectedIndex,
    comments,
    review,
    openNotes,
    notesByKey,
    refreshReview,
    loadFailed = false,
    jumpToNote,
    style,
    styleOptions,
    activeFlags,
    unreadableSections,
    errorIndex,
    errorMessage,
    heldBackAt,
    replaceAt,
    toggleHidden,
    move,
    removeAt,
}: {
    siteId: string;
    pageId: string;
    pages: SitePage[];
    inspector: EditorInspectorTab;
    setInspector: (next: EditorInspectorTab) => void;
    active: ActiveSection | null;
    sections: Section[];
    selectedChrome: FixedPart | null;
    /** The header's name and the footer's line, edited here (G6). */
    fixedText: FixedBlockText;
    setSelectedIndex: (index: number | null) => void;
    comments: SiteCommentView[];
    review: ReviewState;
    openNotes: number;
    notesByKey: Map<string, number>;
    refreshReview: () => Promise<void>;
    /** The last re-read of notes and verdict failed (RVD4). */
    loadFailed?: boolean;
    jumpToNote: (pageId: string, sectionKey: string) => void;
    style: SiteStyle;
    styleOptions: SiteStyleOptions;
    activeFlags: Flag[];
    unreadableSections: string[];
    errorIndex: number | null;
    errorMessage: string | null;
    heldBackAt: (index: number) => HeldBackSection | undefined;
    replaceAt: (index: number, next: Section) => void;
    toggleHidden: (index: number) => void;
    move: (index: number, delta: number) => void;
    removeAt: (index: number) => void;
}) {
    /** Feedback for the selected block, or the whole site's review. */
    const [feedbackScope, setFeedbackScope] = useState<"block" | "site">(
        "block",
    );
    const services = useServicesForPicker();
    /*
     * Read-only (DEC-200): no settling, no verdict and no preview links in
     * the panel; the verdict is the top bar's (U4). Above the notes, where
     * the review stands for this Reviewer.
     */
    const readOnly = useEditorReadOnly();
    const reviewCan = useEditorReviewCan();
    /** "See the notes": the whole site, settled notes only (RVD4). */
    const [settledOnly, setSettledOnly] = useState(false);
    const status =
        readOnly && inspector === "feedback" ? (
            <div className="px-4 pt-4">
                <ReviewerStatus
                    review={review}
                    loadFailed={loadFailed}
                    onRetry={() => void refreshReview()}
                    onSeeSettled={() => {
                        setSettledOnly(true);
                        setFeedbackScope("site");
                    }}
                />
            </div>
        ) : null;

    return (
        <aside aria-label="Inspector" className="flex min-h-0 flex-col">
            <EditorTabs
                label="Inspector"
                tabs={[
                    { key: "block", label: "Block" },
                    {
                        key: "feedback",
                        label: "Feedback",
                        // The selected block's own count, as its pin
                        // shows; the whole site's with none selected.
                        count:
                            active === null
                                ? openNotes
                                : active.section.key === undefined
                                  ? 0
                                  : (notesByKey.get(active.section.key) ?? 0),
                    },
                ]}
                value={inspector}
                onSelect={setInspector}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
                {/*
                 * Feedback reaches two things: what was said about
                 * the selected block, and the whole site's review —
                 * verdicts, preview links and every note, on every
                 * page, settled ones included. The second must stay
                 * reachable whatever is selected (review of #347).
                 */}
                {inspector === "feedback" && active ? (
                    <div className="px-4 pt-4">
                        <Segmented
                            label="Whose feedback"
                            value={feedbackScope}
                            onValueChange={setFeedbackScope}
                            options={[
                                { value: "block", label: "This block" },
                                {
                                    value: "site",
                                    label: "Whole site",
                                    count:
                                        openNotes > 0 ? openNotes : undefined,
                                },
                            ]}
                        />
                    </div>
                ) : null}
                {status}
                {inspector === "feedback" &&
                active &&
                feedbackScope === "block" ? (
                    <BlockFeedback
                        // Remounted per block: a half-typed reply must
                        // not follow the selection to another block.
                        key={active.section.key ?? `i${active.index}`}
                        siteId={siteId}
                        pageId={pageId}
                        sectionKey={active.section.key}
                        label={SECTION_LABELS[active.section.type]}
                        comments={comments}
                        onChanged={refreshReview}
                        canSettle={!readOnly}
                        canComment={reviewCan.comment}
                        reviewer={readOnly}
                    />
                ) : inspector === "feedback" ? (
                    <ReviewPanel
                        siteId={siteId}
                        pages={pages}
                        comments={comments}
                        review={review}
                        {...(readOnly
                            ? {
                                  can: READ_ONLY_REVIEW,
                                  previewLinks: false,
                                  settledOnly,
                                  onShowAll: () => setSettledOnly(false),
                              }
                            : {})}
                        onChanged={() => void refreshReview()}
                        onJump={(jumpPageId, sectionKey) => {
                            jumpToNote(jumpPageId, sectionKey);
                            // Arrived at the block: show its notes.
                            setFeedbackScope("block");
                            setSettledOnly(false);
                        }}
                    />
                ) : selectedChrome ? (
                    <FixedBlockInspector
                        part={selectedChrome}
                        siteId={siteId}
                        text={fixedText}
                    />
                ) : (
                    <BlockInspector
                        siteId={siteId}
                        active={active}
                        count={sections.length}
                        pages={pages}
                        services={services}
                        style={style}
                        styleOptions={styleOptions}
                        flags={activeFlags}
                        unreadable={
                            active?.section.key !== undefined &&
                            unreadableSections.includes(active.section.key)
                        }
                        error={
                            active !== null && errorIndex === active.index
                                ? errorMessage
                                : null
                        }
                        heldBack={
                            active === null
                                ? undefined
                                : heldBackAt(active.index)
                        }
                        onChange={(next) => {
                            if (active) replaceAt(active.index, next);
                        }}
                        onToggleHidden={() => {
                            if (active) toggleHidden(active.index);
                        }}
                        onMove={(delta) => {
                            if (!active) return;
                            move(active.index, delta);
                            setSelectedIndex(active.index + delta);
                        }}
                        onAddNote={() => setInspector("feedback")}
                        onRemove={() => {
                            // At once, with Undo (G3): taking a block off
                            // the page is reversible, so it is not asked.
                            if (active) removeAt(active.index);
                        }}
                    />
                )}
            </div>
        </aside>
    );
}
