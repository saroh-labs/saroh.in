"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { ChevronDown, ChevronLeft, Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import type { HeldBackSection } from "@/components/sites/blocks/saveable-sections";
import type {
    TestReleaseActions,
    TopBarActionProps,
} from "@/components/sites/editor/top-bar-actions";
import { TopBarActions } from "@/components/sites/editor/top-bar-actions";
import type {
    EditorLayout,
    EditorSheet as SheetName,
} from "@/components/sites/editor/use-editor-layout";
import { PageSheet } from "@/components/sites/pages-area/page-sheet";
import { PagesPanel } from "@/components/sites/pages/pages-panel";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import {
    publishTitle,
    STATUS_BADGE,
    statusReadout,
} from "@/components/sites/publish/status-readout";
import type { DraftReadiness } from "@/components/sites/publish/use-publish";
import type { EditorStatus } from "@/lib/sites/editor-status";
import { unseenBecause } from "@/lib/sites/page-menu";
import type {
    ModulePageKind,
    ReviewState,
    SiteFlags,
    SitePage,
} from "@/lib/sites/service";
import { readerSiteState } from "@/lib/sites/site-state";
import { websiteAreaOn } from "@/lib/sites/website-area-switch";
import { Tip } from "@saroh/ui/tooltip";
import type { Device, Zoom } from "./editor-constants";
import { PhoneTopBar } from "./phone/phone-top-bar";
import { useEditorReadOnly } from "./read-only";

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
 * the bar, as the design's bar does. A phone (DEC-185) keeps ← Website, the
 * page (its sheet), the status, ⋯ More (a sheet of the rest) and Publish.
 */
export interface EditorTopBarProps {
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
    /** When the site last went live, for a Reviewer's status (U6). */
    publishedAt?: string | null;
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
    /** A phone's open sheet: its Pages and ⋯ More are drawn here. */
    sheet?: SheetName;
    setSheet?: (next: SheetName) => void;
    /** The editor's body, where a phone's sheets are laid. */
    sheetHost?: HTMLElement | null;
    /**
     * The page settings sheet's open page, held by the editor so More and
     * the shell can open it (U46); absent, the bar holds its own.
     */
    pageSettings?: { id: string | null; set: (id: string | null) => void };
    /** A Reviewer's verdict (DEC-200): the bar's buttons on a desk, the Review sheet's body on a phone. */
    reviewerVerdict?: ReactNode;
}

/**
 * What the desk bar, the phone bar and the new shell's bar (U46) all work
 * out from the same props: the status, the actions, the page settings sheet.
 */
export function useEditorBar({
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
    publishedAt = null,
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
    needsApproval = false,
    canOverride = false,
    scheduled = null,
    testRelease,
    pageSettings,
}: EditorTopBarProps) {
    const zone = useBusinessZone();
    const readOnly = useEditorReadOnly();
    /** The page switcher under the page name in the breadcrumb. */
    const [pagesOpen, setPagesOpen] = useState(false);
    const router = useRouter();
    // With the Website area on, the page menu opens the one page settings
    // sheet, the same as Website › Pages (U5); off, it draws its own.
    const [ownSettingsFor, setOwnSettingsFor] = useState<string | null>(null);
    const settingsFor = pageSettings ? pageSettings.id : ownSettingsFor;
    const setSettingsFor = pageSettings ? pageSettings.set : setOwnSettingsFor;
    const onPageSettings = websiteAreaOn()
        ? (page: SitePage) => setSettingsFor(page.id)
        : undefined;
    const pageSheet = (
        <PageSheet
            siteId={siteId}
            page={pages.find((p) => p.id === settingsFor) ?? null}
            host={address ?? null}
            siteName={siteName}
            live={!neverPublished}
            canUpdate={canUpdateSite}
            unseen={
                settingsFor ? unseenBecause(settingsFor, siteFlags.flags) : null
            }
            onClose={() => setSettingsFor(null)}
            onSaved={() => router.refresh()}
            onDeleted={(page) => {
                setSettingsFor(null);
                if (page.id === pageId) router.push(`/sites/${siteId}`);
                router.refresh();
            }}
        />
    );

    const activePage = pages.find((page) => page.id === pageId);
    const ownerReadout = statusReadout({
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
    // A Reviewer reads live-and-since-when, never pending changes (U6).
    const reader = readerSiteState(
        {
            currentPublicationId: neverPublished ? null : "live",
            currentPublication: publishedAt ? { publishedAt } : null,
        },
        zone,
    );
    const {
        status,
        detail: statusDetail,
        line: statusLine,
    } = readOnly
        ? {
              status: {
                  label: reader.label,
                  tone:
                      reader.tone === "live"
                          ? ("done" as const)
                          : ("quiet" as const),
              },
              detail: "",
              line: "",
          }
        : ownerReadout;
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

    return {
        readOnly,
        activePage,
        status,
        readout,
        actions,
        phone,
        pagesOpen,
        setPagesOpen,
        pageSheet,
        onPageSettings,
        openPageSettings: (pageId: string) => setSettingsFor(pageId),
    };
}

/**
 * The editor's top bar: where you are (Website, site, page, status), how the
 * page is shown (theme, width, zoom, Preview), and the two ways
 * work leaves the editor (Share, Publish). With the Website area on, the
 * desk draws the shell's trimmed bar instead (`shell/desk-top-bar.tsx`, U46);
 * a phone's bar is `phone/phone-top-bar.tsx`.
 */
export function EditorTopBar(props: EditorTopBarProps) {
    const bar = useEditorBar(props);
    const {
        siteId,
        siteName,
        address,
        pages,
        pageId,
        dirty,
        saving,
        onlyHeldBack,
        heldBack,
        styleDirty,
        siteFlags,
        layout,
        canUpdateSite,
        addablePageKinds,
        reviewerVerdict,
    } = props;
    const {
        readOnly,
        activePage,
        readout,
        actions,
        pagesOpen,
        setPagesOpen,
        pageSheet,
        onPageSettings,
    } = bar;
    if (bar.phone) return <PhoneTopBar {...props} bar={bar} />;

    return (
        <>
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
                    <Tip label={address ?? undefined}>
                        <Link
                            href={`/sites/${siteId}/pages`}
                            aria-label="Back to Website"
                            className="flex shrink-0 items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[0.78125rem] text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                        >
                            <ChevronLeft
                                aria-hidden
                                className="size-[15px] shrink-0"
                            />
                            Website
                        </Link>
                    </Tip>
                    <span
                        aria-hidden
                        className="px-px text-[0.9375rem] text-muted-foreground/70"
                    >
                        /
                    </span>
                    <span className="min-w-0 truncate text-[0.84375rem] font-medium text-muted-foreground">
                        {siteName}
                    </span>
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
                                    "flex h-[30px] min-w-0 shrink-0 cursor-pointer items-center gap-[7px] rounded-lg border bg-card pl-[11px] pr-[9px] text-[0.84375rem] font-semibold text-foreground transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted data-[state=open]:bg-secondary coarse:h-11",
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
                                onPageSettings={onPageSettings}
                            />
                        </PopoverContent>
                    </Popover>
                    {readout}
                    {readOnly ? (
                        <Badge
                            variant="info"
                            size="sm"
                            data-reviewing=""
                            className="ml-1 shrink-0 gap-1.5"
                        >
                            <Eye aria-hidden className="size-3" />
                            Reviewing · you can&rsquo;t change anything
                        </Badge>
                    ) : null}
                </nav>

                <TopBarActions
                    {...actions}
                    verdict={reviewerVerdict}
                    // Tablet width (UX-035): the secondary actions fold into
                    // "More" so Publish never runs off the bar.
                    compact={layout === "narrow"}
                />
            </header>
            {pageSheet}
        </>
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
                size="sm"
                className="ml-1 min-w-0 shrink truncate"
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
