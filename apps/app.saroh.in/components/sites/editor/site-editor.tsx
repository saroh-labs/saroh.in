"use client";

import { openAskAi } from "@/components/ask-ai/open";
import { AddSectionDialog } from "@/components/sites/blocks/add-section-dialog";
import { useAddBlock } from "@/components/sites/blocks/use-add-block";
import { queryCanvas } from "@/components/sites/canvas/device-frame";
import {
    canvasChromeFor,
    EditorCanvas,
} from "@/components/sites/canvas/editor-canvas";
import { useEditorViewport } from "@/components/sites/canvas/use-editor-viewport";
import { starterContentActions } from "@/components/sites/looks/starter-content-actions";
import { BrandSheetActions } from "@/components/sites/looks/style-panel";
import { useEditorStyle } from "@/components/sites/looks/use-editor-style";
import type { PublishMore } from "@/components/sites/publish/publish-more";
import { PublishSheet } from "@/components/sites/publish/publish-sheet";
import type { DraftReadiness } from "@/components/sites/publish/use-publish";
import { usePublish } from "@/components/sites/publish/use-publish";
import { usePublishChanges } from "@/components/sites/publish/use-publish-changes";
import { ReviewSheet } from "@/components/sites/review/review-sheet";
import {
    reviewOwner,
    TopBarVerdict,
    youApproved,
} from "@/components/sites/review/verdict-controls";
import { TemplateRow } from "@/components/sites/templates/template-row";
import {
    testReleaseActions,
    TestReleaseSheets,
} from "@/components/sites/test-releases/test-release-sheets";
import { TestReleasesPanel } from "@/components/sites/test-releases/test-releases-panel";
import { useTestReleases } from "@/components/sites/test-releases/use-test-releases";
import { flagsByScreenPosition } from "@/lib/sites/editor-positions";
import { siteStatus } from "@/lib/sites/site-status";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables } from "@/lib/sites/style";
import { styleChoiceRules } from "@/lib/sites/style-access";
import { publishOverScheduleWarning } from "@/lib/sites/test-releases";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
import type { LookId } from "@saroh/block-contract";
import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { BlockToolbar } from "./block-toolbar";
import { SECTION_LABELS, sectionTitle } from "./editor-constants";
import type { EditorPanelsProps } from "./editor-panels";
import { EditorPanels } from "./editor-panels";
import { EditorRail, railTabFor, selectRailTab } from "./editor-rail";
import type { EditorTopBarProps } from "./editor-top-bar";
import { EditorTopBar } from "./editor-top-bar";
import { InspectorHost } from "./inspector-host";
import { EverywhereBanner } from "./inspector/everywhere-banner";
import { sectionActions } from "./inspector/section-actions";
import { frameOf } from "./inspector/section-frame";
import { SectionToolbar } from "./inspector/section-toolbar";
import { SiteInspector } from "./inspector/site-inspector";
import { PhoneShell } from "./phone/phone-shell";
import { EditorReadOnly, EditorReviewCan } from "./read-only";
import type { EditorModel, TrailKey } from "./shell/editor-model";
import { EditorShell } from "./shell/editor-shell";
import type { SiteEditorProps } from "./site-editor-props";
import { useEditorDraft } from "./use-editor-draft";
import { takePendingNote, useEditorJumps } from "./use-editor-jumps";
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
    readOnly = false,
    reviewCan = EVERY_REVIEW_ABILITY,
    initialFlags,
    initialComments,
    initialReview,
    neverPublished: initialNeverPublished,
    publishedAt = null,
    unreadableSections,
    initialPendingChanges,
    initialPendingSiteChanges,
    initialSections,
    initialRevision,
    siteName,
    navigation,
    footerPreview,
    canUpdateSite: canUpdateSiteProp,
    address,
    initialStyle,
    styleOptions,
    looksAvailable = false,
    liveLook: initialLiveLook = null,
    styleAccess = null,
    templateId = null,
    templateRow = null,
    shopOpen = false,
    packsOpen = false,
    addablePageKinds,
    initialTestReleases = { state: "off" },
    canPublish: canPublishProp = false,
    publishNeedsApproval = false,
    canOverride = false,
    livePublishedAt = null,
    reloadDraft,
    initialSheet = null,
    webAddressFix = null,
    askAi = false,
}: SiteEditorProps) {
    // Read-only (DEC-200) takes the owner's powers away whatever was sent.
    const canUpdateSite = canUpdateSiteProp && !readOnly;
    const canPublish = canPublishProp && !readOnly;
    const review = useEditorReview({
        siteId,
        pageId,
        initialComments,
        initialReview,
        readOnly,
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
    // The changes by person, read as the Publish sheet opens (U11).
    const publishChanges = usePublishChanges(siteId);
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
        readOnly,
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
        readOnly,
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
    const edits = useUndo({
        ...draft,
        ...siteStyle,
        setSelectedIndex,
        readOnly,
    });
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

    /*
     * On opening a page: the block a note on it was jumped to from another
     * page, with its notes; otherwise, for a Reviewer, Feedback rather than
     * Block (DEC-200), since notes are what they came to write. Once per
     * page, as the editor is keyed on it.
     */
    useEffect(() => {
        const key = takePendingNote(pageId);
        const index =
            key === null ? -1 : initialSections.findIndex((s) => s.key === key);
        if (index !== -1) {
            setSelectedIndex(index);
            setInspector("feedback");
        } else if (readOnly) {
            placed.setInspector("feedback");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page open
    }, [pageId]);

    const active = activeSection(selection.selectedIndex, sections);
    /**
     * Bring a block to the top of the canvas, after the render that moves
     * it. The canvas alone scrolls: `scrollIntoView` would scroll the
     * phone's whole window too, and the bar with it.
     */
    const scrollToBlock = (index: number) =>
        requestAnimationFrame(() => {
            const canvas = viewport.canvasRef.current;
            if (!canvas) return;
            const block = queryCanvas<HTMLElement>(
                canvas,
                `[data-block-index="${index}"]`,
            );
            if (!block) return;
            // A block in the device frame is measured from the frame.
            const frame = block.ownerDocument.defaultView?.frameElement;
            const top =
                block.getBoundingClientRect().top +
                (frame ? frame.getBoundingClientRect().top : 0) -
                canvas.getBoundingClientRect().top;
            canvas.scrollTo({
                top: canvas.scrollTop + top - 8,
                behavior: "smooth",
            });
        });
    // A tapped block's toolbar on a phone (DEC-185): each with Undo.
    const blockTools =
        layout === "phone" && !readOnly
            ? (index: number) => (
                  <BlockToolbar
                      index={index}
                      count={sections.length}
                      onMove={(delta) => {
                          edits.move(index, delta);
                          setSelectedIndex(index + delta);
                          scrollToBlock(index + delta);
                      }}
                      onRemove={() => edits.removeAt(index)}
                  />
              )
            : undefined;
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

    // A Reviewer's verdict (DEC-200): the bar's on a desk, a sheet on a phone.
    // Only for a reader who may approve: never offer what the API refuses.
    const verdict =
        readOnly && reviewCan.approve
            ? {
                  owner: reviewOwner(review.review),
                  approved: youApproved(review.review),
                  pagesRead: review.review.pagesRead,
                  recording: review.recording,
                  onRecord: review.record,
                  openNotes: review.comments
                      .filter((c) => c.editable && c.resolvedAt === null)
                      .map((c) => {
                          const type =
                              c.pageId === pageId
                                  ? sections.find((s) => s.key === c.sectionKey)
                                        ?.type
                                  : undefined;
                          return {
                              id: c.id,
                              where: [
                                  c.pageTitle ?? "Removed page",
                                  type && SECTION_LABELS[type],
                              ]
                                  .filter(Boolean)
                                  .join(" · "),
                              body: c.body,
                          };
                      }),
              }
            : null;

    /*
     * The Website area's shell (U46, KTD-E1): on a desk the new frame, on a
     * phone today's until U49; off, today's chrome. All three run on the
     * hooks above.
     */
    const areaOn = websiteAreaOn();
    // The page settings sheet (batch 1), opened from the picker or More.
    const [settingsPage, setSettingsPage] = useState<string | null>(null);
    const openCheck = (ready: DraftReadiness) => {
        // An Undo pressed behind the check would change the draft being
        // published (G-1).
        if (!ready.dirty) {
            edits.settleUndo();
            void publishChanges.load();
        }
        return publish.openCheck(ready);
    };
    const desk = areaOn && layout !== "phone";
    // History and Feedback are the shell's own rail tabs; Pages, Add and
    // Brand are today's rail state, so a reload comes back to Brand.
    const [trailExtra, setTrailExtra] = useState<"history" | "feedback" | null>(
        null,
    );
    const railTab = railTabFor(selection.rail, add.adding && !readOnly);
    const trail: TrailKey =
        trailExtra ?? (railTab === "page" ? "pages" : railTab);
    const openRail = (tab: TrailKey) => {
        if (tab === "history" || tab === "feedback") {
            setTrailExtra(tab);
            add.setAdding(false);
            return;
        }
        setTrailExtra(null);
        selectRailTab(tab === "pages" ? "page" : tab, setRail, add.setAdding);
    };
    const model: EditorModel = {
        ...{ siteId, pageId, pages, address: address ?? null, layout },
        page: pages.find((p) => p.id === pageId),
        siteName: chrome.displayName,
        ...{ readOnly, canUpdateSite, canPublish, askAi: askAi && !readOnly },
        unsaved,
        // The chip's words (RULES §2), from the counts the bar has always read.
        status: siteStatus(
            {
                currentPublicationId: publish.neverPublished ? null : "live",
                pendingSectionChanges: publish.pendingChanges,
                pendingSiteChanges: publish.pendingSiteChanges,
                hasUnpublishedChanges: false,
            },
            { reader: readOnly },
        ),
        styleOptions,
        addablePageKinds: addablePageKinds ?? [],
        ...{ shopOpen, packsOpen, active, draft, selection, sheets, viewport },
        ...{ edits, review, publish, publishChanges, siteStyle, chrome, add },
        releases,
        openPublish: () =>
            void openCheck({
                dirty,
                onlyHeldBack: draft.onlyHeldBack,
                heldBack: draft.heldBack,
            }),
        openPageSettings: (id) => setSettingsPage(id),
        openRail,
        jumpToNote,
        trail,
        scrollToSection: scrollToBlock,
        reloadDraft: reloadDraft ? (page) => reloadDraft(page) : undefined,
    };

    // The selected section's toolbar on the desk canvas (U47), each with Undo.
    const deskTools =
        desk && !readOnly
            ? (index: number) => {
                  const section = sections[index];
                  const act = sectionActions(model);
                  return (
                      <SectionToolbar
                          label={sectionTitle(section)}
                          index={index}
                          count={sections.length}
                          hiddenOnPhone={frameOf(section).hideOn === "phone"}
                          onMove={(delta) => {
                              edits.move(index, delta);
                              setSelectedIndex(index + delta);
                              scrollToBlock(index + delta);
                          }}
                          onDuplicate={() => act.duplicate(index)}
                          onHideOnPhone={(hide) => act.hideOnPhone(index, hide)}
                          onDelete={() => edits.removeAt(index)}
                          onAskAi={model.askAi ? openAskAi : undefined}
                      />
                  );
              }
            : undefined;

    const railEl = (
        <EditorRail
            hideTabs={desk}
            phone={layout === "phone"}
            onPicked={scrollToBlock}
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
                    ...(canUpdateSite && starter ? { starter } : {}),
                },
            }}
            styleRules={styleRules}
            // The site's template (DEC-216): changed by
            // whoever may change the site, read by others.
            templateRow={
                templateRow ? (
                    <TemplateRow
                        source={templateRow}
                        pages={pages}
                        starter={canUpdateSite ? starter : null}
                        look={style.look ?? null}
                    />
                ) : null
            }
            templateName={
                templateRow
                    ? (templateRow.templates?.find(
                          (t) => t.id === templateRow.current,
                      )?.name ?? null)
                    : undefined
            }
        />
    );
    const canvasEl = (
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
            blockTools={deskTools ?? blockTools}
            // A typeface being tried draws on the page unsaved.
            style={siteStyle.trying ?? style}
            trying={triedFace(siteStyle.trying, styleOptions)}
            // Holds a page switch back (G-3).
            dirty={unsaved}
            neverPublished={publish.neverPublished}
            canvasChrome={canvasChrome}
            notesByKey={review.notesByKey}
        />
    );
    const inspectorEl = desk ? (
        // The Website area's inspector (U47); off, or on a phone, today's.
        <SiteInspector
            model={model}
            activeFlags={activeFlags}
            unreadableSections={unreadableSections}
            onShowFlag={(flag) => jumpToFlag(flag.pageId, flag.sectionIndex)}
        />
    ) : (
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
    );
    // Today's bar and body; with the Website area on, the desk shell
    // (U46) runs on the same props, and a phone keeps them until U49.
    const topBar: ReactElement<EditorTopBarProps> = (
        <EditorTopBar
            {...{ siteId, address, pages, pageId, layout }}
            publishedAt={publishedAt}
            siteName={chrome.displayName}
            {...draft}
            // Site settings saved on their own clock: the look, the name
            // and the footer. Publish waits for all three.
            styleSaving={siteStyle.styleSaving || chrome.chromeSaving}
            styleDirty={siteStyle.styleDirty || chrome.chromeDirty}
            saveError={draft.saveError || chrome.chromeFailed}
            {...review}
            {...publish}
            openCheck={openCheck}
            {...viewport}
            openFeedback={() => setInspector("feedback")}
            openSitePreview={() => {
                // The whole site's Feedback, where a preview link is
                // made, not a block's (UX-068): the shell's rail tab.
                if (desk) return openRail("feedback");
                setSelectedIndex(null);
                setInspector("feedback");
            }}
            pageSettings={{ id: settingsPage, set: setSettingsPage }}
            canUpdateSite={canUpdateSite}
            addablePageKinds={addablePageKinds}
            scheduled={releases.scheduled}
            testRelease={testReleaseActions(releases)}
            sheet={sheets.sheet}
            setSheet={sheets.setSheet}
            sheetHost={body}
            reviewerVerdict={
                !verdict ? undefined : layout === "phone" ? (
                    <ReviewSheet
                        {...verdict}
                        review={review.review}
                        loadFailed={review.loadFailed}
                        onRetry={() => void review.refreshReview()}
                        onSeeSettled={() => {
                            // The whole site's Feedback, where the
                            // settled notes are (RVD4).
                            setSelectedIndex(null);
                            setInspector("feedback");
                        }}
                        onDone={() => sheets.setSheet(null)}
                    />
                ) : (
                    <TopBarVerdict {...verdict} />
                )
            }
        />
    );
    const panels: ReactElement<EditorPanelsProps> = (
        <EditorPanels
            {...{ layout, viewport, sheets, selection }}
            {...add}
            dialogOpen={lookFor !== null || browsing}
            hasSubject={active !== null || selection.selectedChrome !== null}
            inspectorTitle={
                selection.selectedChrome === "header"
                    ? "Header"
                    : selection.selectedChrome === "footer"
                      ? "Footer"
                      : // A Reviewer's Feedback sheet names its block (RVD1Phone).
                        (selection.inspector === "feedback" && !readOnly) ||
                          !active
                        ? "Feedback"
                        : SECTION_LABELS[active.section.type]
            }
            pageTitle={pages.find((p) => p.id === pageId)?.title ?? "this page"}
            overlayOpen={publish.checking}
            openNotes={review.openNotes}
            brandActions={
                readOnly ? undefined : (
                    <BrandSheetActions
                        saving={siteStyle.styleSaving}
                        dirty={siteStyle.styleDirty}
                        onReset={() => edits.resetStyle()}
                    />
                )
            }
            body={body}
            setBody={setBody}
            rail={railEl}
            canvas={canvasEl}
            inspector={inspectorEl}
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
    );

    return (
        // The workspace's theme (#335); the page on the canvas is bright.
        <EditorReadOnly.Provider value={readOnly}>
            <EditorReviewCan.Provider value={reviewCan}>
                <div className="flex h-dvh flex-col bg-background text-foreground">
                    {desk ? (
                        <EditorShell
                            model={model}
                            bar={topBar.props}
                            panels={panels.props}
                            canvas={
                                selection.selectedChrome ? (
                                    // Header or footer: it changes every page.
                                    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                                        <EverywhereBanner
                                            pages={pages}
                                            onSeePages={() => openRail("pages")}
                                            onBack={() => {
                                                setSelectedIndex(null);
                                                openRail("pages");
                                            }}
                                        />
                                        {canvasEl}
                                    </div>
                                ) : (
                                    canvasEl
                                )
                            }
                            inspector={inspectorEl}
                            brand={railEl}
                            flagsBySection={flagsBySection}
                        />
                    ) : areaOn ? (
                        <PhoneShell model={model} topBar={topBar}>
                            {panels}
                        </PhoneShell>
                    ) : (
                        <>
                            {topBar}
                            {panels}
                        </>
                    )}

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
                        siteId={siteId}
                        changes={publishChanges}
                        onFlagsChanged={() => void publish.refreshFlags()}
                        onAsk={() => void review.askForReview()}
                        more={publishMore(siteId, releases, publish.closeCheck)}
                        // Tell people about the page open here, once live;
                        // the home page when this one was left out.
                        share={
                            publish.siteAddress
                                ? {
                                      page:
                                          (publishChanges.leftOut.has(
                                              `page:${pageId}`,
                                          )
                                              ? homePage
                                              : pages.find(
                                                    (p) => p.id === pageId,
                                                )) ?? pages[0],
                                      business: chrome.displayName,
                                      host: publish.siteAddress,
                                  }
                                : null
                        }
                        phone={layout === "phone"}
                        pages={pages}
                        flags={publish.siteFlags.flags}
                        awaitingNavigation={
                            publish.siteFlags.awaitingNavigation
                        }
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
                        onPublish={(choice) =>
                            void publish.onPublish(chrome.displayName, choice)
                        }
                        onClose={publish.closeCheck}
                        onJump={jumpToFlag}
                    />
                    {leaveGuard.dialog}
                </div>
            </EditorReviewCan.Provider>
        </EditorReadOnly.Provider>
    );
}

/**
 * The Publish sheet's other ways on (DEC-071): See versions, and the test
 * links where they are on. Each closes the sheet for what it opens.
 */
function publishMore(
    siteId: string,
    releases: Parameters<typeof testReleaseActions>[0],
    closeSheet: () => void,
): PublishMore {
    const actions = testReleaseActions(releases);
    const then = (run: () => void) => () => {
        closeSheet();
        run();
    };
    return {
        versionsHref: `/sites/${siteId}/versions`,
        ...(actions
            ? {
                  testLinks: {
                      count: actions.count,
                      onOpen: then(actions.onOpenList),
                  },
                  // Scheduling is a test link's Go live › Schedule.
                  onSchedule: then(actions.onOpenList),
                  ...(actions.onMake
                      ? { onShareTestLink: then(actions.onMake) }
                      : {}),
              }
            : {}),
    };
}

/** An editor's default: a reader's abilities are passed in by the page. */
const EVERY_REVIEW_ABILITY = { comment: true, approve: true };

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
