"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    ChevronDown,
    ChevronLeft,
    Eye,
    Link2,
    Monitor,
    Smartphone,
    Tablet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import type { Device, Zoom } from "@/components/sites/editor-constants";
import { DEVICES, ZOOMS } from "@/components/sites/editor-constants";
import {
    publishTitle,
    STATUS_BADGE,
    statusReadout,
} from "@/components/sites/editor/status-readout";
import type { DraftReadiness } from "@/components/sites/editor/use-publish";
import { unfinishedPhrase } from "@/components/sites/held-back-copy";
import { PagesPanel } from "@/components/sites/pages-panel";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import type { ReviewState, SiteFlags, SitePage } from "@/lib/sites/service";

/**
 * The editor's top bar: where you are (Website, site, page, status), how the
 * page is shown (theme, width, zoom, full-screen preview), and the two ways
 * work leaves the editor (Share for review, Publish). Moved out of
 * `site-editor.tsx` (#260), then laid out as Saroh Site Editor.dc.html draws
 * it (G2): the status is true after a reload, Publish says what it puts
 * live, and Style moved to the rail's Brand tab.
 *
 * ONE line, and it has to stay one line: the actions never shrink, the
 * breadcrumb truncates instead. Losing the end of a page name is a smaller
 * loss than losing Publish.
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
    setFullScreen,
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
    setFullScreen: (open: boolean) => void;
}) {
    /** The page switcher under the page name in the breadcrumb. */
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
    });
    const publishHint = publishTitle({
        publishing,
        dirty: dirty || saving || styleDirty,
        onlyHeldBack,
        heldBack,
        neverPublished,
        pendingShort,
        pendingKnown,
    });

    return (
        <header className="flex h-[52px] shrink-0 items-center gap-3 overflow-hidden border-b px-3.5">
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
                    className="flex shrink-0 items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[0.78125rem] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronLeft aria-hidden className="size-[15px] shrink-0" />
                    Website
                </Link>
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
                            aria-label={`Page: ${activePage?.title ?? "Page"}. Switch or manage pages`}
                            className="flex h-[30px] min-w-0 shrink-0 items-center gap-[7px] rounded-lg border bg-card pl-[11px] pr-[9px] text-[0.84375rem] font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                {/*
                 * "Published", "Not published · 2 blocks, footer" or "Not
                 * published yet" (G2), worked out from the server's count
                 * so it is the same after a reload. It may truncate — the
                 * full words are in its title and in Publish's — but it
                 * never pushes Publish off the bar.
                 */}
                <Badge
                    role="status"
                    variant={STATUS_BADGE[status.tone]}
                    title={
                        [status.label, statusDetail]
                            .filter(Boolean)
                            .join("\n") || undefined
                    }
                    className="ml-1 min-w-0 shrink truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.04em]"
                >
                    <span className="truncate">{status.label}</span>
                </Badge>
                {/*
                 * What the pill leaves out: the reviewer's verdict, how many
                 * notes are open, and what publishing would change when a
                 * review outranks it in the pill. It truncates rather than
                 * wraps — Publish never moves.
                 */}
                {statusLine ? (
                    <span
                        className="ml-1 min-w-0 truncate text-[0.71875rem] text-muted-foreground"
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
                    className="h-[34px] gap-[7px] rounded-[9px] px-3 text-[0.78125rem] font-semibold text-muted-foreground"
                    onClick={() => setFullScreen(true)}
                >
                    <Eye aria-hidden className="size-[15px]" />
                    Preview
                </Button>

                {/*
                 * Style is the rail's Brand tab now (G2), as the design
                 * draws it, so the bar no longer carries a button for it.
                 */}
                <Button
                    variant="outline"
                    size="sm"
                    className="h-[34px] gap-[7px] rounded-[9px] px-3 text-[0.78125rem] font-semibold text-muted-foreground"
                    disabled={asking || review.pending}
                    onClick={() => void askForReview()}
                >
                    <Link2 aria-hidden className="size-[15px]" />
                    {review.pending ? "In review" : "Share for review"}
                </Button>

                {/*
                 * The one action that puts the site in front of the
                 * public. Not disabled while In review: publishing then
                 * is allowed and recorded as a bypass (#278, DEC-047).
                 * Its title says what it puts live (G2). Unlike the
                 * design it stays pressable when nothing has changed:
                 * publishing again is how a new version is made.
                 */}
                <Button
                    size="sm"
                    className="wk-press h-[34px] rounded-[9px] px-3.5 text-[0.78125rem] font-semibold"
                    title={publishHint}
                    onClick={() =>
                        void openCheck({ dirty, onlyHeldBack, heldBack })
                    }
                    disabled={publishing || dirty || saving || styleDirty}
                >
                    {publishing ? "Publishing…" : "Publish"}
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
    );
}
