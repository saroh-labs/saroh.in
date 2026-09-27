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
    Palette,
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
    STATUS_BADGE,
    statusReadout,
} from "@/components/sites/editor/status-readout";
import type { EditorRailTab } from "@/components/sites/editor/use-editor-selection";
import type { DraftReadiness } from "@/components/sites/editor/use-publish";
import { unfinishedPhrase } from "@/components/sites/held-back-copy";
import { PagesPanel } from "@/components/sites/pages-panel";
import type { HeldBackSection } from "@/components/sites/saveable-sections";
import type { ReviewState, SiteFlags, SitePage } from "@/lib/sites/service";

/**
 * The editor's top bar: where you are (site, page, status), how the page is
 * shown (theme, width, zoom, full-screen preview, Style), and the two ways
 * work leaves the editor (Share for review, Publish). Moved out of
 * `site-editor.tsx` unchanged (#260).
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
    publishing,
    siteFlags,
    openCheck,
    device,
    setDevice,
    zoom,
    setZoom,
    setFullScreen,
    rail,
    setRail,
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
    publishing: boolean;
    siteFlags: SiteFlags;
    openCheck: (draft: DraftReadiness) => Promise<void>;
    device: Device;
    setDevice: (next: Device) => void;
    zoom: Zoom;
    setZoom: (next: Zoom) => void;
    setFullScreen: (open: boolean) => void;
    rail: EditorRailTab;
    setRail: (next: EditorRailTab) => void;
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
        lastSavedAt,
        openNotes,
    });

    return (
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
    );
}
