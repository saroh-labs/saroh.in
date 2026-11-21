"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { ChevronDown, ChevronLeft, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import { PagesPanel } from "@/components/sites/pages/pages-panel";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import { STATUS_BADGE } from "@/components/sites/publish/status-readout";
import type { EditorTopBarProps, useEditorBar } from "../editor-bar";
import { EditorSheet } from "../editor-sheet";
import { MoreSheet } from "../more-actions";
import { PublishButton } from "../top-bar-actions";

/**
 * A phone's top bar (DEC-185): ← Website, the page (its sheet), the status,
 * ⋯ More (a sheet of the rest) and Publish. Moved verbatim out of
 * `editor-top-bar.tsx` (U46) so the one phone editor (U49) owns it; it
 * takes the bar's props and what `useEditorBar` worked out from them.
 */
export function PhoneTopBar({
    bar,
    siteId,
    pages,
    pageId,
    dirty,
    saving,
    onlyHeldBack,
    heldBack,
    styleDirty,
    siteFlags,
    openNotes,
    openFeedback,
    canUpdateSite,
    addablePageKinds,
    sheet = null,
    setSheet,
    sheetHost = null,
    reviewerVerdict,
}: EditorTopBarProps & { bar: ReturnType<typeof useEditorBar> }) {
    const { readOnly, activePage, status, readout, actions, pageSheet } = bar;
    const onPageSettings = bar.onPageSettings;
    const close = () => setSheet?.(null);
    return (
        <>
            <header
                data-editor-bar=""
                className="flex h-14 shrink-0 items-center gap-1 border-b px-1.5"
            >
                <Link
                    href={`/sites/${siteId}/pages`}
                    aria-label="Back to Website"
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronLeft aria-hidden className="size-5" />
                </Link>
                <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`Page: ${activePage?.title ?? "Page"}. Choose another page to edit`}
                    onClick={() => setSheet?.("pages")}
                    className="flex h-11 min-w-0 max-w-[40%] shrink-0 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-sm font-semibold transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <span className="min-w-0 truncate">
                        {activePage?.title ?? "Page"}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className="size-[13px] shrink-0 text-muted-foreground"
                    />
                </button>
                <Badge
                    role="status"
                    variant={STATUS_BADGE[status.tone]}
                    size="sm"
                    className="ml-0.5 min-w-0 shrink truncate"
                >
                    <span className="truncate">{status.label}</span>
                </Badge>
                <span className="flex-1" />
                <button
                    type="button"
                    aria-label={
                        openNotes > 0
                            ? `More: preview, feedback (${openNotes} open), share and test links`
                            : "More: preview, feedback, share and test links"
                    }
                    onClick={() => setSheet?.("more")}
                    className="relative grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <MoreHorizontal aria-hidden className="size-5" />
                    {openNotes > 0 ? (
                        <span
                            aria-hidden
                            data-notes-dot=""
                            className="absolute right-2 top-2.5 size-2 rounded-full bg-destructive ring-2 ring-background"
                        />
                    ) : null}
                </button>
                {readOnly ? (
                    // Where Publish sits: a Reviewer's verdict (RVD3Phone).
                    // A reader who may not approve has none to open.
                    reviewerVerdict ? (
                        <Button
                            type="button"
                            aria-haspopup="dialog"
                            onClick={() => setSheet?.("review")}
                            className="h-11 shrink-0"
                        >
                            Review
                        </Button>
                    ) : null
                ) : (
                    <PublishButton {...actions} className="h-11 shrink-0" />
                )}
            </header>
            {readOnly && reviewerVerdict ? (
                <EditorSheet
                    open={sheet === "review"}
                    onClose={close}
                    container={sheetHost}
                    side="bottom"
                    title="Your review"
                    closeLabel="Close your review"
                    className="h-[80%]"
                >
                    {reviewerVerdict}
                </EditorSheet>
            ) : null}
            <EditorSheet
                open={sheet === "pages"}
                onClose={close}
                container={sheetHost}
                side="bottom"
                title="Pages"
                closeLabel="Close pages"
            >
                <div className="min-h-0 flex-1 overflow-y-auto">
                    <PagesPanel
                        siteId={siteId}
                        pages={pages}
                        activePageId={pageId}
                        dirty={dirty || saving || styleDirty}
                        unfinished={
                            onlyHeldBack
                                ? unfinishedPhrase(heldBack)
                                : undefined
                        }
                        canUpdate={canUpdateSite}
                        addableKinds={addablePageKinds}
                        flags={siteFlags.flags}
                        onClose={close}
                        phone
                        onPageSettings={onPageSettings}
                    />
                </div>
            </EditorSheet>
            <EditorSheet
                open={sheet === "more"}
                onClose={close}
                container={sheetHost}
                side="bottom"
                title="More"
                closeLabel="Close More"
            >
                <MoreSheet
                    {...actions}
                    status={readout}
                    done={close}
                    onFeedback={openFeedback}
                />
            </EditorSheet>
            {pageSheet}
        </>
    );
}
