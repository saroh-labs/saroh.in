"use client";

import { AddSectionDialog } from "@/components/sites/blocks/add-section-dialog";
import { useAddBlock } from "@/components/sites/blocks/use-add-block";
import {
    canvasChromeFor,
    EditorCanvas,
} from "@/components/sites/canvas/editor-canvas";
import { useEditorViewport } from "@/components/sites/canvas/use-editor-viewport";
import { starterContentActions } from "@/components/sites/looks/starter-content-actions";
import { useEditorStyle } from "@/components/sites/looks/use-editor-style";
import { PublishSheet } from "@/components/sites/publish/publish-sheet";
import { usePublish } from "@/components/sites/publish/use-publish";
import {
    testReleaseActions,
    TestReleaseSheets,
} from "@/components/sites/test-releases/test-release-sheets";
import { TestReleasesPanel } from "@/components/sites/test-releases/test-releases-panel";
import { useTestReleases } from "@/components/sites/test-releases/use-test-releases";
import { flagsByScreenPosition } from "@/lib/sites/editor-positions";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables } from "@/lib/sites/style";
import { styleChoiceRules } from "@/lib/sites/style-access";
import { publishOverScheduleWarning } from "@/lib/sites/test-releases";
import type { LookId } from "@saroh/block-contract";
import { useEffect, useRef, useState } from "react";
import { SECTION_LABELS } from "./editor-constants";
import { EditorPanels } from "./editor-panels";
import { EditorRail } from "./editor-rail";
import { EditorTopBar } from "./editor-top-bar";
import { InspectorHost } from "./inspector-host";
import type { SiteEditorProps } from "./site-editor-props";
import { useEditorDraft } from "./use-editor-draft";
import { useEditorJumps } from "./use-editor-jumps";
import { useEditorLayout, useEditorSheets } from "./use-editor-layout";
import { useEditorLeave } from "./use-editor-leave";
import { useEditorReview } from "./use-editor-review";
import { activeSection, useEditorSelection } from "./use-editor-selection";
import { useSiteChrome } from "./use-site-chrome";
import { useUndo } from "./use-undo";

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
    looksAvailable = false,
    liveLook: initialLiveLook = null,
    styleAccess = null,
    templateId = null,
    shopOpen = false,
    packsOpen = false,
    addablePageKinds,
    initialTestReleases = { state: "off" },
    canPublish = false,
    publishNeedsApproval = false,
    canOverride = false,
    livePublishedAt = null,
    reloadDraft,
    initialSheet = null,
    webAddressFix = null,
}: SiteEditorProps) {
    const review = useEditorReview({
        siteId,
        pageId,
        initialComments,
        initialReview,
    });
    // The site's test releases (DEC-071, T11); hidden while they're off.
    /*
     * The look the live site is in (U16). Publishing puts the draft's
     * saved look live, so it moves with a publish; the ref holds the
     * saved look for that moment, as the style hook comes after.
     */
    const [liveLook, setLiveLook] = useState<LookId | null>(initialLiveLook);
    const savedLookRef = useRef<LookId | null>(initialStyle.look ?? null);
    const releaseState = useTestReleases({
        siteId,
        initialRead: initialTestReleases,
        initialLivePublishedAt: livePublishedAt,
    });
    const publish = usePublish({
        siteId,
        address,
        initialFlags,
        initialNeverPublished,
        initialPendingChanges,
        initialPendingSiteChanges,
        refreshReview: review.refreshReview,
        initialNeedsApproval: publishNeedsApproval,
        canOverride,
        // Publishing moves the live site under the releases: a scheduled
        // go-live won't run over it, and Go live replaces something newer.
        onLiveChanged: () => {
            setLiveLook(savedLookRef.current);
            if (!releaseState.available) return;
            void releaseState.refresh();
            void releaseState.readLive();
        },
    });
    const releases = {
        ...releaseState,
        abilities: {
            canPublish,
            canUpdate: canUpdateSite,
            needsApproval: publish.needsApproval,
            canOverride,
        },
    };
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
    const sheets = useEditorSheets(
        placed,
        layout,
        viewport.previewing,
        initialSheet,
    );
    const { selection } = sheets;
    // The editor's body, below the top bar: where its sheets are laid.
    const [body, setBody] = useState<HTMLDivElement | null>(null);
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
    useEffect(() => {
        savedLookRef.current = siteStyle.savedLook;
    }, [siteStyle.savedLook]);
    // Remove, move, hide and reset act at once and offer Undo (G3).
    const edits = useUndo({ ...draft, ...siteStyle, setSelectedIndex });
    /*
     * Anything not saved yet: the page, the look, the name or the footer.
     * Opening another page drops it, and publishing would miss it (G-1, G-3).
     */
    const unsaved =
        dirty || draft.saving || siteStyle.styleDirty || chrome.chromeDirty;
    // A link out waits for the editor's own save, and asks only when the
    // work can't save by itself.
    const leaveGuard = useEditorLeave({
        unsaved,
        stuck:
            draft.onlyHeldBack ||
            draft.conflict ||
            draft.saveError ||
            chrome.chromeFailed,
    });

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
        homeSections: pages.find((p) => p.id === pageId)?.isHome
            ? sections
            : undefined,
    });

    // Free and paid looks, typefaces and colourways (DEC-177): what the
    // server holds stays open to the site whatever its plan.
    const styleRules = styleChoiceRules(
        styleAccess,
        siteStyle.savedStyle,
        styleOptions,
        liveLook,
    );
    const homePage = pages.find((p) => p.isHome) ?? pages.at(0);
    // A look's starter content (DEC-182): the editor starts afresh on it.
    const starter = reloadDraft
        ? starterContentActions({
              siteId,
              homePageId: homePage?.id ?? null,
              unsaved,
              settleUndo: () => edits.settleUndo(),
              // A phone's Brand sheet stays open on the fresh editor.
              reloadDraft: (page) => reloadDraft(page, sheets.sheet),
          })
        : null;

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
                openSitePreview={() => {
                    // The whole site's Feedback, where a preview link is
                    // made, not a block's (UX-068).
                    setSelectedIndex(null);
                    setInspector("feedback");
                }}
                canUpdateSite={canUpdateSite}
                addablePageKinds={addablePageKinds}
                scheduled={releases.scheduled}
                testRelease={testReleaseActions(releases)}
                sheet={sheets.sheet}
                setSheet={sheets.setSheet}
                sheetHost={body}
            />

            <EditorPanels
                {...{ layout, viewport, sheets, selection }}
                {...add}
                dialogOpen={lookFor !== null || browsing}
                hasSubject={
                    active !== null || selection.selectedChrome !== null
                }
                inspectorTitle={
                    selection.selectedChrome === "header"
                        ? "Header"
                        : selection.selectedChrome === "footer"
                          ? "Footer"
                          : selection.inspector === "feedback" || !active
                            ? "Feedback"
                            : SECTION_LABELS[active.section.type]
                }
                pageTitle={
                    pages.find((p) => p.id === pageId)?.title ?? "this page"
                }
                overlayOpen={publish.checking}
                body={body}
                setBody={setBody}
                rail={
                    <EditorRail
                        phone={layout === "phone"}
                        {...selection}
                        {...siteStyle}
                        {...draft}
                        {...edits}
                        styleOptions={styleOptions}
                        {...add}
                        flagsBySection={flagsBySection}
                        notedKeys={review.notedKeys}
                        shopOpen={shopOpen}
                        packsOpen={packsOpen}
                        looks={{
                            available: looksAvailable,
                            liveLook,
                            published: !publish.neverPublished,
                            templateId,
                            error: siteStyle.lookError,
                            onChoose: siteStyle.chooseLook,
                            // Each look's Preview draws its showcase
                            // template, and offers its starter content to
                            // whoever may change the site (DEC-182).
                            preview: {
                                pages,
                                ...(canUpdateSite && starter
                                    ? { starter }
                                    : {}),
                            },
                        }}
                        styleRules={styleRules}
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
                            styleOptions,
                        }}
                        // A typeface being tried draws on the page unsaved.
                        style={siteStyle.trying ?? style}
                        trying={triedFace(siteStyle.trying, styleOptions)}
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
                releases={
                    releases.available
                        ? {
                              open: releases.panelOpen,
                              onClose: () => releases.setPanelOpen(false),
                              content: (
                                  <TestReleasesPanel
                                      siteId={siteId}
                                      releases={releases}
                                  />
                              ),
                          }
                        : undefined
                }
            />

            <TestReleaseSheets
                siteId={siteId}
                releases={releases}
                // A release freezes what the server holds (the rule Publish
                // keeps): unsaved work on screen would not be in it.
                unsaved={unsaved}
                recordWentLive={publish.recordWentLive}
            />

            {/*
             * Publish (below) is a sheet over the editor rather than its own
             * route, so nothing is torn down and rebuilt behind it: the
             * merchant goes back to exactly the editing state they left
             * (DEC-185).
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
                look={style.look}
                onAdd={(type, variant) => addSection(type, variant)}
                shopOpen={shopOpen}
                packsOpen={packsOpen}
            />

            <PublishSheet
                open={publish.checking}
                phone={layout === "phone"}
                pages={pages}
                flags={publish.siteFlags.flags}
                awaitingNavigation={publish.siteFlags.awaitingNavigation}
                publishing={publish.publishing}
                unsaved={unsaved}
                neverPublished={publish.neverPublished}
                pendingSummary={publish.pendingSummary}
                pendingKnown={publish.pendingKnown}
                pendingChanges={publish.pendingChanges}
                pendingSiteChanges={publish.pendingSiteChanges}
                review={review.review}
                needsApproval={publish.needsApproval}
                canOverride={publish.canOverride}
                // KTD-14: a scheduled go-live won't run over this.
                scheduledWarning={
                    releases.scheduledRelease
                        ? publishOverScheduleWarning(
                              releases.scheduledRelease,
                              releases.zone,
                          )
                        : null
                }
                wentLive={publish.wentLive}
                error={publish.publishError}
                addressFix={webAddressFix}
                onAddressSaved={(host) => {
                    publish.setSiteAddress(host);
                    void publish.refreshFlags();
                }}
                onPublish={() => void publish.onPublish(chrome.displayName)}
                onClose={publish.closeCheck}
                onJump={jumpToFlag}
            />
            {leaveGuard.dialog}
        </div>
    );
}

/** The tried typeface's name, for the line over the page; null for none. */
function triedFace(
    trying: SiteStyle | null,
    options: SiteStyleOptions,
): string | null {
    if (!trying) return null;
    const pairs = options.fontPairs ?? [];
    const key = trying.fontPair ?? pairs[0]?.key;
    return pairs.find((p) => p.key === key)?.name ?? null;
}
