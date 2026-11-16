"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ListFilter, ListToolbar } from "@saroh/ui/list-toolbar";
import { TextLink } from "@saroh/ui/text-link";
import { Camera, ChevronRight, Pencil } from "lucide-react";
import { useState } from "react";

import { DrawnCard } from "@/components/shared/share-item/insta-frame";
import type { ShareSetup } from "@/lib/share-item/share";
import { cardImageUrl, firstStyle, markColour } from "@/lib/share-item/share";
import type { PickFilter, PickRow } from "@/lib/social/pick";
import { DRAFT_WHY, filterRows, PICK_FILTERS } from "@/lib/social/pick";
import { draftsHidden, PICK_CHIP_NAMES, POST_WORDS } from "@/lib/social/words";

/**
 * What to post (boards BPickDesk, BPickPhone): Your own post first, then
 * what the business sells, each drawn as the post it makes. A tap opens
 * it, finished. Drafts are left out and counted, with Show them: shown,
 * each is greyed with why and can't be opened.
 */
export function PickStep({
    rows,
    setup,
    canPost,
    narrow,
    onOpen,
    onOwn,
}: {
    rows: readonly PickRow[];
    setup: ShareSetup;
    /** `social:post`: may make an own post. */
    canPost: boolean;
    narrow: boolean;
    onOpen: (key: string) => void;
    onOwn: (mode: "photo" | "text") => void;
}) {
    const [filter, setFilter] = useState<PickFilter>("all");
    const [search, setSearch] = useState("");
    const [drafts, setDrafts] = useState(false);
    const live = rows.filter((r) => r.item !== null);
    const hidden = rows.length - live.length;
    const shown = filterRows(drafts ? rows : live, filter, search);
    const count = (f: PickFilter) =>
        f === "all" ? live.length : live.filter((r) => r.kind === f).length;
    const filters = PICK_FILTERS.filter((f) => f === "all" || count(f) > 0);

    return (
        <div className="grid gap-6" data-pick-step="">
            <OwnPostCard
                setup={setup}
                canPost={canPost}
                narrow={narrow}
                onOwn={onOwn}
            />
            <section aria-labelledby="pick-sell" className="grid gap-4">
                <div className="grid gap-3">
                    <h2
                        id="pick-sell"
                        className="text-[18px] font-semibold tracking-[-0.01em] max-sm:sr-only"
                    >
                        {POST_WORDS.orSell}
                    </h2>
                    <ListToolbar
                        search={
                            <ListSearch
                                placeholder={POST_WORDS.searchShort}
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
                                options={filters.map((f) => ({
                                    value: f,
                                    label: `${PICK_CHIP_NAMES[f]} ${count(f)}`,
                                }))}
                            />
                        }
                    />
                </div>
                {shown.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13.5px] text-muted-foreground">
                        {live.length === 0 && !drafts
                            ? POST_WORDS.nothingYet
                            : POST_WORDS.nothing}
                    </p>
                ) : (
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        {shown.map((row) => (
                            <li key={row.key}>
                                <PickTile
                                    row={row}
                                    setup={setup}
                                    onOpen={onOpen}
                                />
                            </li>
                        ))}
                    </ul>
                )}
                {hidden > 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                        {draftsHidden(hidden, drafts)}{" "}
                        <TextLink
                            onClick={() => setDrafts((d) => !d)}
                            aria-expanded={drafts}
                            className="font-semibold"
                        >
                            {drafts ? POST_WORDS.hideThem : POST_WORDS.showThem}
                        </TextLink>
                    </p>
                ) : null}
            </section>
        </div>
    );
}

/** One thing, as the post it makes; a draft greyed, with why. */
function PickTile({
    row,
    setup,
    onOpen,
}: {
    row: PickRow;
    setup: ShareSetup;
    onOpen: (key: string) => void;
}) {
    const item = row.item;
    return (
        <button
            type="button"
            disabled={!item}
            onClick={() => onOpen(row.key)}
            data-pick={row.key}
            className="group flex w-full flex-col gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
        >
            <span className="flex justify-center rounded-xl bg-muted p-3 transition-colors group-hover:bg-accent group-disabled:bg-muted">
                <span className="block aspect-[4/5] w-full max-w-[120px] overflow-hidden rounded-[4px] bg-card shadow-md">
                    {item ? (
                        <DrawnCard
                            src={cardImageUrl(
                                setup,
                                item,
                                firstStyle(item),
                                "post",
                                { w: 240 },
                            )}
                            lazy
                            className="size-full"
                        />
                    ) : null}
                </span>
            </span>
            <span className="min-w-0">
                <b
                    data-ph-mask=""
                    className={cn(
                        "block truncate text-[14px] font-semibold",
                        !item && "text-muted-foreground",
                    )}
                >
                    {row.name}
                </b>
                <span className="block truncate text-[12.5px] text-muted-foreground">
                    {row.line}
                </span>
                {item ? null : (
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {DRAFT_WHY}
                    </span>
                )}
            </span>
        </button>
    );
}

/** A small card in the site's first colour: what an own post looks like. */
export function OwnThumb({
    setup,
    className,
}: {
    setup: ShareSetup;
    className?: string;
}) {
    const colour = markColour(setup.swatches);
    return (
        <span
            aria-hidden
            className={cn(
                "flex aspect-[4/5] shrink-0 items-center justify-center rounded-[4px] bg-foreground p-1.5 text-center text-[11px] font-semibold leading-[1.1] text-background shadow-md",
                className,
            )}
            style={colour ? { background: colour } : undefined}
        >
            {POST_WORDS.ownThumb}
        </span>
    );
}

/** Your own post (BPick*): a headline, or your photo. */
function OwnPostCard({
    setup,
    canPost,
    narrow,
    onOwn,
}: {
    setup: ShareSetup;
    canPost: boolean;
    narrow: boolean;
    onOwn: (mode: "photo" | "text") => void;
}) {
    if (narrow && canPost) {
        return (
            <button
                type="button"
                onClick={() => onOwn("text")}
                data-own-start="text"
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <OwnThumb setup={setup} className="w-14" />
                <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold">
                        {POST_WORDS.own}
                    </b>
                    <span className="block text-[13px] text-muted-foreground">
                        {POST_WORDS.ownShort}
                    </span>
                </span>
                <ChevronRight aria-hidden className="size-4" />
            </button>
        );
    }
    return (
        <section
            aria-label={POST_WORDS.own}
            className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-border bg-card px-[18px] py-4"
        >
            <OwnThumb setup={setup} className="w-[76px]" />
            <div className="min-w-0 flex-1 basis-[280px]">
                <h2 className="text-[16px] font-semibold">{POST_WORDS.own}</h2>
                <p className="mt-1 text-[14px] text-muted-foreground">
                    {canPost ? POST_WORDS.ownWhat : POST_WORDS.noOwnPosts}
                </p>
            </div>
            {canPost ? (
                <div className="flex flex-wrap gap-3">
                    <Button
                        type="button"
                        size="lg"
                        className="h-11 gap-2"
                        onClick={() => onOwn("text")}
                        data-own-start="text"
                    >
                        <Pencil aria-hidden className="size-4" />
                        {POST_WORDS.writeHeadline}
                    </Button>
                    <Button
                        type="button"
                        size="lg"
                        variant="outline"
                        className="h-11 gap-2 bg-card"
                        onClick={() => onOwn("photo")}
                        data-own-start="photo"
                    >
                        <Camera aria-hidden className="size-4" />
                        {POST_WORDS.usePhoto}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}
