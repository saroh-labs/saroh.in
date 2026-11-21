"use client";

import { Button } from "@saroh/ui/button";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import type { Editor } from "@tiptap/react";
import {
    Check,
    ChevronDown,
    ChevronLeft,
    Eye,
    FileText,
    Lock,
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

/**
 * The post editor's top bar at desk (`blogdesk/WXWWrite`, RULES §3):
 * ← Website · the post picker (kind, title, link) · the saved line ·
 * Undo, Redo · the status chip (opens Publish post) · Preview · ⋯ More ·
 * Publish post, the one black button. Ask AI is in the rail here (C3).
 */
export function PostTopBar({
    model,
    editor,
    previewing,
    onPreview,
    onPublish,
    more,
    onDiscard,
}: {
    model: PostEditorModel;
    editor: Editor | null;
    previewing: boolean;
    onPreview: (on: boolean) => void;
    onPublish: () => void;
    more: ReactNode;
    /** Started from Ask AI and not yet saved: Discard and Save draft. */
    onDiscard?: () => void;
}) {
    const { data, draft } = model;
    const { siteId, readOnly, paused, postsPrefix } = data;
    const title = draft.fields.title.trim() || "New post";
    const slug = draft.fields.slug.trim();
    const path = slug ? `/${postsPrefix}/${slug}` : `/${postsPrefix}/`;
    const live = model.status.startsWith("Live");
    return (
        <header
            data-post-bar=""
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
            <PostPicker model={model} title={title} path={path} />
            {readOnly || paused ? (
                <span
                    data-reviewing=""
                    className="ml-1.5 flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-semibold text-muted-foreground"
                >
                    <Lock aria-hidden className="size-3" />
                    Read only
                </span>
            ) : (
                <SavedLine model={model} />
            )}

            <span className="flex-1" />

            {readOnly || paused ? null : (
                <>
                    <IconButton
                        label="Undo"
                        icon={<Undo2 className="size-[18px]" />}
                        disabled={
                            !(editor?.isInitialized && editor.can().undo())
                        }
                        onClick={() => editor?.chain().focus().undo().run()}
                        className="size-11"
                    />
                    <IconButton
                        label="Redo"
                        icon={<Redo2 className="size-[18px]" />}
                        disabled={
                            !(editor?.isInitialized && editor.can().redo())
                        }
                        onClick={() => editor?.chain().focus().redo().run()}
                        className="size-11"
                    />
                    <Divider />
                    <button
                        type="button"
                        aria-haspopup="dialog"
                        data-status-chip=""
                        aria-label={`${model.status}. Open Publish post`}
                        onClick={onPublish}
                        disabled={draft.publishing}
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
                </>
            )}
            <Button
                type="button"
                variant="ghost"
                aria-pressed={previewing}
                className="h-10 shrink-0 rounded-[9px] px-2"
                onClick={() => onPreview(!previewing)}
            >
                <Eye aria-hidden className="size-4" />
                {previewing ? "Back to editing" : "Preview"}
            </Button>
            {more}
            {readOnly ? null : onDiscard ? (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-10 shrink-0 rounded-[9px]"
                        onClick={onDiscard}
                    >
                        Discard
                    </Button>
                    <Button
                        type="button"
                        className="h-10 shrink-0 rounded-[9px] px-3.5"
                        busy={draft.saving}
                        busyLabel="Saving…"
                        onClick={() => {
                            if (!model.needsTitle()) void draft.save();
                        }}
                    >
                        Save draft
                    </Button>
                </>
            ) : (
                <Button
                    type="button"
                    className="h-10 shrink-0 rounded-[9px] px-3.5 text-sm"
                    disabled={paused}
                    busy={draft.publishing}
                    busyLabel="Publishing…"
                    onClick={onPublish}
                >
                    Publish post
                </Button>
            )}
        </header>
    );
}

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
 * newest posts, New post and the whole list.
 */
function PostPicker({
    model,
    title,
    path,
}: {
    model: PostEditorModel;
    title: string;
    path: string;
}) {
    const { siteId, posts, readOnly } = model.data;
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
                    {(posts ?? []).slice(0, 8).map((p) => (
                        <Link
                            key={p.id}
                            href={`/sites/${siteId}/write/${p.id}`}
                            aria-current={
                                p.id === model.draft.postId ? "page" : undefined
                            }
                            onClick={() => setOpen(false)}
                            className="flex h-9 min-w-0 items-center gap-2 rounded-[7px] px-2.5 text-sm hover:bg-secondary aria-[current=page]:font-semibold"
                        >
                            <span className="truncate">{p.title}</span>
                        </Link>
                    ))}
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
                        All posts
                    </Link>
                </nav>
            </PopoverContent>
        </Popover>
    );
}
