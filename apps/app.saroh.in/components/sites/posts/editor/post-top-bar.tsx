"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Skeleton } from "@saroh/ui/skeleton";
import type { Editor } from "@tiptap/react";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    Eye,
    FileText,
    Lock,
    MoreHorizontal,
    Plus,
    Redo2,
    Undo2,
    X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { formatRelative } from "@/lib/format/datetime";

import type { PostEditorModel } from "./post-model";
import { useCanUndo } from "./use-can-undo";

/**
 * The post editor's top bar at desk (`blogdesk/WXWWrite`, RULES §3):
 * ← Website · the post picker (kind, title, link) · the saved line ·
 * Undo, Redo · the status chip (opens Publish post) · Preview · ⋯ More ·
 * Publish post, the one black button. Ask AI is in the rail here (C3).
 */
export function PostTopBar({
    siteId,
    model,
    busy = true,
    editor,
    previewing,
    onPreview,
    onPublish,
    more,
    onDiscard,
    lastReadOnly = false,
    lastPaused = false,
}: {
    /** The last post's read-only and paused, kept while the next loads. */
    lastReadOnly?: boolean;
    lastPaused?: boolean;
    /** Null only before the first post of a visit has loaded. */
    siteId: string | null;
    /** Null while another post loads: its parts are grey, the bar stays. */
    model: PostEditorModel | null;
    /** Without a model: a post is on its way (grey), or none is coming. */
    busy?: boolean;
    editor: Editor | null;
    previewing: boolean;
    onPreview: (on: boolean) => void;
    onPublish: () => void;
    more: ReactNode;
    /** Started from Ask AI and not yet saved: Discard and Save draft. */
    onDiscard?: () => void;
}) {
    // Lit after an edit, never on open (editor audit, 21 Nov).
    const can = useCanUndo(editor);
    const back = siteId ? (
        <Link
            href={`/sites/${siteId}/overview`}
            aria-label="Back to Website"
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] pl-1.5 pr-2.5 text-sm font-semibold transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <ChevronLeft aria-hidden className="size-[18px]" />
            <span className="hidden min-[1600px]:inline">Website</span>
        </Link>
    ) : (
        <Skeleton aria-hidden className="ml-1.5 h-10 w-9 rounded-[9px]" />
    );
    if (!model && !busy) {
        // No post is coming (it failed): only the way back.
        return (
            <header data-post-bar="" className={BAR}>
                {back}
            </header>
        );
    }
    // While another post loads the bar stays mounted: its actions are
    // disabled, only the title, the saved line and the status chip grey.
    const loading = !model;
    const readOnly = model?.data.readOnly ?? lastReadOnly;
    const paused = model?.data.paused ?? lastPaused;
    const draft = model?.draft;
    const live = model?.status.startsWith("Live") ?? false;
    return (
        <header
            data-post-bar=""
            aria-busy={loading ? "true" : undefined}
            className={BAR}
        >
            {back}
            <Divider />
            {model ? (
                <PostPicker model={model} />
            ) : (
                <span
                    aria-hidden
                    data-skeleton="title"
                    className="flex h-11 w-[300px] shrink items-center gap-2.5 rounded-[10px] border bg-card px-2.5"
                >
                    <Skeleton className="h-5 w-12" />
                    <span className="grid flex-1 gap-1.5">
                        <Skeleton className="h-3.5 w-4/5" />
                        <Skeleton className="h-3 w-1/2" />
                    </span>
                </span>
            )}
            {readOnly || paused ? (
                <span
                    data-reviewing=""
                    className="ml-1.5 flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold text-muted-foreground"
                >
                    <Lock aria-hidden className="size-3" />
                    Read only
                </span>
            ) : model ? (
                <SavedLine model={model} />
            ) : (
                // `blogdesk/WXWStates` Loading: the frame, and these words (W7).
                <span
                    role="status"
                    data-post-opening=""
                    className="ml-2 shrink-0 text-[0.8125rem] text-muted-foreground"
                >
                    Opening the post…
                </span>
            )}

            <span className="flex-1" />

            {readOnly || paused ? null : (
                <>
                    <IconButton
                        label="Undo"
                        icon={<Undo2 className="size-[18px]" />}
                        disabled={loading || !can.undo}
                        onClick={() => editor?.chain().focus().undo().run()}
                        className="size-11"
                    />
                    <IconButton
                        label="Redo"
                        icon={<Redo2 className="size-[18px]" />}
                        disabled={loading || !can.redo}
                        onClick={() => editor?.chain().focus().redo().run()}
                        className="size-11"
                    />
                    <Divider />
                    {model ? (
                        <button
                            type="button"
                            aria-haspopup="dialog"
                            data-status-chip=""
                            aria-label={`${model.status}. Open Publish post`}
                            onClick={onPublish}
                            disabled={draft?.publishing}
                            className="flex h-9 min-w-0 shrink items-center gap-2 rounded-full border border-info-subtle-foreground/20 bg-info-subtle px-3 text-[0.8125rem] font-semibold text-info-subtle-foreground transition-colors duration-fast hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-disabled disabled:text-disabled-foreground"
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "size-2 shrink-0 rounded-full",
                                    live ? "bg-success" : "bg-muted-foreground",
                                )}
                            />
                            <span className="truncate">{model.status}</span>
                        </button>
                    ) : (
                        <Skeleton
                            aria-hidden
                            className="h-9 w-24 rounded-full"
                        />
                    )}
                </>
            )}
            <Button
                type="button"
                variant="ghost"
                aria-pressed={previewing}
                disabled={loading}
                className="h-10 shrink-0 rounded-[9px] px-2"
                onClick={() => onPreview(!previewing)}
            >
                <Eye aria-hidden className="size-4" />
                {previewing ? "Back to editing" : "Preview"}
            </Button>
            {more ?? (
                <IconButton
                    label="More"
                    icon={<MoreHorizontal className="size-5" />}
                    tooltip={false}
                    disabled
                    className="size-11"
                />
            )}
            {readOnly ? null : onDiscard ? (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 rounded-[9px]"
                        disabled={loading}
                        onClick={onDiscard}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        className="h-10 shrink-0 rounded-[9px] px-3.5"
                        disabled={loading}
                        busy={draft?.saving}
                        busyLabel="Saving…"
                        onClick={() => {
                            if (model && !model.needsTitle())
                                void model.draft.save();
                        }}
                    >
                        Save draft
                    </Button>
                </>
            ) : (
                <Button
                    type="button"
                    className="h-10 shrink-0 rounded-[9px] px-3.5 text-sm"
                    disabled={loading || paused}
                    busy={draft?.publishing}
                    busyLabel="Publishing…"
                    onClick={onPublish}
                >
                    Publish post
                </Button>
            )}
        </header>
    );
}

const BAR =
    "flex h-[60px] shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap border-b bg-background pl-2 pr-3";

function Divider() {
    return <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />;
}

/**
 * "Saved · 2 minutes ago", "Saving…", "Not saved" (the save failed),
 * "Unsaved changes" (autosave is about to run). Said aloud as it changes.
 */
function SavedLine({ model }: { model: PostEditorModel }) {
    const { draft } = model;
    // Re-read "how long ago" now and then, not on every keystroke.
    const [, tick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 30_000);
        return () => clearInterval(t);
    }, []);
    const failed = draft.saveFailed;
    const words = draft.saving
        ? "Saving…"
        : failed
          ? "Not saved"
          : draft.dirty
            ? "Unsaved changes"
            : draft.savedAt
              ? `Saved · ${formatRelative(draft.savedAt)}`
              : draft.postId
                ? "Saved"
                : "";
    if (!words) return null;
    return (
        <span
            role="status"
            data-saved-line=""
            className={cn(
                "ml-2 flex shrink-0 items-center gap-1.5 text-[0.8125rem]",
                failed
                    ? "font-semibold text-destructive"
                    : "text-foreground/75",
            )}
        >
            {failed ? (
                <X aria-hidden className="size-[15px]" />
            ) : words.startsWith("Saved") ? (
                <Check aria-hidden className="size-[15px] text-success" />
            ) : null}
            {words}
        </span>
    );
}

/**
 * The post picker: the kind, the title over its link. Opens the kind's
 * newest posts with Live / Not live yet, New post and All posts with its
 * count. The one way to switch posts (`EBPostLeftPanel`).
 */
function PostPicker({ model }: { model: PostEditorModel }) {
    const { siteId, posts, readOnly, postsPrefix } = model.data;
    const title = model.draft.fields.title.trim() || "New post";
    const slug = model.draft.fields.slug.trim();
    const path = slug ? `/${postsPrefix}/${slug}` : `/${postsPrefix}/`;
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`Blog post: ${title}. Open another post`}
                    className="flex h-11 min-w-0 shrink items-center gap-2.5 rounded-[10px] border bg-card px-2.5 text-left transition-colors duration-fast hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground"
                >
                    <span className="flex shrink-0 items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">
                        <FileText aria-hidden className="size-[13px]" />
                        Blog
                    </span>
                    <span className="grid min-w-0">
                        <b className="max-w-[300px] truncate text-sm font-semibold leading-tight">
                            {title}
                        </b>
                        <span className="max-w-[300px] truncate font-mono text-xs leading-snug text-muted-foreground">
                            {path}
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
                className="max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[10px] p-1.5 shadow-lg"
            >
                <nav aria-label="Posts" className="grid">
                    {(posts ?? []).slice(0, 8).map((p) => {
                        const current = p.id === model.draft.postId;
                        return (
                            <Link
                                key={p.id}
                                href={`/sites/${siteId}/write/${p.id}`}
                                aria-current={current ? "page" : undefined}
                                onClick={() => setOpen(false)}
                                className="flex h-9 min-w-0 items-center gap-2 rounded-[7px] px-2.5 text-sm hover:bg-secondary aria-[current=page]:bg-secondary aria-[current=page]:font-semibold"
                            >
                                <span className="min-w-0 flex-1 truncate">
                                    {p.title}
                                </span>
                                {/* The state the left panel's list used to show (`EBPostLeftPanel`). */}
                                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                    {current
                                        ? model.status.split(" · ")[0]
                                        : p.live
                                          ? "Live"
                                          : "Not live yet"}
                                </span>
                            </Link>
                        );
                    })}
                    <span aria-hidden className="mx-1.5 my-1 h-px bg-border" />
                    {readOnly ? null : (
                        <Link
                            href={`/sites/${siteId}/write/new`}
                            onClick={() => setOpen(false)}
                            className="flex h-9 items-center gap-2 rounded-[7px] px-2.5 text-sm hover:bg-secondary"
                        >
                            <Plus aria-hidden className="size-4" />
                            New post
                        </Link>
                    )}
                    <Link
                        href={`/sites/${siteId}/writing`}
                        onClick={() => setOpen(false)}
                        className="flex h-9 items-center gap-2 rounded-[7px] px-2.5 text-sm hover:bg-secondary"
                    >
                        <span className="flex-1">All posts</span>
                        {posts ? (
                            <span className="text-xs text-muted-foreground">
                                {posts.length}
                            </span>
                        ) : null}
                    </Link>
                </nav>
            </PopoverContent>
        </Popover>
    );
}
