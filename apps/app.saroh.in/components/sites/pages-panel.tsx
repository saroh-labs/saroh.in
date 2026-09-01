"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createPage, deletePage, updatePage } from "@/lib/sites/actions";
import type { SitePage } from "@/lib/sites/service";

/**
 * The rail's Pages tab: every page on this site, which one is open, and the
 * three things you can do to the set.
 *
 * Switching pages is a NAVIGATION (`?page=<id>`), not local state. The open
 * page survives a reload, can be linked to, and Back goes where you expect —
 * and the server is the thing that loads a page's sections, so it has to know
 * which page anyway.
 *
 * Every rule about paths lives on the server. This panel does not pre-validate
 * a path or pre-check whether one is free: a client-side answer that disagreed
 * with the server's would be worse than one round trip, and there are exactly
 * two people who could be told different things.
 */
export function PagesPanel({
    siteId,
    pages,
    activePageId,
    dirty,
}: {
    siteId: string;
    pages: SitePage[];
    activePageId: string;
    /** Unsaved section edits on the page currently open. */
    dirty: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState(false);
    const [title, setTitle] = useState("");
    const [path, setPath] = useState("");
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameTitle, setRenameTitle] = useState("");

    function open(pageId: string) {
        if (pageId === activePageId) return;
        /*
         * The editor autosaves, but "autosaves" is not "has saved". Leaving a
         * page mid-flight would lose whatever had not gone out yet, and the
         * merchant would have no way to know it happened.
         */
        if (dirty) {
            toast.error("Save this page before opening another.");
            return;
        }
        router.push(`/sites/${siteId}?page=${pageId}`);
    }

    async function add() {
        const t = title.trim();
        const p = path.trim();
        if (t === "" || p === "") return;
        setBusy(true);
        const res = await createPage(siteId, { title: t, path: p });
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setAdding(false);
        setTitle("");
        setPath("");
        toast.success(`Added ${res.data.title}.`);
        router.push(`/sites/${siteId}?page=${res.data.id}`);
        router.refresh();
    }

    async function rename(pageId: string) {
        const t = renameTitle.trim();
        if (t === "") return;
        setBusy(true);
        const res = await updatePage(siteId, pageId, { title: t });
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setRenaming(null);
        router.refresh();
    }

    async function remove(page: SitePage) {
        // Deleting a page destroys every section on it, and nothing here
        // restores it — the sections are not versioned the way publications
        // are. So the confirm names the page rather than asking "are you sure".
        const ok = window.confirm(
            `Delete "${page.title}" and everything on it? This cannot be undone.`,
        );
        if (!ok) return;
        setBusy(true);
        const res = await deletePage(siteId, page.id);
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        toast.success(`Deleted ${page.title}.`);
        if (page.id === activePageId) router.push(`/sites/${siteId}`);
        router.refresh();
    }

    return (
        <>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                {pages.map((page) => (
                    <li key={page.id}>
                        {renaming === page.id ? (
                            <form
                                className="flex items-center gap-1 py-1"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    void rename(page.id);
                                }}
                            >
                                <Input
                                    autoFocus
                                    value={renameTitle}
                                    onChange={(e) =>
                                        setRenameTitle(e.target.value)
                                    }
                                    aria-label={`Rename ${page.title}`}
                                    className="h-7 text-xs"
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape")
                                            setRenaming(null);
                                    }}
                                />
                                <Button
                                    type="submit"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    disabled={busy}
                                >
                                    Save
                                </Button>
                            </form>
                        ) : (
                            <div
                                className={cn(
                                    "group flex h-8 items-center gap-1 rounded px-2 text-xs",
                                    page.id === activePageId
                                        ? "bg-secondary"
                                        : "hover:bg-muted",
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => open(page.id)}
                                    aria-current={
                                        page.id === activePageId
                                            ? "page"
                                            : undefined
                                    }
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                >
                                    <span className="truncate">
                                        {page.title}
                                    </span>
                                    {/*
                                     * The path, not a "home" badge: the path is
                                     * what the merchant typed and what visitors
                                     * see, and "/" already says home.
                                     */}
                                    <span className="shrink-0 font-mono text-[0.625rem] text-muted-foreground/70">
                                        {page.path}
                                    </span>
                                </button>
                                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        aria-label={`Rename ${page.title}`}
                                        className="h-6 w-6 p-0 text-xs"
                                        onClick={() => {
                                            setRenaming(page.id);
                                            setRenameTitle(page.title);
                                        }}
                                    >
                                        ✎
                                    </Button>
                                    {/*
                                     * The home page has no delete control at
                                     * all rather than a disabled one: it is not
                                     * a permission the merchant might gain, it
                                     * is what the site's address serves.
                                     */}
                                    {page.isHome ? null : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            aria-label={`Delete ${page.title}`}
                                            className="h-6 w-6 p-0 text-xs hover:text-destructive"
                                            disabled={busy}
                                            onClick={() => void remove(page)}
                                        >
                                            ×
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            <div className="p-2">
                {adding ? (
                    <form
                        className="grid gap-1.5"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void add();
                        }}
                    >
                        <Input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Page name"
                            aria-label="Page name"
                            className="h-7 text-xs"
                        />
                        <Input
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                            placeholder="/about"
                            aria-label="Page path"
                            className="h-7 font-mono text-xs"
                        />
                        <div className="flex gap-1">
                            <Button
                                type="submit"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={busy}
                            >
                                {busy ? "Adding…" : "Add page"}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setAdding(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="w-full rounded-md border border-dashed px-2 py-1.5 text-center text-xs text-muted-foreground transition-colors hover:border-solid hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        ＋ Add page
                    </button>
                )}
            </div>
        </>
    );
}
