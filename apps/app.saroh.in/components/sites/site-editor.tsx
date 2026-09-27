"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";
import {
    ChevronDown,
    ChevronLeft,
    Eye,
    Link2,
    Lock,
    Monitor,
    Palette,
    PanelBottom,
    PanelTop,
    Smartphone,
    Tablet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddBlockPanel } from "@/components/sites/add-block-panel";
import { AddSectionDialog } from "@/components/sites/add-section-dialog";
import { BlockFeedback } from "@/components/sites/block-feedback";
import { SECTION_ICONS } from "@/components/sites/block-icons";
import {
    BlockInspector,
    FixedBlockInspector,
} from "@/components/sites/block-inspector";
import {
    EditorTabs,
    PanelDivider,
    railRowState,
} from "@/components/sites/editor-chrome";
import type { Zoom } from "@/components/sites/editor-constants";
import {
    DEVICE_WIDTH,
    DEVICES,
    SECTION_LABELS,
    sectionTitle,
    ZOOMS,
} from "@/components/sites/editor-constants";
import { useEditorDraft } from "@/components/sites/editor/use-editor-draft";
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
import {
    heldBackSummary,
    unfinishedPhrase,
} from "@/components/sites/held-back-copy";
import { useServicesForPicker } from "@/components/sites/use-services-for-picker";

import { OptionSelect } from "@/components/shared/option-select";
import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PagesPanel } from "@/components/sites/pages-panel";
import { PrePublishCheck } from "@/components/sites/pre-publish-check";
import { ReviewPanel } from "@/components/sites/review-panel";
import { DraftPreview } from "@/components/sites/section-preview";
import { StylePanel } from "@/components/sites/style-panel";
import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { flagsByScreenPosition } from "@/lib/sites/editor-positions";
import {
    PANEL_DEFAULT,
    PANEL_MAX,
    PANEL_MIN,
    RAIL_DEFAULT,
    RAIL_MAX,
    RAIL_MIN,
} from "@/lib/sites/editor-prefs";
import type { EditorStatusTone } from "@/lib/sites/editor-status";
import { editorStatus } from "@/lib/sites/editor-status";
import { exactDate } from "@/lib/sites/format-date";
import type { SiteChangeKind } from "@/lib/sites/pending";
import type {
    ApprovalOutcome,
    ReviewState,
    Section,
    SectionType,
    SiteCommentView,
    SiteFlags,
    SiteFooter,
    SiteNavigation,
    SitePage,
} from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { resolveStyleVariables } from "@/lib/sites/style";

/**
 * The bar's verdict badge, worded per outcome. Keyed by the union so a new
 * outcome is a type error here rather than a badge that falls through to
 * "asked for changes". Only an approval takes the accent: it is the one
 * good-news verdict.
 *
 * `stale` is whether the newest approval was of a different draft than the one
 * that would go live now (#278). #193: an approval "does not survive later
 * edits to that draft" — so the badge must not keep claiming it does, and an
 * approval that no longer covers the work does not keep the accent either.
 */
const APPROVAL_BADGE: Record<
    ApprovalOutcome,
    {
        approved: (stale: boolean) => boolean;
        text: (by: string, stale: boolean) => string;
    }
> = {
    REQUESTED: {
        approved: () => false,
        text: (by) => `In review — asked by ${by}`,
    },
    APPROVED: {
        approved: (stale) => !stale,
        text: (by, stale) =>
            stale ? `Approved by ${by}, then edited` : `Approved by ${by}`,
    },
    CHANGES_REQUESTED: {
        approved: () => false,
        text: (by) => `${by} asked for changes`,
    },
    BYPASSED: {
        approved: () => false,
        text: (by) => `Published without approval by ${by}`,
    },
};

/** The status pill's colour, by what it means (#335). */
const STATUS_BADGE: Record<
    EditorStatusTone,
    "error" | "draft" | "neutral" | "success"
> = {
    danger: "error",
    attention: "draft",
    quiet: "neutral",
    done: "success",
};

/**
 * SiteEditor (S2-004) — the ticket's core deliverable. A client-side editable
 * list of sections rendered next to a LIVE `DraftPreview` that reflects local
 * state with no network round-trip (that is the "preview without publishing"
 * requirement). "Save draft" and "Publish" are the only API calls, via the
 * server actions. A dirty flag (local state vs. last-saved) gates publishing.
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
}: {
    siteId: string;
    pageId: string;
    /** Every page on this site, for the Pages tab. */
    pages: SitePage[];
    /** The site's advisory flags, as the server computed them. */
    initialFlags: SiteFlags;
    /** Reviewer notes and the latest verdict (#193). */
    initialComments: SiteCommentView[];
    initialReview: ReviewState;
    /** Never-published sites say "Publish site", not "Publish changes". */
    /**
     * Whether anything has ever been published. The INITIAL value: publishing
     * makes it false without a reload (#288), so the editor keeps this in
     * state rather than reading the prop directly.
     */
    neverPublished: boolean;
    /**
     * Keys of sections whose stored content no longer matches their contract
     * (#275). Shown, not hidden: it is the merchant's work, and a section
     * quietly missing from the list would be deleted by the next save.
     */
    unreadableSections: string[];
    /**
     * How many sections publishing would change, as the server counted it on
     * load (#190). Null before the first publish. Refreshed by every autosave.
     */
    initialPendingChanges: number | null;
    /** Site-level settings publishing would change (#282). Null before the first publish. */
    initialPendingSiteChanges: SiteChangeKind[] | null;
    initialSections: Section[];
    /** Which edit of the draft `initialSections` are (#285). */
    initialRevision: number;
    siteName: string;
    /** The site's menu, by page id; resolved here for the canvas header. */
    navigation: SiteNavigation | null;
    /** The footer, sanitized by the API, for the canvas to draw (#336). */
    footerPreview: SiteFooter | null;
    initialStyle: SiteStyle;
    styleOptions: SiteStyleOptions;
    /** Where this site lives, shown in the bar. Null before a subdomain exists. */
    address?: string | null;
}) {
    const router = useRouter();
    const {
        comments,
        review,
        openNotes,
        asking,
        refreshReview,
        askForReview,
        notedKeys,
        notesByKey,
    } = useEditorReview({ siteId, pageId, initialComments, initialReview });
    const {
        siteFlags,
        refreshFlags,
        pendingSummary,
        recordSaved,
        markStylePending,
        checking,
        setChecking,
        publishing,
        neverPublished,
        openCheck,
        onPublish,
    } = usePublish({
        siteId,
        siteName,
        address,
        initialFlags,
        initialNeverPublished,
        initialPendingChanges,
        initialPendingSiteChanges,
        refreshReview,
    });

    const initialCount = initialSections.length;
    const {
        place,
        selectedIndex,
        selectedChrome,
        rail,
        inspector,
        setSelectedIndex,
        selectChrome,
        setRail,
        setInspector,
        selectedIndexNow,
    } = useEditorSelection({ siteId, sectionCount: initialCount });

    const {
        railWidth,
        panelWidth,
        device,
        setRailWidth,
        setPanelWidth,
        nudgeRail,
        nudgePanel,
        setDevice,
        zoom,
        setZoom,
        zoomScale,
        switching,
        fullScreen,
        setFullScreen,
        canvasRef,
        onCanvasScroll,
    } = useEditorViewport({
        siteId,
        sectionCount: initialCount,
        initialScrollTop: place.scrollTop,
    });

    const {
        sections,
        dirty,
        saving,
        saveError,
        lastSavedAt,
        conflict,
        errorIndex,
        errorMessage,
        heldBack,
        onlyHeldBack,
        heldBackAt,
        sentFrom,
        replaceAt,
        insertSection,
        removeAt,
        move,
        moveTo,
        toggleHidden,
    } = useEditorDraft({
        siteId,
        pageId,
        siteName,
        initialSections,
        initialRevision,
        publishing,
        recordSaved,
        refreshFlags,
        selectedIndexNow,
    });
    const { style, setStyle, styleSaving, styleDirty, resetStyle } =
        useEditorStyle({
            siteId,
            initialStyle,
            styleOptions,
            onSaved: markStylePending,
        });

    /** The page switcher under the page name in the breadcrumb. */
    const [pagesOpen, setPagesOpen] = useState(false);

    /*
     * Drag state. `dragIndex` is the row being carried, `dropIndex` the row it
     * would land on — kept apart so the source can dim while the target draws
     * its own outline, and so an abandoned drag clears both.
     */
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    /** Feedback for the selected block, or the whole site's review. */
    const [feedbackScope, setFeedbackScope] = useState<"block" | "site">(
        "block",
    );
    /** The rail shows the Add block tab instead of this page's blocks (#337). */
    const [adding, setAdding] = useState(false);
    /** The block whose look is being chosen before it is added (#267). */
    const [lookFor, setLookFor] = useState<SectionType | null>(null);
    /** The full picker, every block drawn with previews (#267). */
    const [browsing, setBrowsing] = useState(false);
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

    /**
     * Add a block after the selected one (or at the end), select it, and
     * bring it into view (#337).
     */
    function addSection(type: SectionType, variant?: string) {
        const at = insertSection(type, variant);
        setSelectedIndex(at);
        setAdding(false);
        setInspector("block");
        // After the render that draws it.
        requestAnimationFrame(() => {
            canvasRef.current
                ?.querySelector(`[data-block-index="${at}"]`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }

    /**
     * Open the block a note is about. A note names a block by KEY, and only
     * the open page's blocks are loaded — so a note on another page is a
     * navigation first and a selection after it.
     */
    function jumpToNote(jumpPageId: string, sectionKey: string) {
        if (jumpPageId !== pageId) {
            // The same guard the Pages tab puts on opening a page: leaving
            // mid-flight loses whatever autosave has not sent yet.
            if (dirty) {
                showError("Save this page before opening another.");
                return;
            }
            router.push(`/sites/${siteId}?page=${jumpPageId}`);
            return;
        }
        const index = sections.findIndex((sec) => sec.key === sectionKey);
        if (index === -1) return;
        setRail("sections");
        setSelectedIndex(index);
    }

    const active = activeSection(selectedIndex, sections);

    /*
     * Flags for the page currently open, indexed by section. The server sends
     * flags for the whole site; the rail can only draw dots for the sections it
     * is showing.
     */
    const flagsBySection = flagsByScreenPosition(
        siteFlags.flags,
        pageId,
        sentFrom,
    );
    const activeFlags =
        active === null ? [] : (flagsBySection.get(active.index) ?? []);

    /*
     * The header the canvas draws, with the menu resolved the way publish
     * resolves it: over the pages that will be written, so an entry for a
     * hidden page is absent here exactly as it will be on the live site.
     */
    const canvasChrome = {
        name: siteName,
        navigation: (navigation?.items ?? []).flatMap((item) => {
            const page = pages.find((p) => p.id === item.pageId && !p.hidden);
            return page
                ? [{ label: item.label ?? page.title, href: page.path }]
                : [];
        }),
        // Sanitizing can leave nothing; nothing is no footer.
        footer: footerPreview?.value.trim() ? footerPreview : null,
    };

    const activePage = pages.find((page) => page.id === pageId);
    const status = editorStatus({
        // The style is saved on its own clock; unsaved or saving style is
        // unsaved work too, and the pill has to say so (#282).
        saving: saving || styleSaving,
        saveError,
        heldBackSummary: onlyHeldBack ? heldBackSummary(heldBack) : null,
        dirty: dirty || styleDirty,
        review: {
            pending: review.pending,
            outcome: review.latestApproval?.outcome ?? null,
            approvalIsStale: review.approvalIsStale,
        },
        neverPublished,
        hasPendingChanges: pendingSummary !== null,
    });
    /*
     * What the pill leaves out, for anyone who hovers it: when it last saved,
     * what publishing would change, and the reviewer's verdict in full.
     */
    const statusDetail = [
        lastSavedAt && !dirty
            ? `Saved at ${lastSavedAt.toLocaleTimeString(DISPLAY_LOCALE, { hour: "2-digit", minute: "2-digit" })}`
            : null,
        pendingSummary
            ? `${pendingSummary} changed since the last publish`
            : null,
        review.latestApproval
            ? `${APPROVAL_BADGE[review.latestApproval.outcome].text(
                  review.latestApproval.by,
                  review.approvalIsStale,
              )} · ${exactDate(review.latestApproval.at)}`
            : null,
        openNotes > 0
            ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}`
            : null,
    ]
        .filter(Boolean)
        .join("\n");

    /** The visible line beside the pill: the same facts, in one row. */
    const statusLine = [
        pendingSummary ? `${pendingSummary} changed` : null,
        review.latestApproval
            ? APPROVAL_BADGE[review.latestApproval.outcome].text(
                  review.latestApproval.by,
                  review.approvalIsStale,
              )
            : null,
        openNotes > 0
            ? `${openNotes} open ${openNotes === 1 ? "note" : "notes"}`
            : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        /*
         * The editor follows the workspace's theme (#335), and the bar has a
         * toggle for it. It used to force dark; the design gives the merchant
         * the choice, and the page on the canvas is bright either way.
         */
        <div className="flex h-screen flex-col bg-background text-foreground">
            {/*
             * ONE line, and it has to stay one line: the actions never
             * shrink, the breadcrumb truncates instead. Losing the end of a
             * page name is a smaller loss than losing Publish.
             */}
            <header className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b px-4">
                <nav
                    aria-label="Breadcrumb"
                    className="flex min-w-0 items-center gap-2 text-sm"
                >
                    <Link
                        href={`/sites/${siteId}/pages`}
                        title={address ?? undefined}
                        className="flex min-w-0 shrink items-center gap-1 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <ChevronLeft aria-hidden className="size-4 shrink-0" />
                        <span className="truncate">{siteName}</span>
                    </Link>
                    <span aria-hidden className="text-muted-foreground">
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
                                aria-label={`Page: ${activePage?.title ?? "Page"}. Switch or manage pages`}
                                className="flex min-w-0 items-center gap-1 rounded font-semibold transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span className="truncate">
                                    {activePage?.title ?? "Page"}
                                </span>
                                <ChevronDown
                                    aria-hidden
                                    className="size-4 shrink-0 text-muted-foreground"
                                />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="start"
                            className="max-h-[70vh] w-80 overflow-y-auto p-0"
                        >
                            <PagesPanel
                                siteId={siteId}
                                pages={pages}
                                activePageId={pageId}
                                dirty={dirty}
                                unfinished={
                                    onlyHeldBack
                                        ? unfinishedPhrase(heldBack)
                                        : undefined
                                }
                            />
                        </PopoverContent>
                    </Popover>
                    <span aria-hidden className="text-muted-foreground">
                        /
                    </span>
                    <Badge
                        role="status"
                        variant={STATUS_BADGE[status.tone]}
                        title={statusDetail || undefined}
                        className="shrink-0 whitespace-nowrap uppercase tracking-[0.06em]"
                    >
                        {status.label}
                    </Badge>
                    {/*
                     * What the pill sums up, said in the bar as it was
                     * before the redesign: what publishing would change,
                     * the reviewer's verdict and how many notes are open.
                     * It truncates rather than wraps — Publish never moves.
                     */}
                    {statusLine ? (
                        <span
                            className="min-w-0 truncate text-xs text-muted-foreground"
                            title={statusDetail}
                        >
                            {statusLine}
                        </span>
                    ) : null}
                </nav>

                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <ThemeToggle />
                    {/*
                     * Width only — the preview is already local, and
                     * switching must not become a re-fetch.
                     */}
                    <div
                        role="group"
                        aria-label="Preview width"
                        className="flex h-8 items-center gap-0.5 rounded-md border p-0.5"
                    >
                        {DEVICES.map((d) => {
                            const Icon =
                                d.key === "phone"
                                    ? Smartphone
                                    : d.key === "tablet"
                                      ? Tablet
                                      : Monitor;
                            return (
                                <button
                                    key={d.key}
                                    type="button"
                                    onClick={() => setDevice(d.key)}
                                    aria-pressed={device === d.key}
                                    aria-label={`Show at ${d.label.toLowerCase()} width`}
                                    title={d.label}
                                    className={cn(
                                        "flex h-full w-8 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                        device === d.key
                                            ? "bg-secondary text-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    <Icon aria-hidden className="size-4" />
                                </button>
                            );
                        })}
                    </div>

                    {/*
                     * The zoom readout IS the control (spec §2): no ⌘scroll,
                     * no pinch, no shortcut.
                     */}
                    <OptionSelect
                        aria-label="Zoom"
                        size="sm"
                        value={String(zoom)}
                        onValueChange={(v) => {
                            setZoom(v === "fit" ? "fit" : (Number(v) as Zoom));
                        }}
                        options={ZOOMS.map((z) => ({
                            value: String(z),
                            label: z === "fit" ? "Fit" : `${z}%`,
                        }))}
                        className="h-8 w-[4.75rem] tabular-nums text-muted-foreground"
                    />

                    {/*
                     * Preview removes the editing chrome; it does not switch
                     * to another renderer. Escape returns.
                     */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => setFullScreen(true)}
                    >
                        <Eye aria-hidden className="size-4" />
                        Preview
                    </Button>

                    <Button
                        variant={rail === "style" ? "secondary" : "outline"}
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() =>
                            setRail(rail === "style" ? "sections" : "style")
                        }
                        aria-pressed={rail === "style"}
                    >
                        <Palette aria-hidden className="size-4" />
                        Style
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        disabled={asking || review.pending}
                        onClick={() => void askForReview()}
                    >
                        <Link2 aria-hidden className="size-4" />
                        {review.pending ? "In review" : "Share for review"}
                    </Button>

                    {/*
                     * The one action that puts the site in front of the
                     * public. Not disabled while In review: publishing then
                     * is allowed and recorded as a bypass (#278).
                     */}
                    <Button
                        size="sm"
                        className="wk-press h-8"
                        title="Make these changes live"
                        onClick={() =>
                            void openCheck({ dirty, onlyHeldBack, heldBack })
                        }
                        disabled={publishing || dirty || saving || styleDirty}
                    >
                        {publishing
                            ? "Publishing…"
                            : neverPublished
                              ? "Publish site"
                              : "Publish"}
                        {/*
                         * The outstanding flag count as a badge, so the
                         * button keeps its width while the number moves.
                         */}
                        {!publishing && siteFlags.flags.length > 0 ? (
                            <span className="ml-1.5 rounded bg-background/20 px-1.5 py-0.5 text-[0.6875rem] tabular-nums leading-none">
                                {siteFlags.flags.length}
                            </span>
                        ) : null}
                    </Button>
                </div>
            </header>

            <div
                className="grid min-h-0 flex-1 lg:grid-cols-[var(--editor-cols)]"
                style={
                    {
                        // Blocks, the page, the inspector (#340); see
                        // `editorColumns` for how the widths are shared.
                        "--editor-cols": editorColumns(railWidth, panelWidth),
                    } as React.CSSProperties
                }
            >
                {/*
                 * Left: this page's blocks, in order (#340). The fields are on
                 * the right now, so this column is only ever a list — the
                 * page as the merchant reads it, top to bottom.
                 */}
                <aside className="flex min-h-0 flex-col">
                    {rail === "style" ? (
                        <StylePanel
                            style={style}
                            options={styleOptions}
                            onChange={setStyle}
                            onReset={resetStyle}
                            onBack={() => setRail("sections")}
                            saving={styleSaving}
                        />
                    ) : (
                        <>
                            <EditorTabs
                                label="Page"
                                tabs={[
                                    { key: "sections", label: "This page" },
                                    { key: "add", label: "Add block" },
                                ]}
                                value={adding ? "add" : "sections"}
                                onSelect={(tab) => setAdding(tab === "add")}
                            />
                            {adding ? (
                                <AddBlockPanel
                                    onBrowse={() => setBrowsing(true)}
                                    onPick={(type, looks) => {
                                        if (looks > 1) setLookFor(type);
                                        else addSection(type);
                                    }}
                                />
                            ) : (
                                <>
                                    <p className="px-4 pb-1 pt-4 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                        {`${sections.length + 2} blocks`}
                                    </p>
                                    <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pl-4">
                                        <FixedBlockRow
                                            part="header"
                                            selected={
                                                selectedChrome === "header"
                                            }
                                            onSelect={() =>
                                                selectChrome("header")
                                            }
                                        />
                                        {sections.map((section, index) => (
                                            <li
                                                key={index}
                                                /*
                                                 * The row is the drop target, not the
                                                 * handle: aiming at a 32px row is far
                                                 * easier than aiming at the grip, and
                                                 * the grip is what starts the drag.
                                                 */
                                                onDragOver={(e) => {
                                                    if (dragIndex === null)
                                                        return;
                                                    e.preventDefault();
                                                    setDropIndex(index);
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    if (dragIndex === null)
                                                        return;
                                                    moveTo(dragIndex, index);
                                                    setSelectedIndex(index);
                                                    setDragIndex(null);
                                                    setDropIndex(null);
                                                }}
                                                className={cn(
                                                    "rounded",
                                                    dropIndex === index &&
                                                        dragIndex !== index &&
                                                        "ring-1 ring-inset ring-ring",
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        // A row is not a button and must not
                                                        // scale — at 32px tall a shrink reads
                                                        // as a jitter. It answers a press with
                                                        // the surface it would settle on, so
                                                        // the feedback is the outcome arriving
                                                        // early rather than a separate effect.
                                                        "group relative flex h-10 w-full items-center gap-1 rounded-md pr-2 text-left text-[0.8125rem] transition-colors",
                                                        /*
                                                         * The selected row carries a bar
                                                         * on its edge as well as a fill,
                                                         * as the design draws it: the
                                                         * fill alone is too quiet on the
                                                         * dark chrome.
                                                         */
                                                        railRowState(
                                                            selectedIndex ===
                                                                index,
                                                        ),
                                                        (errorIndex === index ||
                                                            heldBackAt(
                                                                index,
                                                            )) &&
                                                            "text-destructive",
                                                        dragIndex === index &&
                                                            "opacity-40",
                                                    )}
                                                >
                                                    {/*
                                                     * The grip is the drag surface. It
                                                     * carries no click of its own — a
                                                     * handle that also navigates makes
                                                     * every aborted drag a selection.
                                                     */}
                                                    <span
                                                        draggable
                                                        onDragStart={() => {
                                                            setDragIndex(index);
                                                            setDropIndex(index);
                                                        }}
                                                        onDragEnd={() => {
                                                            setDragIndex(null);
                                                            setDropIndex(null);
                                                        }}
                                                        aria-hidden="true"
                                                        className="cursor-grab select-none px-1 text-muted-foreground active:cursor-grabbing group-hover:text-muted-foreground"
                                                    >
                                                        ⋮
                                                    </span>
                                                    <button
                                                        type="button"
                                                        aria-current={
                                                            selectedIndex ===
                                                            index
                                                                ? "true"
                                                                : undefined
                                                        }
                                                        title={
                                                            SECTION_LABELS[
                                                                section.type
                                                            ]
                                                        }
                                                        onClick={() =>
                                                            setSelectedIndex(
                                                                index,
                                                            )
                                                        }
                                                        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                                                    >
                                                        <span className="flex min-w-0 items-center gap-2.5">
                                                            {(() => {
                                                                const Icon =
                                                                    SECTION_ICONS[
                                                                        section
                                                                            .type
                                                                    ];
                                                                return (
                                                                    <Icon
                                                                        aria-hidden="true"
                                                                        className="size-4 shrink-0 text-muted-foreground"
                                                                    />
                                                                );
                                                            })()}
                                                            <span
                                                                className={cn(
                                                                    "truncate",
                                                                    /*
                                                                     * A hidden block is
                                                                     * dimmed rather than
                                                                     * removed: it is still
                                                                     * part of the page the
                                                                     * merchant is building,
                                                                     * just not part of the
                                                                     * one visitors get.
                                                                     */
                                                                    section.hidden &&
                                                                        "text-muted-foreground line-through",
                                                                )}
                                                            >
                                                                {sectionTitle(
                                                                    section,
                                                                )}
                                                            </span>
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-1.5">
                                                            {/*
                                                             * The spec's flag dot: 4px,
                                                             * amber #c99f6f (§7). It is
                                                             * the ONLY thing flags draw
                                                             * while editing — "quiet
                                                             * until publish" — so it
                                                             * carries a title rather
                                                             * than expanding into the
                                                             * row.
                                                             */}
                                                            {(flagsBySection.get(
                                                                index,
                                                            )?.length ?? 0) >
                                                                0 ||
                                                            (section.key !==
                                                                undefined &&
                                                                notedKeys.has(
                                                                    section.key,
                                                                )) ? (
                                                                <span
                                                                    className="size-1 shrink-0 rounded-full bg-highlight"
                                                                    title={[
                                                                        ...(flagsBySection
                                                                            .get(
                                                                                index,
                                                                            )
                                                                            ?.map(
                                                                                (
                                                                                    f,
                                                                                ) =>
                                                                                    f.message,
                                                                            ) ??
                                                                            []),
                                                                        ...(section.key !==
                                                                            undefined &&
                                                                        notedKeys.has(
                                                                            section.key,
                                                                        )
                                                                            ? [
                                                                                  "A reviewer has left a note on this section.",
                                                                              ]
                                                                            : []),
                                                                    ].join(
                                                                        "\n",
                                                                    )}
                                                                />
                                                            ) : null}
                                                        </span>
                                                    </button>
                                                </div>
                                            </li>
                                        ))}
                                        {sections.length === 0 ? (
                                            <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                                                No blocks yet.
                                            </li>
                                        ) : null}
                                        <FixedBlockRow
                                            part="footer"
                                            selected={
                                                selectedChrome === "footer"
                                            }
                                            onSelect={() =>
                                                selectChrome("footer")
                                            }
                                        />
                                    </ul>
                                    <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
                                        Header and footer carry a lock — they
                                        are on every page, so this page cannot
                                        remove them.
                                    </p>
                                </>
                            )}
                        </>
                    )}
                </aside>

                <PanelDivider
                    label="Resize the block list"
                    width={railWidth}
                    min={RAIL_MIN}
                    max={RAIL_MAX}
                    reset={RAIL_DEFAULT}
                    onResize={setRailWidth}
                    onNudge={nudgeRail}
                />

                {/*
                 * Preview — width changes, data does not.
                 *
                 * The canvas ground is the SAME #0b0b0b as the chrome (spec §7),
                 * not a lighter tray. A raised panel here would make the canvas
                 * a second bright object competing with the one that matters:
                 * the rendered site.
                 */}
                <div
                    ref={canvasRef}
                    onScroll={onCanvasScroll}
                    className="min-h-0 overflow-y-auto bg-background p-6"
                >
                    {/*
                     * Someone else saved this page while this editor was open
                     * (#285). Loud, because everything typed since is now
                     * unsaveable — and the merchant has to choose what happens
                     * to it. Reloading takes the other version and drops this
                     * one, so it is offered, never done automatically.
                     */}
                    {conflict ? (
                        <div
                            role="alert"
                            className="mx-auto mb-4 max-w-xl rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm"
                        >
                            <p className="font-medium">
                                Someone else saved this page while you were
                                editing.
                            </p>
                            <p className="mt-1 text-muted-foreground">
                                Nothing you have written has been lost, and
                                nothing more will save until you reload.
                                Reloading shows their version and discards
                                yours, so copy anything you want to keep first.
                            </p>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="mt-3"
                                onClick={() => window.location.reload()}
                            >
                                Reload the latest
                            </Button>
                        </div>
                    ) : null}

                    {/*
                     * The first-run nudge (spec §5), in the spec's own words.
                     * "It does not nag" — so it is one quiet line above the
                     * preview, shown only until the site has been published
                     * once, and it never reappears afterwards.
                     */}
                    {neverPublished ? (
                        <p
                            className="mx-auto mb-4 text-center text-xs text-muted-foreground"
                            style={{ maxWidth: DEVICE_WIDTH[device] }}
                        >
                            Nothing&rsquo;s live yet — publish when you&rsquo;re
                            ready, nobody can see this in the meantime.
                        </p>
                    ) : null}
                    <div
                        /*
                         * "Switching frames cross-fades and resizes — the frame
                         * animates to the new width, content reflows during
                         * it." The width transition does the resize; the brief
                         * dip in opacity is the cross-fade, and it is what stops
                         * a reflow mid-animation reading as a glitch.
                         *
                         * This animates `max-width`, which is a LAYOUT property
                         * and so breaks the usual transform/opacity-only rule,
                         * deliberately. The whole point of a device preview is
                         * showing how the site reflows at that width; a
                         * transform would scale the content instead of
                         * reflowing it, which is the one thing this control
                         * exists to show. So the reflow is the work, not an
                         * accident of implementation.
                         *
                         * What that buys is a duty to keep it short: 200ms
                         * rather than the 300 it was, because every frame here
                         * costs a layout pass over the whole rendered site.
                         */
                        className={`mx-auto transition-[max-width,opacity,transform] duration-slow ease-out motion-reduce:transition-none ${
                            switching ? "opacity-70" : "opacity-100"
                        }`}
                        style={{
                            maxWidth: DEVICE_WIDTH[device],
                            transform: `scale(${zoomScale})`,
                            transformOrigin: "top center",
                        }}
                    >
                        {/*
                         * The page sits in a window whose bar names the
                         * address it lives at (#340): this is the merchant's
                         * website, not a mock-up of one, and the bar says
                         * where a customer would find it.
                         */}
                        <div className="overflow-hidden rounded-lg border shadow-xl shadow-black/10 dark:shadow-black/40">
                            <div className="flex h-9 items-center gap-3 border-b bg-muted px-3">
                                <span
                                    aria-hidden="true"
                                    className="flex gap-1.5"
                                >
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                    <span className="size-2 rounded-full bg-foreground/15" />
                                </span>
                                <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                                    {address
                                        ? `${address}/`
                                        : "Not published yet"}
                                </span>
                                {address ? (
                                    <span className="ml-auto hidden shrink-0 text-[0.6875rem] text-muted-foreground xl:inline">
                                        ⌘-click a link to open it on your site
                                    </span>
                                ) : null}
                            </div>
                            <DraftPreview
                                siteAddress={address}
                                sections={sections}
                                pages={pages}
                                style={style}
                                styleOptions={styleOptions}
                                selectedIndex={selectedIndex}
                                onSelect={(index) => {
                                    setRail("sections");
                                    setSelectedIndex(index);
                                }}
                                chrome={canvasChrome}
                                selectedChrome={selectedChrome}
                                onSelectChrome={selectChrome}
                                notesByKey={notesByKey}
                                onOpenNotes={(index) => {
                                    setSelectedIndex(index);
                                    setInspector("feedback");
                                }}
                            />
                        </div>
                    </div>
                </div>

                <PanelDivider
                    label="Resize the inspector"
                    width={panelWidth}
                    min={PANEL_MIN}
                    max={PANEL_MAX}
                    reset={PANEL_DEFAULT}
                    onResize={setPanelWidth}
                    onNudge={nudgePanel}
                    panelSide="right"
                />

                {/*
                 * Right: the inspector (#340). Block is what can be changed
                 * about the selected block; Feedback is what reviewers have
                 * said. Both answer questions about the thing selected on the
                 * page, which is why they sit beside it rather than under the
                 * list.
                 */}
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
                                          : (notesByKey.get(
                                                active.section.key,
                                            ) ?? 0),
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
                                    <ToggleGroupItem
                                        value="block"
                                        className={SEGMENT}
                                    >
                                        This block
                                    </ToggleGroupItem>
                                    <ToggleGroupItem
                                        value="site"
                                        className={SEGMENT}
                                    >
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
                                hasFooter={canvasChrome.footer !== null}
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
                                    unreadableSections.includes(
                                        active.section.key,
                                    )
                                }
                                error={
                                    active !== null &&
                                    errorIndex === active.index
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
            </div>

            {/*
             * The pre-publish check. Rendered inside the editor rather than
             * on its own route so nothing is torn down and rebuilt behind
             * it — the merchant goes back to exactly the editing state they
             * left, including unsaved selection and scroll.
             */}
            {/*
             * Full-screen preview: "hides everything; Escape returns". The
             * frame keeps its device width, so this is the site at the size
             * being designed for with nothing else on screen — not a
             * maximised editor.
             */}
            {fullScreen ? (
                <div className="fixed inset-0 z-40 overflow-y-auto bg-background p-6">
                    <button
                        type="button"
                        onClick={() => setFullScreen(false)}
                        className="fixed right-4 top-4 z-10 rounded border bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                    >
                        Escape to return
                    </button>
                    <div
                        className="mx-auto transition-[max-width] duration-slow ease-out motion-reduce:transition-none"
                        style={{ maxWidth: DEVICE_WIDTH[device] }}
                    >
                        <DraftPreview
                            siteAddress={address}
                            sections={sections}
                            pages={pages}
                            style={style}
                            styleOptions={styleOptions}
                            chrome={canvasChrome}
                        />
                    </div>
                </div>
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

            {checking ? (
                <PrePublishCheck
                    siteName={siteName}
                    pages={pages}
                    flags={siteFlags.flags}
                    awaitingNavigation={siteFlags.awaitingNavigation}
                    publishing={publishing}
                    neverPublished={neverPublished}
                    review={review}
                    onPublish={() => void onPublish()}
                    onClose={() => setChecking(false)}
                    onJump={(jumpPageId, sectionIndex) => {
                        setChecking(false);
                        /*
                         * A flag on another page needs that page loaded, which
                         * is a navigation. One on this page is just a
                         * selection — doing it without a round trip keeps the
                         * jump instant where it can be.
                         */
                        if (jumpPageId !== null && jumpPageId !== pageId) {
                            router.push(`/sites/${siteId}?page=${jumpPageId}`);
                            return;
                        }
                        if (sectionIndex !== null) {
                            setRail("sections");
                            setSelectedIndex(sectionIndex);
                            // The flag is about the block's fields.
                            setInspector("block");
                        }
                    }}
                />
            ) : null}
        </div>
    );
}

/** Per-type field editor. Narrowing on `section.type` gives the exact shape. */

/**
 * The header or footer in the block list (#336): on every page, so it is
 * listed where it sits — first and last — with a lock instead of a grip. It
 * can be selected, never dragged.
 */
function FixedBlockRow({
    part,
    selected,
    onSelect,
}: {
    part: "header" | "footer";
    selected: boolean;
    onSelect: () => void;
}) {
    const Icon = part === "header" ? PanelTop : PanelBottom;
    const label = part === "header" ? "Header" : "Footer";
    return (
        <li>
            <button
                type="button"
                onClick={onSelect}
                aria-current={selected ? "true" : undefined}
                className={cn(
                    "relative flex h-10 w-full items-center gap-2.5 rounded-md pl-5 pr-2 text-left text-[0.8125rem] transition-colors",
                    railRowState(selected),
                )}
            >
                <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="flex-1 truncate">{label}</span>
                <Lock
                    aria-label="On every page"
                    className="size-3.5 shrink-0 text-muted-foreground"
                />
            </button>
        </li>
    );
}
