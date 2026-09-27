"use client";

import { AddSectionDialog } from "@/components/sites/add-section-dialog";
import { PanelDivider } from "@/components/sites/editor-chrome";
import {
    canvasChromeFor,
    EditorCanvas,
    FullScreenPreview,
} from "@/components/sites/editor/editor-canvas";
import { EditorRail } from "@/components/sites/editor/editor-rail";
import { EditorTopBar } from "@/components/sites/editor/editor-top-bar";
import { InspectorHost } from "@/components/sites/editor/inspector-host";
import type { SiteEditorProps } from "@/components/sites/editor/site-editor-props";
import { useAddBlock } from "@/components/sites/editor/use-add-block";
import { useEditorDraft } from "@/components/sites/editor/use-editor-draft";
import { useEditorJumps } from "@/components/sites/editor/use-editor-jumps";
import { useEditorReview } from "@/components/sites/editor/use-editor-review";
import {
    activeSection,
    useEditorSelection,
} from "@/components/sites/editor/use-editor-selection";
import { useEditorStyle } from "@/components/sites/editor/use-editor-style";
import {
    editorColumns,
    useEditorViewport,
} from "@/components/sites/editor/use-editor-viewport";
import { usePublish } from "@/components/sites/editor/use-publish";
import { useUndo } from "@/components/sites/editor/use-undo";
import { PrePublishCheck } from "@/components/sites/pre-publish-check";
import { flagsByScreenPosition } from "@/lib/sites/editor-positions";
import {
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
} from "@/lib/sites/editor-prefs";
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * SiteEditor (S2-004) — the ticket's core deliverable. A client-side editable
 * list of sections rendered next to a LIVE `DraftPreview` that reflects local
 * state with no network round-trip (that is the "preview without publishing"
 * requirement). "Save draft" and "Publish" are the only API calls, via the
 * server actions. A dirty flag (local state vs. last-saved) gates publishing.
 *
 * Since #260 this only composes: the state lives in the hooks in `editor/`
 * (draft, style, selection, viewport, review, publish, adding a block, and
 * jumping to a note or flag) and the drawing in its panels (top bar, rail,
 * canvas, inspector host).
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
        siteName,
        address,
        initialFlags,
        initialNeverPublished,
        initialPendingChanges,
        initialPendingSiteChanges,
        refreshReview: review.refreshReview,
    });
    const initialCount = initialSections.length;
    const selection = useEditorSelection({
        siteId,
        sectionCount: initialCount,
    });
    const { setSelectedIndex, setRail, setInspector } = selection;
    const viewport = useEditorViewport({
        siteId,
        sectionCount: initialCount,
        initialScrollTop: selection.place.scrollTop,
    });
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
        dirty,
        sections,
        setRail,
        setSelectedIndex,
        setInspector,
        closeCheck: () => publish.setChecking(false),
    });

    const active = activeSection(selection.selectedIndex, sections);
    /*
     * Flags for the page currently open, indexed by section. The server sends
     * flags for the whole site; the rail can only draw dots for the sections it
     * is showing.
     */
    const flagsBySection = flagsByScreenPosition(
        publish.siteFlags.flags,
        pageId,
        draft.sentFrom,
    );
    const activeFlags =
        active === null ? [] : (flagsBySection.get(active.index) ?? []);
    const canvasChrome = canvasChromeFor({
        siteName,
        navigation,
        pages,
        footerPreview,
    });
    const preview = { siteId, address, sections, pages, style, styleOptions };

    return (
        /*
         * The editor follows the workspace's theme (#335), and the bar has a
         * toggle for it. It used to force dark; the design gives the merchant
         * the choice, and the page on the canvas is bright either way.
         */
        <div className="flex h-screen flex-col bg-background text-foreground">
            <EditorTopBar
                {...{ siteId, siteName, address, pages, pageId }}
                {...draft}
                styleSaving={siteStyle.styleSaving}
                styleDirty={siteStyle.styleDirty}
                {...review}
                {...publish}
                {...viewport}
            />

            <div
                className="grid min-h-0 flex-1 lg:grid-cols-[var(--editor-cols)]"
                style={
                    {
                        // Blocks, the page, the inspector (#340); see
                        // `editorColumns` for how the widths are shared.
                        "--editor-cols": editorColumns(
                            viewport.railWidth,
                            viewport.panelWidth,
                        ),
                    } as React.CSSProperties
                }
            >
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

                <PanelDivider
                    label="Resize the block list"
                    width={viewport.railWidth}
                    min={RAIL_MIN}
                    max={RAIL_MAX}
                    reset={RAIL_DEFAULT}
                    onResize={viewport.setRailWidth}
                    onNudge={viewport.nudgeRail}
                />

                <EditorCanvas
                    {...viewport}
                    {...selection}
                    {...preview}
                    conflict={draft.conflict}
                    neverPublished={publish.neverPublished}
                    canvasChrome={canvasChrome}
                    notesByKey={review.notesByKey}
                />

                <PanelDivider
                    label="Resize the inspector"
                    width={viewport.panelWidth}
                    min={PANEL_MIN}
                    max={PANEL_MAX}
                    reset={PANEL_DEFAULT}
                    onResize={viewport.setPanelWidth}
                    onNudge={viewport.nudgePanel}
                    panelSide="right"
                />

                <InspectorHost
                    {...{ siteId, pageId, pages, styleOptions }}
                    {...selection}
                    {...draft}
                    {...edits}
                    {...review}
                    style={style}
                    active={active}
                    hasFooter={canvasChrome.footer !== null}
                    jumpToNote={jumpToNote}
                    activeFlags={activeFlags}
                    unreadableSections={unreadableSections}
                />
            </div>

            {/*
             * The pre-publish check (below) is rendered inside the editor
             * rather than on its own route so nothing is torn down and rebuilt
             * behind it — the merchant goes back to exactly the editing state
             * they left, including unsaved selection and scroll.
             */}
            {viewport.fullScreen ? (
                <FullScreenPreview
                    {...preview}
                    device={viewport.device}
                    setFullScreen={viewport.setFullScreen}
                    canvasChrome={canvasChrome}
                />
            ) : null}

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
                    siteName={siteName}
                    pages={pages}
                    flags={publish.siteFlags.flags}
                    awaitingNavigation={publish.siteFlags.awaitingNavigation}
                    publishing={publish.publishing}
                    neverPublished={publish.neverPublished}
                    pendingSummary={publish.pendingSummary}
                    pendingKnown={publish.pendingKnown}
                    review={review.review}
                    onPublish={() => void publish.onPublish()}
                    onClose={() => publish.setChecking(false)}
                    onJump={jumpToFlag}
                />
            ) : null}
        </div>
    );
}
