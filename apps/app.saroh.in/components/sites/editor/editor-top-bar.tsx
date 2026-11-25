"use client";

import { Badge } from "@saroh/ui/badge";
import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { ChevronDown, ChevronLeft, Eye } from "lucide-react";

import { TopBarActions } from "@/components/sites/editor/top-bar-actions";
import { PagesPanel } from "@/components/sites/pages/pages-panel";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";
import { Tip } from "@saroh/ui/tooltip";
import type { EditorTopBarProps } from "./editor-bar";
import { useEditorBar } from "./editor-bar";
import { PhoneTopBar } from "./phone/phone-top-bar";

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
                        <IntentLink
                            href={`/sites/${siteId}/pages`}
                            aria-label="Back to Website"
                            className="flex shrink-0 items-center gap-[7px] rounded-lg px-[9px] py-1.5 text-[0.78125rem] text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                        >
                            <ChevronLeft
                                aria-hidden
                                className="size-[15px] shrink-0"
                            />
                            Website
                        </IntentLink>
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
