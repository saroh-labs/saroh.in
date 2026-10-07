"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { ChevronDown, ChevronLeft, Ellipsis } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/business-zone";
import type { Device, Zoom } from "@/components/sites/editor-constants";
import {
    publishTitle,
    STATUS_BADGE,
    statusReadout,
} from "@/components/sites/editor/status-readout";
import type {
    TestReleaseActions,
    TopBarActionProps,
} from "@/components/sites/editor/top-bar-actions";
import { TopBarActions } from "@/components/sites/editor/top-bar-actions";
import type { EditorLayout } from "@/components/sites/editor/use-editor-layout";
import type { DraftReadiness } from "@/components/sites/editor/use-publish";
import { unfinishedPhrase } from "@/components/sites/held-back-copy";
import { PagesPanel } from "@/components/sites/pages-panel";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import type { EditorStatus } from "@/lib/sites/editor-status";
import type {
    ModulePageKind,
    ReviewState,
    SiteFlags,
    SitePage,
} from "@/lib/sites/service";

/**
 * The editor's top bar: where you are (Website, site, page, status), how the
 * page is shown (theme, width, zoom, Preview), and the two ways
 * work leaves the editor (Share, Publish). Moved out of
 * `site-editor.tsx` (#260), then laid out as Saroh Site Editor.dc.html draws
 * it (G2): the status is true after a reload, Publish says what it puts
 * live, and Style moved to the rail's Brand tab.
 *
 * ONE line on a desk: the actions never shrink, the breadcrumb truncates
 * instead. Losing the end of a page name is a smaller loss than losing
 * Publish. Narrow (G4), the actions wrap to a second line rather than run off
 * the bar, as the design's bar does; on a phone, the status and every action
 * fold into one menu beside the page switcher.
 */
export function EditorTopBar({
    siteId,
    siteName,
    address,
    pages,
    pageId,
    dirty,
    saving,
    saveError,
    lastSavedAt,
    onlyHeldBack,
    heldBack,
    styleSaving,
    styleDirty,
    review,
    openNotes,
    asking,
    askForReview,
    withdrawReview,
    neverPublished,
    pendingSummary,
    pendingShort,
    pendingKnown,
    publishing,
    siteFlags,
    openCheck,
    device,
    setDevice,
    zoom,
    setZoom,
    previewing,
    setPreviewing,
    layout,
    openFeedback,
    openSitePreview,
    canUpdateSite,
    addablePageKinds,
    needsApproval = false,
    canOverride = false,
    scheduled = null,
    testRelease,
}: {
    siteId: string;
    siteName: string;
    address?: string | null;
    pages: SitePage[];
    pageId: string;
    dirty: boolean;
    saving: boolean;
    saveError: boolean;
    lastSavedAt: Date | null;
    onlyHeldBack: boolean;
    heldBack: HeldBackSection[];
    styleSaving: boolean;
    styleDirty: boolean;
    review: ReviewState;
    openNotes: number;
    asking: boolean;
    askForReview: () => Promise<void>;
    /** Take the open review request back (UX-068). */
    withdrawReview: () => Promise<void>;
    neverPublished: boolean;
    pendingSummary: string | null;
    pendingShort: string | null;
    pendingKnown: boolean;
    publishing: boolean;
    siteFlags: SiteFlags;
    openCheck: (draft: DraftReadiness) => Promise<void>;
    device: Device;
    setDevice: (next: Device) => void;
    zoom: Zoom;
    setZoom: (next: Zoom) => void;
    /** Preview in place (G5), on or off. */
    previewing: boolean;
    setPreviewing: (on: boolean) => void;
    layout: EditorLayout;
    /** Narrow: open the inspector on Feedback, with nothing selected. */
    openFeedback: () => void;
    /** Open the whole site's Feedback, where preview links are (UX-068). */
    openSitePreview: () => void;
    /** Whether this person holds `site:update`: page settings and Add a page. */
    canUpdateSite: boolean;
    /** The module pages the site can have now (G14), for Add a page. */
    addablePageKinds?: ModulePageKind[];
    /** "Publishing needs approval" is on (DEC-071, R10). */
    needsApproval?: boolean;
    /** An owner who can publish past it, on the record (KTD-11). */
    canOverride?: boolean;
    /** "Going live Fri 6:00pm · Diwali menu" (T11), when one is scheduled. */
    scheduled?: string | null;
    /** The Test release split; absent while test releases are off. */
    testRelease?: TestReleaseActions;
}) {
    /** The page switcher under the page name in the breadcrumb. */
    const zone = useBusinessZone();
    const [pagesOpen, setPagesOpen] = useState(false);

    const activePage = pages.find((page) => page.id === pageId);
    const {
        status,
        detail: statusDetail,
        line: statusLine,
    } = statusReadout({
        saving,
        styleSaving,
        saveError,
        onlyHeldBack,
        heldBack,
        dirty,
        styleDirty,
        review,
        neverPublished,
        pendingSummary,
        pendingShort,
        pendingKnown,
        lastSavedAt,
        openNotes,
        scheduled,
        zone,
    });
    const publishHint = publishTitle({
        publishing,
        dirty: dirty || saving || styleDirty,
        saveError,
        onlyHeldBack,
        heldBack,
        neverPublished,
        pendingShort,
        pendingKnown,
        needsApproval,
        canOverride,
    });
    const phone = layout === "phone";
    const actions: TopBarActionProps = {
        ...{ device, setDevice, zoom, setZoom, previewing, setPreviewing },
        ...{ asking, publishing, publishHint, openNotes },
        ...{ needsApproval, canOverride, testRelease },
        inReview: review.pending,
        askForReview: () => void askForReview(),
        withdrawReview: () => void withdrawReview(),
        onSharePreview: openSitePreview,
        publishDisabled: publishing || dirty || saving || styleDirty,
        flagCount: siteFlags.flags.length,
        onPublish: () => void openCheck({ dirty, onlyHeldBack, heldBack }),
        onFeedback: layout === "narrow" ? openFeedback : undefined,
    };
    const readout = (
        <StatusReadout
            status={status}
            detail={statusDetail}
            line={statusLine}
        />
    );

    return (
        <header
            data-editor-bar=""
            className={cn(
                "flex shrink-0 items-center gap-3 border-b px-3.5",
                layout === "narrow"
                    ? "min-h-[52px] flex-wrap gap-y-2 py-2"
                    : "h-[52px] overflow-hidden",
            )}
        >
            <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-1 text-sm"
            >
                {/*
                 * The design's trail: back to Website, the business, then
                 * the page menu. The business name is where you are, not a
                 * link; the way out is the Website crumb before it.
                 */}
                <Link
                    href={`/sites/${siteId}/pages`}
                    aria-label="Back to Website"
                    title={address ?? undefined}
                    className="flex shrink-0 items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[0.78125rem] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                >
                    <ChevronLeft aria-hidden className="size-[15px] shrink-0" />
                    Website
                </Link>
                {/* A phone keeps the way out and the page; the name goes. */}
                {phone ? null : (
                    <>
                        <span
                            aria-hidden
                            className="px-px text-[0.9375rem] text-muted-foreground/70"
                        >
                            /
                        </span>
                        <span className="min-w-0 truncate text-[0.84375rem] font-medium text-muted-foreground">
                            {siteName}
                        </span>
                    </>
                )}
                <span
                    aria-hidden
                    className="px-px text-[0.9375rem] text-muted-foreground/70"
                >
                    /
                </span>
                {/*
                 * The page name is the page switcher: which page is open
                 * is part of where you are, so it lives in the
                 * breadcrumb rather than in a tab beside the blocks.
                 */}
                <Popover open={pagesOpen} onOpenChange={setPagesOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            // A button and a list, as the design's page menu
                            // is (G16); the popover sets aria-expanded.
                            aria-haspopup="listbox"
                            aria-label={`Page: ${activePage?.title ?? "Page"}. Choose another page to edit`}
                            className={cn(
                                "flex h-[30px] min-w-0 cursor-pointer items-center gap-[7px] rounded-lg border bg-card pl-[11px] pr-[9px] text-[0.84375rem] font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted data-[state=open]:bg-secondary coarse:h-11",
                                // On a phone a long page name gives way
                                // before the menu beside it does.
                                !phone && "shrink-0",
                            )}
                        >
                            <span className="max-w-[12rem] truncate">
                                {activePage?.title ?? "Page"}
                            </span>
                            <ChevronDown
                                aria-hidden
                                className="size-[13px] shrink-0 text-muted-foreground"
                            />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="start"
                        sideOffset={6}
                        className="max-h-[70vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[10px] p-0 shadow-lg"
                    >
                        <PagesPanel
                            siteId={siteId}
                            pages={pages}
                            activePageId={pageId}
                            // The look, the name and the footer too: a
                            // page switch drops whatever has not gone out
                            // yet (review G-3).
                            dirty={dirty || saving || styleDirty}
                            unfinished={
                                onlyHeldBack
                                    ? unfinishedPhrase(heldBack)
                                    : undefined
                            }
                            canUpdate={canUpdateSite}
                            addableKinds={addablePageKinds}
                            flags={siteFlags.flags}
                            onClose={() => setPagesOpen(false)}
                        />
                    </PopoverContent>
                </Popover>
                {phone ? null : readout}
            </nav>

            {phone ? (
                <PhoneMenu status={readout} actions={actions} />
            ) : (
                <TopBarActions
                    {...actions}
                    // Tablet width (UX-035): the secondary actions fold into
                    // "More" so Publish never runs off the bar.
                    compact={layout === "narrow"}
                />
            )}
        </header>
    );
}

/**
 * "Published", "Not published · 2 blocks, footer" or "Not published yet" (G2),
 * worked out from the server's count so it is the same after a reload, then
 * what the pill leaves out: the reviewer's verdict, how many notes are open,
 * and what publishing would change when a review outranks it in the pill.
 * Both truncate rather than wrap — they never push Publish off the bar — and
 * the full words are in their titles and in Publish's.
 */
function StatusReadout({
    status,
    detail,
    line,
}: {
    status: EditorStatus;
    detail: string;
    line: string;
}) {
    return (
        <>
            <Badge
                role="status"
                variant={STATUS_BADGE[status.tone]}
                title={
                    [status.label, detail].filter(Boolean).join("\n") ||
                    undefined
                }
                className="ml-1 min-w-0 shrink truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.04em]"
            >
                <span className="truncate">{status.label}</span>
            </Badge>
            {line ? (
                <span
                    className="ml-1 min-w-0 truncate text-[0.71875rem] text-muted-foreground"
                    title={detail}
                >
                    {line}
                </span>
            ) : null}
        </>
    );
}

/**
 * A phone's bar (G4): the status, the view and Publish folded into one menu,
 * so the page switcher keeps its room and every control keeps a thumb-sized
 * target. What the status says is written out inside it, since a phone has
 * no hover to read a title with.
 */
function PhoneMenu({
    status,
    actions,
}: {
    status: ReactNode;
    actions: TopBarActionProps;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Status, view and publish"
                    className="ml-auto grid size-11 shrink-0 place-items-center rounded-[9px] border bg-card text-muted-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Ellipsis aria-hidden className="size-5" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 p-3"
            >
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {status}
                </div>
                <TopBarActions
                    stacked
                    {...actions}
                    // Preview and Publish end the visit to the menu.
                    setPreviewing={(on) => {
                        setOpen(false);
                        actions.setPreviewing(on);
                    }}
                    onPublish={() => {
                        setOpen(false);
                        actions.onPublish();
                    }}
                    // Share's choices end the visit too (UX-068).
                    askForReview={() => {
                        setOpen(false);
                        actions.askForReview();
                    }}
                    withdrawReview={() => {
                        setOpen(false);
                        actions.withdrawReview();
                    }}
                    onSharePreview={() => {
                        setOpen(false);
                        actions.onSharePreview();
                    }}
                    // A test release's sheets open over the editor, so
                    // the menu goes away first.
                    testRelease={
                        actions.testRelease
                            ? {
                                  ...actions.testRelease,
                                  onMake: actions.testRelease.onMake
                                      ? () => {
                                            setOpen(false);
                                            actions.testRelease?.onMake?.();
                                        }
                                      : undefined,
                                  onOpenList: () => {
                                      setOpen(false);
                                      actions.testRelease?.onOpenList();
                                  },
                              }
                            : undefined
                    }
                />
            </PopoverContent>
        </Popover>
    );
}
