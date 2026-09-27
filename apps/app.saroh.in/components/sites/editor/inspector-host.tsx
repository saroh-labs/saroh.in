"use client";

import { showSuccess } from "@saroh/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { BlockFeedback } from "@/components/sites/block-feedback";
import {
    BlockInspector,
    FixedBlockInspector,
} from "@/components/sites/block-inspector";
import { EditorTabs } from "@/components/sites/editor-chrome";
import {
    SECTION_LABELS,
    sectionTitle,
} from "@/components/sites/editor-constants";
import type {
    ActiveSection,
    EditorInspectorTab,
    FixedPart,
} from "@/components/sites/editor/use-editor-selection";
import { ReviewPanel } from "@/components/sites/review-panel";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import { useServicesForPicker } from "@/components/sites/use-services-for-picker";
import type {
    Flag,
    ReviewState,
    Section,
    SiteCommentView,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

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
    hasFooter,
    setSelectedIndex,
    comments,
    review,
    openNotes,
    notesByKey,
    refreshReview,
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
    /** Whether the canvas draws a footer the merchant wrote. */
    hasFooter: boolean;
    setSelectedIndex: (index: number | null) => void;
    comments: SiteCommentView[];
    review: ReviewState;
    openNotes: number;
    notesByKey: Map<string, number>;
    refreshReview: () => Promise<void>;
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
    // The Remove-section confirmation (replaces window.confirm, §9). Mirrors
    // pages-panel.tsx's pendingDelete + deleteOpen: the section removed is
    // kept after the dialog closes so its title does not blank out during
    // the closing animation, and so onConfirm still has something to remove
    // once removeAt has cleared the selection and `active` has gone null.
    const [pendingRemove, setPendingRemove] = useState<{
        index: number;
        title: string;
    } | null>(null);
    const [removeOpen, setRemoveOpen] = useState(false);
    const services = useServicesForPicker();

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
                        <ToggleGroup
                            type="single"
                            value={feedbackScope}
                            onValueChange={(v) => {
                                if (v === "block" || v === "site") {
                                    setFeedbackScope(v);
                                }
                            }}
                            aria-label="Whose feedback"
                            className={SEGMENTED}
                        >
                            <ToggleGroupItem value="block" className={SEGMENT}>
                                This block
                            </ToggleGroupItem>
                            <ToggleGroupItem value="site" className={SEGMENT}>
                                Whole site
                                {openNotes > 0 ? (
                                    <span className="ml-1.5 tabular-nums text-highlight">
                                        {openNotes}
                                    </span>
                                ) : null}
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                ) : null}
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
                    />
                ) : inspector === "feedback" ? (
                    <ReviewPanel
                        siteId={siteId}
                        pages={pages}
                        comments={comments}
                        review={review}
                        onChanged={() => void refreshReview()}
                        onJump={(jumpPageId, sectionKey) => {
                            jumpToNote(jumpPageId, sectionKey);
                            // Arrived at the block: show its notes.
                            setFeedbackScope("block");
                        }}
                    />
                ) : selectedChrome ? (
                    <FixedBlockInspector
                        part={selectedChrome}
                        siteId={siteId}
                        hasFooter={hasFooter}
                    />
                ) : (
                    <BlockInspector
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
                        onRemove={() => {
                            if (!active) return;
                            /*
                             * Ask first, and name the block. Autosave
                             * commits a removal, and version history
                             * only covers what was PUBLISHED, so copy
                             * written since is gone for good. The
                             * question names hiding too — usually what
                             * a merchant reaching for Remove wants.
                             */
                            setPendingRemove({
                                index: active.index,
                                title: sectionTitle(active.section),
                            });
                            setRemoveOpen(true);
                        }}
                    />
                )}
            </div>
            {/*
             * Outside both branches: confirming removes the block,
             * which sets `active` to null and would otherwise unmount
             * this dialog mid-close.
             */}
            <ConfirmDialog
                open={removeOpen}
                onOpenChange={setRemoveOpen}
                title={`Remove "${pendingRemove?.title ?? ""}"?`}
                description="Anything written here since your last publish cannot be brought back. To take it off the site and keep the work, hide it instead."
                confirmLabel="Remove section"
                cancelLabel="Keep section"
                onConfirm={() => {
                    if (!pendingRemove) return;
                    const { index, title } = pendingRemove;
                    removeAt(index);
                    setSelectedIndex(null);
                    showSuccess(`Removed ${title}.`);
                }}
            />
        </aside>
    );
}
