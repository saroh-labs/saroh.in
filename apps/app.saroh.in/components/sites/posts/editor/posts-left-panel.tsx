"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { IconButton } from "@saroh/ui/icon-button";
import { couldntLoad } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import { ChevronRight, FileText, Heading, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PostCategoriesSheet } from "../post-categories-sheet";
import type { PostEditorData, PostEditorModel } from "./post-model";

/** How many posts the panel lists before "n more" (`WXWWrite`). */
const SHOWN = 5;

/** The body's headings, in order, as the outline lists them. */
export function headingsOf(html: string): { level: number; text: string }[] {
    const found: { level: number; text: string }[] = [];
    const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
    for (let m = re.exec(html); m; m = re.exec(html)) {
        let bare = m[2];
        // Until nothing changes: `<scr<b>ipt>` is a tag again after one pass.
        for (let before = ""; before !== bare;) {
            before = bare;
            bare = bare.replace(/<[^>]+>/g, "");
        }
        const text = bare
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .trim();
        if (text) found.push({ level: Number(m[1]), text });
    }
    return found;
}

/** Scroll the writing surface to its nth heading, or to the top. */
function scrollToHeading(index: number | null) {
    const surface = document.querySelector("[data-writing-surface]");
    if (!surface) return;
    const heads = surface.querySelectorAll(".ProseMirror :is(h1, h2, h3, h4)");
    const target =
        index === null ? surface : index < heads.length ? heads[index] : null;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * The left panel at rest (`blogdesk/WXWWrite`): "Blog n" with the newest
 * posts and their state, "n more" to the whole list; "In this post", the
 * outline from the body's headings (a click scrolls there); and "Blog
 * settings and categories", today's categories sheet. The kind is the
 * site's one blog until kinds of writing come (batch 3 U13).
 */
export function PostsLeftPanel({
    data,
    model,
    busy = true,
}: {
    /** The site's side: its posts and categories. */
    data: PostEditorData;
    /** The open post; null while the next one loads (`PostFrame`). */
    model: PostEditorModel | null;
    /** Without a model: its outline is on its way, or it failed to open. */
    busy?: boolean;
}) {
    const router = useRouter();
    const { siteId, posts, readOnly, categories } = data;
    // The post asked for, marked at once while it loads.
    const [opening, setOpening] = useState<string | null>(null);
    const currentId = model ? model.draft.postId : opening;
    const all = posts ?? [];
    const shown = all.slice(0, SHOWN);
    const outline = model ? headingsOf(model.draft.fields.content) : null;
    return (
        <aside
            aria-label="Posts in Blog"
            className="flex min-h-0 flex-1 flex-col"
        >
            <div className="flex h-12 shrink-0 items-center gap-2 pl-4 pr-2">
                <h2 className="font-display text-[1.0625rem] font-semibold">
                    Blog
                </h2>
                <span className="text-[0.8125rem] text-muted-foreground">
                    {all.length}
                </span>
                <span className="flex-1" />
                {readOnly ? null : (
                    <IconButton
                        label="New post"
                        icon={<Plus className="size-[18px]" />}
                        href={`/sites/${siteId}/write/new`}
                    />
                )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {posts === null ? (
                    <FailedState
                        size="inline"
                        title={couldntLoad("your posts")}
                        onRetry={() => router.refresh()}
                    />
                ) : null}
                <ul className="grid grid-cols-1 gap-px">
                    {shown.map((p) => {
                        const current = p.id === currentId;
                        return (
                            <li key={p.id}>
                                <Link
                                    href={`/sites/${siteId}/write/${p.id}`}
                                    aria-current={current ? "page" : undefined}
                                    onClick={() => setOpening(p.id)}
                                    className={cn(
                                        "flex h-9 min-w-0 items-center gap-2 rounded-lg px-2.5 text-sm text-foreground/80 hover:bg-secondary",
                                        current &&
                                            "bg-background font-semibold text-foreground shadow-[inset_0_0_0_1px_hsl(var(--border))]",
                                    )}
                                >
                                    <FileText
                                        aria-hidden
                                        className="size-[15px] shrink-0 text-muted-foreground"
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                        {p.title}
                                    </span>
                                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                                        {current && model
                                            ? model.status.split(" · ")[0]
                                            : p.live
                                              ? "Live"
                                              : "Not live yet"}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                    {all.length > SHOWN ? (
                        <li>
                            <Link
                                href={`/sites/${siteId}/writing`}
                                className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-foreground/80 hover:bg-secondary"
                            >
                                <ChevronRight
                                    aria-hidden
                                    className="size-[15px] text-muted-foreground"
                                />
                                {all.length - SHOWN} more
                            </Link>
                        </li>
                    ) : null}
                </ul>

                <h3 className="mx-2.5 mb-1 mt-4 text-xs font-semibold text-muted-foreground">
                    In this post
                </h3>
                <ul
                    aria-label="Outline of this post"
                    className="grid grid-cols-1 gap-px"
                >
                    <li>
                        <button
                            type="button"
                            onClick={() => scrollToHeading(null)}
                            className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[0.8125rem] hover:bg-secondary"
                        >
                            <Heading
                                aria-hidden
                                className="size-[13px] text-muted-foreground"
                            />
                            Title and cover
                        </button>
                    </li>
                    {outline === null && busy ? (
                        <li aria-busy="true" className="grid gap-2 px-2.5 py-2">
                            <span className="sr-only">Loading the outline</span>
                            <Skeleton aria-hidden className="h-3 w-3/4" />
                            <Skeleton aria-hidden className="ml-4 h-3 w-1/2" />
                        </li>
                    ) : null}
                    {(outline ?? []).map((h, i) => (
                        <li key={`${i}-${h.text}`}>
                            <button
                                type="button"
                                onClick={() => scrollToHeading(i)}
                                className={cn(
                                    "flex h-8 w-full min-w-0 items-center rounded-lg px-2.5 text-left text-[0.8125rem] hover:bg-secondary",
                                    h.level > 1 && "pl-7",
                                )}
                            >
                                <span className="truncate">{h.text}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
            {readOnly ? null : (
                <div className="shrink-0 border-t p-3">
                    <PostCategoriesSheet
                        siteId={siteId}
                        categories={categories}
                        trigger={
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full justify-start"
                            >
                                <Settings2 aria-hidden className="size-4" />
                                Blog settings and categories
                            </Button>
                        }
                    />
                </div>
            )}
        </aside>
    );
}
