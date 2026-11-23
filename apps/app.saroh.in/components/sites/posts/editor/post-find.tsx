"use client";

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { noMatchLine } from "@saroh/ui/lib/state-copy";
import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import { FileText, History, MessageSquare, Search, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ADD_ITEMS } from "@/components/sites/rich-text/writing-menus";

import type { PostEditorModel } from "./post-model";

/** Where Find sends you in the post editor's frame. */
export interface PostFindActions {
    details: () => void;
    search: () => void;
    feedback: (() => void) | null;
    history: (() => void) | null;
    add: () => void;
    publish: () => void;
}

/** One row of the post's Find, as the site editor's Find has them. */
export interface PostFindRow {
    key: string;
    group: "here" | "site" | "add";
    icon: LucideIcon;
    label: string;
    detail: string;
    where: string;
    words?: string;
    run: () => void;
}

/**
 * Every word typed is in the row's words, in any order: the site editor's
 * rule (`command-menu.tsx` `findMatches`), not imported, as that module
 * pulls in the site editor's settings sheets.
 */
export function postFindMatches(row: PostFindRow, query: string): boolean {
    const hay =
        `${row.label} ${row.detail} ${row.where} ${row.words ?? ""}`.toLowerCase();
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => hay.includes(word));
}

/** Find's rows for one post (W6): do it here, add to the post, other posts. */
export function postFindRows(
    model: PostEditorModel,
    editor: Editor | null,
    go: PostFindActions,
    openPost: (id: string) => void,
): PostFindRow[] {
    const { data, draft } = model;
    const writes = !data.readOnly && !data.paused;
    const row = (
        key: string,
        icon: LucideIcon,
        label: string,
        detail: string,
        run: () => void,
        words?: string,
    ) => ({
        key,
        group: "here" as const,
        icon,
        label,
        detail,
        where: "This post",
        words,
        run,
    });
    const here = [
        row(
            "details",
            FileText,
            "Details",
            "Category, short description, cover",
            go.details,
            "category excerpt cover written",
        ),
        row(
            "search",
            Search,
            "Search and sharing",
            "Google title and text, page link",
            go.search,
            "seo google link slug share",
        ),
        ...(go.feedback
            ? [
                  row(
                      "feedback",
                      MessageSquare,
                      "Feedback",
                      "What reviewers said",
                      go.feedback,
                      "notes comments",
                  ),
              ]
            : []),
        ...(go.history
            ? [
                  row(
                      "history",
                      History,
                      "History",
                      "Every version of this post",
                      go.history,
                      "versions restore",
                  ),
              ]
            : []),
        ...(writes
            ? [
                  row(
                      "publish",
                      Send,
                      "Publish post",
                      "Checks, when, and who to tell",
                      go.publish,
                      "live schedule",
                  ),
              ]
            : []),
    ];
    const add =
        writes && editor
            ? ADD_ITEMS.map((i) => ({
                  key: `add-${i.key}`,
                  group: "add" as const,
                  icon: i.icon,
                  label: i.label,
                  detail: "Adds where the cursor is",
                  where: "Add",
                  words: "add insert",
                  run: i.run ? () => i.run?.(editor) : go.add,
              }))
            : [];
    const posts = (data.posts ?? [])
        .filter((p) => p.id !== draft.postId)
        .map((p) => ({
            key: `post-${p.id}`,
            group: "site" as const,
            icon: FileText,
            label: p.title,
            detail: `/${data.postsPrefix}/${p.slug}`,
            where: "Open post",
            words: "post open",
            run: () => openPost(p.id),
        }));
    return [...here, ...add, ...posts];
}

/**
 * Find (⌘K) in the post editor (W6, `blogdesk/WXWStates`): one search for
 * this post's panels, everything Add puts in, and the site's other posts.
 * The site editor's Find (`command-menu.tsx`) with a post's rows.
 */
export function PostFind({
    model,
    editor,
    go,
    open,
    onOpenChange,
}: {
    model: PostEditorModel;
    editor: Editor | null;
    go: PostFindActions;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const q = query.trim();
    const rows = postFindRows(model, editor, go, (id) =>
        router.push(`/sites/${model.data.siteId}/write/${id}`),
    ).filter((r) => postFindMatches(r, q));
    const groups = [
        { heading: "This post", rows: rows.filter((r) => r.group === "here") },
        {
            heading: "Add to the post",
            rows: rows.filter((r) => r.group === "add"),
        },
        {
            heading: "Other posts",
            rows: rows.filter((r) => r.group === "site"),
        },
    ].filter((g) => g.rows.length > 0);
    const close = () => {
        onOpenChange(false);
        setQuery("");
    };
    return (
        <CommandDialog
            open={open}
            onOpenChange={(next) => (next ? onOpenChange(true) : close())}
            shouldFilter={false}
            label="Find or do anything"
            description="Open a panel, add to the post or open another post, without leaving the editor."
        >
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Find or do anything"
            />
            <CommandList data-post-find="">
                <CommandEmpty>
                    {noMatchLine("panels, blocks or posts", q)}
                </CommandEmpty>
                {groups.map((g) => (
                    <CommandGroup key={g.heading} heading={g.heading}>
                        {g.rows.map((r) => (
                            <CommandItem
                                key={r.key}
                                value={r.key}
                                onSelect={() => {
                                    close();
                                    r.run();
                                }}
                                className="gap-3"
                            >
                                <r.icon aria-hidden className="shrink-0" />
                                <span className="grid min-w-0 flex-1">
                                    <span
                                        data-ph-mask=""
                                        className="truncate font-medium"
                                    >
                                        {r.label}
                                    </span>
                                    <span
                                        data-ph-mask=""
                                        className="truncate text-xs text-muted-foreground"
                                    >
                                        {r.detail}
                                    </span>
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">
                                    {r.where}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
