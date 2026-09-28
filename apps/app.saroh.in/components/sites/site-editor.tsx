"use client";

import { AddSectionDialog } from "@/components/sites/add-section-dialog";
import {
    canvasChromeFor,
    EditorCanvas,
} from "@/components/sites/editor/editor-canvas";
import { EditorPanels } from "@/components/sites/editor/editor-panels";
import { EditorRail } from "@/components/sites/editor/editor-rail";
import { EditorTopBar } from "@/components/sites/editor/editor-top-bar";
import { InspectorHost } from "@/components/sites/editor/inspector-host";
import type { SiteEditorProps } from "@/components/sites/editor/site-editor-props";
import { useAddBlock } from "@/components/sites/editor/use-add-block";
import { useEditorDraft } from "@/components/sites/editor/use-editor-draft";
import { useEditorJumps } from "@/components/sites/editor/use-editor-jumps";
import {
    useEditorLayout,
    useEditorSheets,
} from "@/components/sites/editor/use-editor-layout";
import { useEditorReview } from "@/components/sites/editor/use-editor-review";
import {
    activeSection,
    useEditorSelection,
} from "@/components/sites/editor/use-editor-selection";
import { useEditorStyle } from "@/components/sites/editor/use-editor-style";
import { useEditorViewport } from "@/components/sites/editor/use-editor-viewport";
import { usePublish } from "@/components/sites/editor/use-publish";
import { useSiteChrome } from "@/components/sites/editor/use-site-chrome";
import { useUndo } from "@/components/sites/editor/use-undo";
import { PrePublishCheck } from "@/components/sites/pre-publish-check";
import { flagsByScreenPosition } from "@/lib/sites/editor-positions";
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * SiteEditor (S2-004): the page's blocks beside a live `DraftPreview` of local
 * state. Since #260 this only composes: the state lives in the hooks in
 * `editor/` (draft, style, header and footer text, selection, viewport,
 * review, publish, adding a block, jumping to a note, the layout for the
 * window and its sheets) and the drawing in its panels (top bar, rail,
 * canvas, inspector host), which `EditorPanels` lays out for a desk, a narrow
 * window or a phone (G4).
 */
export function SiteEditor({
    siteId,
    pageId,
    pages,
    initialFlags,
    initialComments,
    initialReview,
    neverPublished: initialNeverPublished,
    unreadableSections,
    initialPendingChanges,
    initialPendingSiteChanges,
    initialSections,
    initialRevision,
    siteName,
    navigation,
    footerPreview,
    canUpdateSite,
    address,
    initialStyle,
    styleOptions,
}: SiteEditorProps) {
    const review = useEditorReview({
        siteId,
        pageId,
        initialComments,
        initialReview,
    });
    const publish = usePublish({
        siteId,
        address,
        initialFlags,
        initialNeverPublished,
        initialPendingChanges,
        initialPendingSiteChanges,
        refreshReview: review.refreshReview,
    });
    // The header's name and footer's line (G6), saved like the look.
    const chrome = useSiteChrome({
        ...{ siteId, siteName, footerPreview },
        canUpdate: canUpdateSite,
        onSaved: publish.markSitePending,
    });
    const initialCount = initialSections.length;
    const placed = useEditorSelection({ siteId, sectionCount: initialCount });
    const layout = useEditorLayout();
    const viewport = useEditorViewport({
        siteId,
        pageId,
        sectionCount: initialCount,
        initialScrollTop: placed.place.scrollTop,
        narrow: layout !== "wide",
    });
    // Below the desk width, choosing something opens its sheet (G4).
    const sheets = useEditorSheets(placed, layout, viewport.previewing);
    const { selection } = sheets;
    const { setSelectedIndex, setRail, setInspector } = selection;
    const draft = useEditorDraft({
        siteId,
        pageId,
        siteName,
        initialSections,
        initialRevision,
        publishing: publish.publishing,
        recordSaved: publish.recordSaved,
        refreshFlags: publish.refreshFlags,
        selectedIndexNow: selection.selectedIndexNow,
    });
    const { sections, dirty } = draft;
    const siteStyle = useEditorStyle({
        siteId,
        initialStyle,
        styleOptions,
        onSaved: publish.markStylePending,
    });
    const { style } = siteStyle;
    // Remove, move, hide and reset act at once and offer Undo (G3).
    const edits = useUndo({ ...draft, ...siteStyle, setSelectedIndex });
    /*
     * Anything not saved yet: the page, the look, the name or the footer.
     * Opening another page drops it, and publishing would miss it (G-1, G-3).
     */
    const unsaved =
        dirty || draft.saving || siteStyle.styleDirty || chrome.chromeDirty;

    const add = useAddBlock({
        insertSection: draft.insertSection,
        setSelectedIndex,
        setInspector,
        canvasRef: viewport.canvasRef,
    });
    const { lookFor, browsing, setLookFor, setBrowsing, addSection } = add;
    const { jumpToNote, jumpToFlag } = useEditorJumps({
        siteId,
        pageId,
        dirty: unsaved,
        sections,
        setRail,
        setSelectedIndex,
        setInspector,
        closeCheck: () => publish.setChecking(false),
    });

    const active = activeSection(selection.selectedIndex, sections);
    // The site's flags for the open page, by section: the rail's dots.
    const flagsBySection = flagsByScreenPosition(
        publish.siteFlags.flags,
        pageId,
        draft.sentFrom,
    );
    const activeFlags =
        active === null ? [] : (flagsBySection.get(active.index) ?? []);
    const canvasChrome = canvasChromeFor({
        siteName: chrome.displayName,
        navigation,
        pages,
        footer: chrome.footer,
    });

    return (
        // The workspace's theme (#335); the page on the canvas is bright.
        <div className="flex h-dvh flex-col bg-background text-foreground">
            <EditorTopBar
                {...{ siteId, address, pages, pageId, layout }}
                siteName={chrome.displayName}
                {...draft}
                // Site settings saved on their own clock: the look, the name
                // and the footer. Publish waits for all three.
                styleSaving={siteStyle.styleSaving || chrome.chromeSaving}
                styleDirty={siteStyle.styleDirty || chrome.chromeDirty}
                saveError={draft.saveError || chrome.chromeFailed}
                {...review}
                {...publish}
                openCheck={(ready) => {
                    // An Undo pressed behind the check would change the
                    // draft being published (G-1).
                    if (!ready.dirty) edits.settleUndo();
                    return publish.openCheck(ready);
                }}
                {...viewport}
                openFeedback={() => setInspector("feedback")}
            />

            <EditorPanels
                {...{ layout, viewport, sheets, selection }}
                {...add}
                dialogOpen={lookFor !== null || browsing}
                hasSubject={
                    active !== null || selection.selectedChrome !== null
                }
                openNotes={review.openNotes}
                rail={
                    <EditorRail
                        {...selection}
                        {...siteStyle}
                        {...draft}
                        {...edits}
                        styleOptions={styleOptions}
                        {...add}
                        flagsBySection={flagsBySection}
                        notedKeys={review.notedKeys}
                    />
                }
                canvas={
                    <EditorCanvas
                        {...viewport}
                        {...selection}
                        {...draft}
                        {...{
                            siteId,
                            pageId,
                            address,
                            pages,
                            style,
                            styleOptions,
                        }}
                        // Holds a page switch back (G-3).
                        dirty={unsaved}
                        neverPublished={publish.neverPublished}
                        canvasChrome={canvasChrome}
                        notesByKey={review.notesByKey}
                    />
                }
                inspector={
                    <InspectorHost
                        {...{ siteId, pageId, pages, styleOptions }}
                        {...selection}
                        {...draft}
                        {...edits}
                        {...review}
                        style={style}
                        active={active}
                        fixedText={chrome}
                        jumpToNote={jumpToNote}
                        activeFlags={activeFlags}
                        unreadableSections={unreadableSections}
                    />
                }
            />

            {/*
             * The pre-publish check (below) is rendered inside the editor
             * rather than on its own route so nothing is torn down and rebuilt
             * behind it — the merchant goes back to exactly the editing state
             * they left, including unsaved selection and scroll.
             */}
            {/*
             * Choosing a look before the block goes in (#267). Keyed on the
             * block so each opening starts on that block's looks.
             */}
            <AddSectionDialog
                key={lookFor ?? (browsing ? "browse" : "none")}
                open={lookFor !== null || browsing}
                startType={lookFor}
                onOpenChange={(open) => {
                    if (!open) {
                        setLookFor(null);
                        setBrowsing(false);
                    }
                }}
                variables={resolveStyleVariables(style, styleOptions)}
                onAdd={(type, variant) => addSection(type, variant)}
            />

            {publish.checking ? (
                <PrePublishCheck
                    siteName={chrome.displayName}
                    pages={pages}
                    flags={publish.siteFlags.flags}
                    awaitingNavigation={publish.siteFlags.awaitingNavigation}
                    publishing={publish.publishing}
                    unsaved={unsaved}
                    neverPublished={publish.neverPublished}
                    pendingSummary={publish.pendingSummary}
                    pendingKnown={publish.pendingKnown}
                    review={review.review}
                    onPublish={() => void publish.onPublish(chrome.displayName)}
                    onClose={() => publish.setChecking(false)}
                    onJump={jumpToFlag}
                />
            ) : null}
        </div>
    );
}
