"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, ChevronRight, Plus, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { AddPagePanel, MENU_ROW } from "@/components/sites/add-page-panel";
import { leavePageMessage } from "@/components/sites/editor/use-editor-selection";
import { PageSettings } from "@/components/sites/page-settings";
import { deletePage } from "@/lib/sites/actions";
import {
    addPageOffers,
    pageMenuMarks,
    pageOptionName,
    unseenBecause,
} from "@/lib/sites/page-menu";
import type { Flag, ModulePageKind, SitePage } from "@/lib/sites/service";

/** Which part of the menu is open below the pages. */
type Open = "pages" | "settings" | "add";

/**
 * The page menu under the page name in the editor's breadcrumb (#335, G16),
 * drawn as Saroh Site Editor.dc.html draws it: a list of the site's pages,
 * the open one ticked, "Not in menu" beside a page taken out of the menu,
 * and a page hidden from the site crossed out — as a hidden block is in the
 * block list. A free-form page at an address one of the site's routes
 * answers says "Can't be seen", and opening its settings says why and where
 * to change its address.
 *
 * It is a button and a list, never a native select, so it can't show one
 * page while another is open; Esc closes it (the popover's own). Below the
 * list, the open page's settings and "Add a page" — the module pages the
 * site can have now, then "Blank page".
 *
 * Switching pages is a NAVIGATION (`?page=<id>`), not local state. The open
 * page survives a reload, can be linked to, and Back goes where you expect —
 * and the server is the thing that loads a page's sections, so it has to know
 * which page anyway.
 *
 * Every rule about pages lives on the server: which kinds can be added, what
 * a legal address is and whether it is free. This panel never pre-checks;
 * it shows the server's answer in the server's words.
 */
export function PagesPanel({
    siteId,
    pages,
    activePageId,
    dirty,
    unfinished,
    canUpdate,
    addableKinds,
    flags,
    onClose,
}: {
    siteId: string;
    pages: SitePage[];
    activePageId: string;
    /** Unsaved section edits on the page currently open. */
    dirty: boolean;
    /**
     * When the only unsaved work is unfinished sections, a phrase naming them
     * ("the unfinished FAQ section"). Saving
     * cannot help then, so the message says what will.
     */
    unfinished?: string;
    /** Whether this person holds `site:update`, which every page change needs. */
    canUpdate: boolean;
    /** The module pages the API says can be added now (G14). */
    addableKinds?: ModulePageKind[];
    /** The site's pre-publish flags, for a page at a route's address. */
    flags: readonly Flag[];
    /** Close the menu (after a switch, or once a page is added). */
    onClose: () => void;
}) {
    const router = useRouter();
    const [open, setOpen] = useState<Open>("pages");
    const reasonId = useId();
    // The page a Delete was last chosen for. Kept after the dialog closes so
    // its title does not blank out during the closing animation.
    const [pendingDelete, setPendingDelete] = useState<SitePage | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    // The confirm action stays clickable during the dialog's exit animation,
    // so a double click can fire this twice before a re-render.
    const removeInFlight = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    const active = pages.find((page) => page.id === activePageId);
    const offers = addPageOffers(addableKinds);

    function openPage(pageId: string) {
        if (pageId === activePageId) {
            onClose();
            return;
        }
        // Not while this page has work that hasn't gone out yet.
        const blocked = leavePageMessage(dirty, unfinished);
        if (blocked !== null) {
            showError(blocked);
            return;
        }
        onClose();
        router.push(`/sites/${siteId}?page=${pageId}`);
    }

    async function remove(page: SitePage) {
        if (removeInFlight.current) return;
        removeInFlight.current = true;
        try {
            const res = await deletePage(siteId, page.id);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`Deleted ${page.title}.`);
            onClose();
            if (page.id === activePageId) router.push(`/sites/${siteId}`);
            router.refresh();
        } finally {
            removeInFlight.current = false;
        }
    }

    /** Up and Down move between pages; Home and End go to the ends. */
    function onListKey(e: KeyboardEvent<HTMLDivElement>) {
        const options = Array.from(
            listRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="option"]',
            ) ?? [],
        );
        const at = options.findIndex((o) => o === document.activeElement);
        const to =
            e.key === "ArrowDown"
                ? Math.min(at + 1, options.length - 1)
                : e.key === "ArrowUp"
                  ? Math.max(at - 1, 0)
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? options.length - 1
                      : null;
        if (to === null) return;
        e.preventDefault();
        options[to]?.focus();
    }

    return (
        <>
            <div
                ref={listRef}
                role="listbox"
                aria-label="Page to edit"
                onKeyDown={onListKey}
                className="grid gap-px p-[5px]"
            >
                {pages.map((page) => {
                    const current = page.id === activePageId;
                    const marks = pageMenuMarks(page, flags);
                    return (
                        <button
                            key={page.id}
                            type="button"
                            role="option"
                            aria-selected={current}
                            aria-label={pageOptionName(page, marks)}
                            tabIndex={current ? 0 : -1}
                            onClick={() => openPage(page.id)}
                            className={cn(
                                MENU_ROW,
                                "h-[34px]",
                                current && "bg-secondary font-semibold",
                            )}
                        >
                            <span
                                className={cn(
                                    "min-w-0 flex-1 truncate",
                                    /*
                                     * Dimmed and struck through, the same
                                     * as a hidden block in the block list:
                                     * two lists that look alike must mean
                                     * alike.
                                     */
                                    marks.hidden &&
                                        "text-muted-foreground line-through",
                                )}
                            >
                                {page.title}
                            </span>
                            {marks.unseen ? (
                                <span className="shrink-0 text-[0.6875rem] font-medium text-highlight">
                                    Can&apos;t be seen
                                </span>
                            ) : marks.notInMenu ? (
                                <span className="shrink-0 text-[0.6875rem] font-medium text-muted-foreground">
                                    Not in menu
                                </span>
                            ) : null}
                            {current ? (
                                <Check
                                    aria-hidden
                                    strokeWidth={2.2}
                                    className="size-3.5 shrink-0 text-foreground"
                                />
                            ) : null}
                        </button>
                    );
                })}
            </div>

            <div className="border-t p-[5px]">
                <Disclosure
                    icon={<Settings2 aria-hidden className="size-3.5" />}
                    label={
                        active
                            ? `Settings for ${active.title}`
                            : "Page settings"
                    }
                    open={open === "settings"}
                    onToggle={() =>
                        setOpen(open === "settings" ? "pages" : "settings")
                    }
                    hint={
                        active && unseenBecause(active.id, flags)
                            ? "Change path"
                            : undefined
                    }
                />
                {open === "settings" && active ? (
                    <PageSettings
                        // Fresh fields when the page itself changes.
                        key={`${active.id}:${active.title}:${active.path}`}
                        siteId={siteId}
                        page={active}
                        canUpdate={canUpdate}
                        unseen={unseenBecause(active.id, flags)}
                        onChanged={() => router.refresh()}
                        onDelete={() => {
                            setPendingDelete(active);
                            setDeleteOpen(true);
                        }}
                    />
                ) : null}

                <Disclosure
                    icon={<Plus aria-hidden className="size-3.5" />}
                    label="Add a page"
                    open={open === "add"}
                    disabled={!canUpdate}
                    describedBy={canUpdate ? undefined : reasonId}
                    onToggle={() => setOpen(open === "add" ? "pages" : "add")}
                />
                {canUpdate ? null : (
                    <p
                        id={reasonId}
                        className="px-2.5 pb-1.5 text-[0.71875rem] leading-relaxed text-muted-foreground"
                    >
                        Adding a page needs a role that can change the
                        website&apos;s settings.
                    </p>
                )}
                {open === "add" && canUpdate ? (
                    <AddPagePanel
                        siteId={siteId}
                        offers={offers}
                        onCancel={() => setOpen("pages")}
                        onAdded={(page) => {
                            showSuccess(`Added ${page.title}.`);
                            onClose();
                            router.push(`/sites/${siteId}?page=${page.id}`);
                            router.refresh();
                        }}
                    />
                ) : null}
            </div>

            {/*
             * Deleting a page destroys every section on it, and nothing here
             * restores it — the sections are not versioned the way
             * publications are. So the dialog names the page rather than
             * asking "are you sure".
             */}
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete "${pendingDelete?.title ?? ""}"?`}
                description="Everything on the page is deleted with it. This cannot be undone."
                confirmLabel="Delete page"
                cancelLabel="Keep page"
                onConfirm={() => {
                    if (pendingDelete) void remove(pendingDelete);
                }}
            />
        </>
    );
}

/** A row that opens a part of the menu below it. */
function Disclosure({
    icon,
    label,
    open,
    onToggle,
    disabled = false,
    describedBy,
    hint,
}: {
    icon: React.ReactNode;
    label: string;
    open: boolean;
    onToggle: () => void;
    disabled?: boolean;
    describedBy?: string;
    /** A word on the right, such as "Change path". */
    hint?: string;
}) {
    return (
        <button
            type="button"
            aria-expanded={open}
            aria-describedby={describedBy}
            disabled={disabled}
            onClick={onToggle}
            className={cn(MENU_ROW, "h-[34px]", open && "font-semibold")}
        >
            <span className="shrink-0 text-muted-foreground">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {hint ? (
                <span className="shrink-0 text-[0.6875rem] font-medium text-highlight">
                    {hint}
                </span>
            ) : null}
            <ChevronRight
                aria-hidden
                className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    open && "rotate-90",
                )}
            />
        </button>
    );
}
