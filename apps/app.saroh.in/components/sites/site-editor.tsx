"use client";

import { AddSectionDialog } from "@/components/sites/add-section-dialog";
import { PanelDivider } from "@/components/sites/editor-chrome";
import {
    canvasChromeFor,
    EditorCanvas,
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
import { useSiteChrome } from "@/components/sites/editor/use-site-chrome";
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
 * SiteEditor (S2-004): the page's blocks beside a live `DraftPreview` of local
 * state. Since #260 this only composes: the state lives in the hooks in
 * `editor/` (draft, style, header and footer text, selection, viewport,
 * review, publish, adding a block, jumping to a note) and the drawing in its
 * panels (top bar, rail, canvas, inspector host).
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
    const selection = useEditorSelection({
        siteId,
        sectionCount: initialCount,
    });
    const { setSelectedIndex, setRail, setInspector } = selection;
    const viewport = useEditorViewport({
        siteId,
        pageId,
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
    // Preview (G5) puts the rail and inspector away, kept mounted.
    const tools = viewport.previewing
        ? { hidden: true }
        : { className: "contents" };

    return (
        // The workspace's theme (#335); the page on the canvas is bright.
        <div className="flex h-screen flex-col bg-background text-foreground">
            <EditorTopBar
                {...{ siteId, address, pages, pageId }}
                siteName={chrome.displayName}
                {...draft}
                // Site settings saved on their own clock: the look, the name
                // and the footer. Publish waits for all three.
                styleSaving={siteStyle.styleSaving || chrome.chromeSaving}
                styleDirty={siteStyle.styleDirty || chrome.chromeDirty}
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
                        "--editor-cols": viewport.previewing
                            ? "1fr"
                            : editorColumns(
                                  viewport.railWidth,
                                  viewport.panelWidth,
                              ),
                    } as React.CSSProperties
                }
            >
                <div {...tools}>
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
                </div>

                <EditorCanvas
                    {...viewport}
                    {...selection}
                    {...draft}
                    {...{ siteId, pageId, address, pages, style, styleOptions }}
                    neverPublished={publish.neverPublished}
                    canvasChrome={canvasChrome}
                    notesByKey={review.notesByKey}
                />

                <div {...tools}>
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
                        fixedText={chrome}
                        jumpToNote={jumpToNote}
                        activeFlags={activeFlags}
                        unreadableSections={unreadableSections}
                    />
                </div>
            </div>

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
