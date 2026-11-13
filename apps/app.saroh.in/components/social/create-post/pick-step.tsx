"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListFilter, ListToolbar } from "@saroh/ui/list-toolbar";
import { CalendarDays, ImageIcon, Pencil, Tag, Type } from "lucide-react";
import { useState } from "react";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import type { PickFilter, PickRow } from "@/lib/social/pick";
import {
    DRAFT_WHY,
    FILTER_NAMES,
    filterRows,
    PICK_FILTERS,
} from "@/lib/social/pick";
import { POST_WORDS } from "@/lib/social/words";

/**
 * What to post (SGPickDesk, SGPickPhone): Your own post first, then the
 * business's live things, searchable and filtered by kind. A draft is
 * greyed with why and can't be picked.
 */
export function PickStep({
    rows,
    picked,
    onPick,
    canPost,
    onOwn,
}: {
    rows: readonly PickRow[];
    picked: string | null;
    onPick: (key: string) => void;
    /** `social:post`: may make an own post. */
    canPost: boolean;
    onOwn: (mode: "photo" | "text") => void;
}) {
    const [filter, setFilter] = useState<PickFilter>("all");
    const [search, setSearch] = useState("");
    const shown = filterRows(rows, filter, search);
    return (
        <section aria-label={POST_WORDS.whatToPostPhone} className="grid gap-4">
            <h2 className="text-[15px] font-semibold max-sm:sr-only">
                {POST_WORDS.whatToPost}
            </h2>
            <OwnPostCard canPost={canPost} onOwn={onOwn} />
            <p className="label flex items-center gap-3 text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                {POST_WORDS.orPick}
            </p>
            <ListToolbar
                search={
                    <ListSearch
                        placeholder={POST_WORDS.search}
                        onSearch={setSearch}
                        shortcut={false}
                    />
                }
                filters={
                    <ListFilter<PickFilter>
                        label="Show"
                        value={filter}
                        narrowed={filter !== "all"}
                        onValueChange={setFilter}
                        options={PICK_FILTERS.map((f) => ({
                            value: f,
                            label: FILTER_NAMES[f],
                        }))}
                    />
                }
            />
            <p className="text-[13px] text-muted-foreground max-sm:hidden">
                {POST_WORDS.recentFirst}
            </p>
            {shown.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13.5px] text-muted-foreground">
                    {rows.length === 0
                        ? POST_WORDS.nothingYet
                        : POST_WORDS.nothing}
                </p>
            ) : (
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                    {shown.map((row) => (
                        <PickRowItem
                            key={row.key}
                            row={row}
                            on={row.key === picked}
                            onPick={() => onPick(row.key)}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

/** Your own post, at the top (SGPick*): Use a photo or Text only. */
function OwnPostCard({
    canPost,
    onOwn,
}: {
    canPost: boolean;
    onOwn: (mode: "photo" | "text") => void;
}) {
    return (
        <div
            data-own-post=""
            className="grid gap-3 rounded-xl border-[1.5px] border-foreground bg-card p-4 sm:flex sm:items-center"
        >
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[9px] bg-foreground text-background">
                    <Pencil aria-hidden className="size-4" />
                </span>
                <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                        {POST_WORDS.own}
                    </p>
                    <p className="text-[13px] leading-[1.45] text-muted-foreground">
                        <span className="max-sm:hidden">
                            {POST_WORDS.ownWhat}{" "}
                        </span>
                        {POST_WORDS.ownExamples}
                    </p>
                </div>
            </div>
            {canPost ? (
                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => onOwn("photo")}
                    >
                        <ImageIcon aria-hidden className="size-4" />
                        {POST_WORDS.usePhoto}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => onOwn("text")}
                    >
                        <Type aria-hidden className="size-4" />
                        {POST_WORDS.textOnly}
                    </Button>
                </div>
            ) : (
                <p
                    data-no-own-posts=""
                    className="text-pretty text-[13px] leading-[1.45] text-muted-foreground sm:max-w-[260px]"
                >
                    {POST_WORDS.noOwnPosts}
                </p>
            )}
        </div>
    );
}

/** One row: the whole row picks it, as its Pick does at a desk. */
function PickRowItem({
    row,
    on,
    onPick,
}: {
    row: PickRow;
    on: boolean;
    onPick: () => void;
}) {
    const draft = row.item === null;
    const body = (
        <>
            <Thumb row={row} />
            <span className="min-w-0 flex-1">
                <span
                    data-ph-mask=""
                    className="block truncate text-[14.5px] font-semibold"
                >
                    {row.name}
                </span>
                <span className="block truncate text-[13px] text-muted-foreground">
                    {row.line}
                </span>
                {draft ? (
                    <span className="block text-pretty text-[13px] text-muted-foreground sm:hidden">
                        {DRAFT_WHY}
                    </span>
                ) : null}
            </span>
            {draft ? (
                <>
                    <StatusBadge tone="draft">{POST_WORDS.draft}</StatusBadge>
                    <span className="max-w-[160px] text-pretty text-[13px] leading-[1.4] text-muted-foreground max-sm:hidden">
                        {DRAFT_WHY}
                    </span>
                </>
            ) : (
                <>
                    <StatusBadge tone="live">{POST_WORDS.live}</StatusBadge>
                    <span
                        aria-hidden
                        className={cn(
                            "inline-flex h-8 items-center rounded-[8px] border px-3 text-[13px] font-semibold max-sm:hidden",
                            on
                                ? "border-foreground bg-foreground text-background"
                                : "border-border bg-card",
                        )}
                    >
                        {on ? POST_WORDS.picked : POST_WORDS.pick}
                    </span>
                </>
            )}
        </>
    );
    return (
        <li
            data-pick-row={row.kind}
            data-draft={draft ? "" : undefined}
            className="border-b border-border last:border-b-0"
        >
            {draft ? (
                <div className="flex items-center gap-3 px-3.5 py-2.5 opacity-70">
                    {body}
                </div>
            ) : (
                <button
                    type="button"
                    aria-pressed={on}
                    onClick={onPick}
                    className={cn(
                        "flex w-full items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                        on
                            ? "border-l-warning bg-warning-subtle"
                            : "border-l-transparent hover:bg-muted/60",
                    )}
                >
                    {body}
                </button>
            )}
        </li>
    );
}

function Thumb({ row }: { row: PickRow }) {
    if (row.image) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- the business's own photo from its library
            <img
                src={row.image}
                alt=""
                className="size-11 shrink-0 rounded-[8px] object-cover"
            />
        );
    }
    const Icon =
        row.kind === "book"
            ? CalendarDays
            : row.kind === "offer"
              ? Tag
              : ImageIcon;
    return (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[8px] bg-muted text-muted-foreground">
            <Icon aria-hidden className="size-4" />
        </span>
    );
}
