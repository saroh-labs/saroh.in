"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import { Heading, Settings2 } from "lucide-react";

import { PostCategoriesSheet } from "../post-categories-sheet";
import type { PostEditorData, PostEditorModel } from "./post-model";

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
 * The left panel at rest (`EBPostLeftPanel`, owner 22 Nov): "In this post",
 * the outline from the body's headings (a click scrolls there), and "Blog
 * settings and categories", today's categories sheet. Switching posts is
 * the top bar's picker only.
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
    const { siteId, readOnly, categories } = data;
    const outline = model ? headingsOf(model.draft.fields.content) : null;
    return (
        <aside
            aria-label="In this post"
            className="flex min-h-0 flex-1 flex-col"
        >
            <h2 className="flex h-12 shrink-0 items-center px-4 font-display text-[1.0625rem] font-semibold">
                In this post
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
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
