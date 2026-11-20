"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { canShare, copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import {
    Copy,
    Eye,
    EyeOff,
    Link2,
    ListOrdered,
    MoreHorizontal,
    Settings2,
    Share2,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { deletePage, duplicatePage, updatePage } from "@/lib/sites/actions";
import type { SitePage } from "@/lib/sites/service";

/** Pointer, hover, focus and pressed on every item (the standing rule). */
const ITEM = "cursor-pointer active:bg-secondary-hover";

/**
 * A row's menu on Pages (WXPPages): Page settings, Copy link, Share this
 * page, Duplicate, Move in menu, Hide, Delete. What the role can't do isn't
 * drawn (a reader copies and shares). Home has no Hide or Delete: it is
 * what the site's address serves. Hide asks nothing, as in the editor: it
 * is the reversible half of the pair; Delete keeps its confirm.
 */
export function PageRowMenu({
    siteId,
    page,
    url,
    shareable,
    canUpdate,
    onSettings,
    onChanged,
    onDuplicated,
}: {
    siteId: string;
    page: SitePage;
    /** The page's full link; null before the site has an address. */
    url: string | null;
    /** Live and public: a share would open it. */
    shareable: boolean;
    canUpdate: boolean;
    onSettings: () => void;
    onChanged: () => void;
    onDuplicated: (copy: SitePage) => void;
}) {
    const [deleteOpen, setDeleteOpen] = useState(false);

    async function copy() {
        if (!url) return;
        if (await copyText(url)) showSuccess("Link copied.");
        else showError(copyFailedMessage());
    }

    async function share() {
        if (!url) return;
        if (!canShare()) return copy();
        try {
            await navigator.share({ url, title: page.title });
        } catch (error) {
            // Closing the share sheet is a choice, not a failure.
            if (!(error instanceof DOMException && error.name === "AbortError"))
                await copy();
        }
    }

    async function duplicate() {
        const res = await runAction(() => duplicatePage(siteId, page.id));
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            `Copied as ${res.data.path}. It stays hidden until you show it.`,
        );
        onDuplicated(res.data);
    }

    async function hide(hidden: boolean) {
        const res = await runAction(() =>
            updatePage(siteId, page.id, { hidden }),
        );
        if (!res) return;
        if (!res.ok) return showError(res.error);
        showSuccess(
            hidden
                ? `${page.title} is hidden. It stays here and comes off the site when you publish.`
                : `${page.title} is visible again. It goes back on the site when you publish.`,
        );
        onChanged();
    }

    async function remove() {
        const res = await deletePage(siteId, page.id);
        if (!res.ok) return { ok: false, error: res.error };
        showSuccess("Page deleted.");
        onChanged();
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <IconButton
                        label={`More for ${page.title}`}
                        icon={<MoreHorizontal />}
                        tooltip={false}
                    />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuItem className={ITEM} onSelect={onSettings}>
                        <Settings2 aria-hidden />
                        Page settings
                    </DropdownMenuItem>
                    {url ? (
                        <DropdownMenuItem
                            className={ITEM}
                            onSelect={() => void copy()}
                        >
                            <Link2 aria-hidden />
                            Copy link
                        </DropdownMenuItem>
                    ) : null}
                    {url && shareable ? (
                        <DropdownMenuItem
                            className={ITEM}
                            onSelect={() => void share()}
                        >
                            <Share2 aria-hidden />
                            Share this page
                        </DropdownMenuItem>
                    ) : null}
                    {canUpdate ? (
                        <>
                            <DropdownMenuItem
                                className={ITEM}
                                onSelect={() => void duplicate()}
                            >
                                <Copy aria-hidden />
                                Duplicate
                            </DropdownMenuItem>
                            {page.isHome ? null : (
                                <DropdownMenuItem asChild className={ITEM}>
                                    <Link
                                        href={`/sites/${siteId}/settings?section=menu-and-footer`}
                                    >
                                        <ListOrdered aria-hidden />
                                        Move in menu
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            {page.isHome ? null : (
                                <>
                                    <DropdownMenuItem
                                        className={ITEM}
                                        onSelect={() => void hide(!page.hidden)}
                                    >
                                        {page.hidden ? (
                                            <Eye aria-hidden />
                                        ) : (
                                            <EyeOff aria-hidden />
                                        )}
                                        {page.hidden ? "Show" : "Hide"}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className={`${ITEM} text-destructive focus:text-destructive`}
                                        onSelect={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 aria-hidden />
                                        Delete…
                                    </DropdownMenuItem>
                                </>
                            )}
                        </>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={`Delete ${page.title}?`}
                description="Everything on the page is deleted with it. Your other pages stay as they are. This cannot be undone."
                confirmLabel="Delete page"
                keepLabel="Keep page"
                onConfirm={remove}
            />
        </>
    );
}
