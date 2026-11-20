"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import {
    ChevronDown,
    ChevronLeft,
    Eye,
    Lock,
    Sparkles,
    Undo2,
} from "lucide-react";
import Link from "next/link";

import { openAskAi } from "@/components/ask-ai/open";
import { PagesPanel } from "@/components/sites/pages/pages-panel";
import { unfinishedPhrase } from "@/components/sites/publish/held-back-copy";

import type { EditorTopBarProps } from "../editor-bar";
import { useEditorBar } from "../editor-bar";
import { PublishButton } from "../top-bar-actions";
import type { EditorModel } from "./editor-model";
import { MoreMenu } from "./more-menu";

/**
 * The desk's top bar with the Website area on (`fix/WXKRest`, RULES §3):
 * ← Website · the page picker (page over site) · Undo · Ask AI · the
 * status chip (opens Publish) · Preview · ⋯ More · Publish, the one black
 * button. Everything else the old bar carried is in More (`more-menu.tsx`)
 * or the rail. A reader (`fix/WXMReviewer`): Read only, Preview, More and
 * their verdict where Publish would be.
 *
 * It takes the old bar's props (`EditorTopBarProps`) so both chromes run on
 * the same hooks (KTD-E1).
 */
export function DeskTopBar({
    bar,
    model,
    onFind,
    pickerOpen,
    setPickerOpen,
}: {
    bar: EditorTopBarProps;
    model: EditorModel;
    /** Find (⌘K), once built (U46c). */
    onFind?: () => void;
    /** The page picker, held by the shell so the Pages tree can open it. */
    pickerOpen: boolean;
    setPickerOpen: (open: boolean) => void;
}) {
    const b = useEditorBar(bar);
    const { readOnly, activePage, actions } = b;
    const { siteId, siteName, pages, pageId } = bar;
    const live = model.status.label.startsWith("Live");
    return (
        <>
            <header
                data-editor-bar=""
                className="flex h-[60px] shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b bg-background pl-2 pr-3"
            >
                <Link
                    href={`/sites/${siteId}/overview`}
                    aria-label="Back to Website"
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] pl-1.5 pr-2.5 text-sm font-semibold transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronLeft aria-hidden className="size-[18px]" />
                    <span className="hidden min-[1600px]:inline">Website</span>
                </Link>
                <Divider />
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            aria-haspopup="listbox"
                            aria-label={`Page: ${activePage?.title ?? "Page"}. Choose another page to edit`}
                            className="flex h-11 min-w-0 shrink items-center gap-2.5 rounded-[10px] border bg-card px-2.5 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground"
                        >
                            <span className="grid min-w-0">
                                <b className="truncate text-sm font-semibold leading-tight">
                                    {activePage?.title ?? "Page"}
                                </b>
                                <span className="max-w-[170px] truncate text-xs leading-snug text-muted-foreground">
                                    {siteName}
                                </span>
                            </span>
                            <ChevronDown
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground"
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
                            dirty={model.unsaved}
                            unfinished={
                                bar.onlyHeldBack
                                    ? unfinishedPhrase(bar.heldBack)
                                    : undefined
                            }
                            canUpdate={bar.canUpdateSite}
                            addableKinds={bar.addablePageKinds}
                            flags={bar.siteFlags.flags}
                            onClose={() => setPickerOpen(false)}
                            onPageSettings={(page) =>
                                b.openPageSettings(page.id)
                            }
                        />
                    </PopoverContent>
                </Popover>
                {readOnly ? (
                    <span
                        data-reviewing=""
                        className="ml-1.5 flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold text-muted-foreground"
                    >
                        <Lock aria-hidden className="size-3" />
                        Read only
                    </span>
                ) : null}

                <span className="flex-1" />

                {readOnly ? null : (
                    <IconButton
                        label="Undo"
                        icon={<Undo2 className="size-[18px]" />}
                        disabled={!model.edits.canUndo}
                        onClick={() => model.edits.undo()}
                        className="size-11"
                    />
                )}
                {model.askAi && !readOnly ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 rounded-[9px]"
                        onClick={openAskAi}
                    >
                        <Sparkles aria-hidden className="size-4" />
                        Ask AI
                    </Button>
                ) : null}
                {readOnly ? null : (
                    <>
                        <Divider />
                        <button
                            type="button"
                            aria-haspopup="dialog"
                            data-status-chip=""
                            title={`${model.status.label}: open Publish`}
                            onClick={actions.onPublish}
                            disabled={actions.publishing}
                            className="flex h-9 min-w-0 shrink items-center gap-2 rounded-full border border-info-subtle-foreground/20 bg-info-subtle px-3 text-[0.8125rem] font-semibold text-info-subtle-foreground transition-colors duration-fast hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-disabled disabled:text-disabled-foreground"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "size-2 shrink-0 rounded-full",
                                    live ? "bg-success" : "bg-muted-foreground",
                                )}
                            />
                            <span className="truncate">
                                {model.status.label}
                            </span>
                        </button>
                    </>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    aria-pressed={actions.previewing}
                    className="h-10 shrink-0 rounded-[9px] px-2"
                    onClick={() => actions.setPreviewing(!actions.previewing)}
                >
                    <Eye aria-hidden className="size-4" />
                    {actions.previewing ? "Back to editing" : "Preview"}
                </Button>
                <MoreMenu
                    model={model}
                    actions={actions}
                    onPageSettings={() => b.openPageSettings(pageId)}
                    onFind={onFind}
                />
                {readOnly ? (
                    bar.reviewerVerdict
                ) : (
                    <PublishButton
                        {...actions}
                        className="h-10 shrink-0 rounded-[9px] px-3.5 text-sm"
                    />
                )}
            </header>
            {b.pageSheet}
        </>
    );
}

function Divider() {
    return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}
