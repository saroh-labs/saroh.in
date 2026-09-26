"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { CategoryNode } from "@/lib/collections/rules";
import {
    collectionNote,
    oneWebsiteLine,
    websiteLine,
} from "@/lib/collections/rules";
import type { CollectionSummary } from "@/lib/collections/service";

import { CollectionSheet } from "./collection-sheet";

/**
 * The Products list's Collections chip (#524): a card per collection —
 * hand-picked or automatic, how many products it shows, and where the
 * website shows it — above the products that are in one. A card narrows
 * the list to that collection; Edit opens the collection sheet, and New
 * collection makes one. A role without `store:write` opens the same sheet
 * read-only.
 *
 * `openNew`: the address asked for the sheet (`?new=collection`, the empty
 * state's New collection); closing it leaves the address without it.
 */
export function CollectionsPanel({
    collections,
    categories,
    canWrite,
    activeId,
    hrefs,
    clearHref,
    openNew,
    closeNewHref,
}: {
    /** Null: they couldn't be read. */
    collections: CollectionSummary[] | null;
    categories: CategoryNode[];
    canWrite: boolean;
    /** The collection the list is narrowed to. */
    activeId: string | null;
    /** The list narrowed to each collection, by id. */
    hrefs: Record<string, string>;
    /** The list narrowed to none. */
    clearHref: string;
    openNew: boolean;
    closeNewHref: string;
}) {
    const router = useRouter();
    const [sheet, setSheet] = useState<{ id: string | null } | null>(
        openNew && canWrite ? { id: null } : null,
    );
    // A new address asking for the sheet opens it (adjusted while
    // rendering, not in an effect).
    const [asked, setAsked] = useState(openNew);
    if (asked !== openNew) {
        setAsked(openNew);
        if (openNew && canWrite) setSheet({ id: null });
    }

    function close() {
        setSheet(null);
        if (openNew) router.replace(closeNewHref, { scroll: false });
    }

    const host = (
        <CollectionSheet
            open={sheet !== null}
            onOpenChange={(o) => {
                if (!o) close();
            }}
            collectionId={sheet?.id ?? null}
            categories={categories}
            canWrite={canWrite}
        />
    );

    if (collections === null) {
        return (
            <>
                <PartialNotice>
                    Collections couldn&apos;t be read just now, so they
                    aren&apos;t shown here. The products below are current.
                </PartialNotice>
                {host}
            </>
        );
    }
    // None yet: the list's empty state says so, with New collection.
    if (collections.length === 0) return host;

    const footnote = oneWebsiteLine(collections);
    return (
        <section aria-labelledby="collections-heading" className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <h2
                    id="collections-heading"
                    className="flex-1 text-[12.5px] font-semibold"
                >
                    {collections.length}{" "}
                    {collections.length === 1 ? "collection" : "collections"}
                </h2>
                {canWrite ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSheet({ id: null })}
                        className="h-[26px] gap-[5px] rounded-[7px] px-[9px] text-[12px] coarse:h-11"
                    >
                        <Plus className="size-3" strokeWidth={2} aria-hidden />
                        New collection
                    </Button>
                ) : null}
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-2.5">
                {collections.map((c) => {
                    const on = c.id === activeId;
                    const web = footnote ? null : websiteLine(c.website);
                    return (
                        <li
                            key={c.id}
                            className={cn(
                                "relative min-w-0 rounded-[12px] border bg-card px-4 py-[13px]",
                                on ? "border-foreground" : "border-border",
                            )}
                        >
                            <div className="flex items-baseline gap-2">
                                <Link
                                    href={
                                        on
                                            ? clearHref
                                            : (hrefs[c.id] ?? clearHref)
                                    }
                                    scroll={false}
                                    aria-current={on ? "true" : undefined}
                                    className="min-w-0 flex-1 truncate text-[14px] font-semibold text-foreground after:absolute after:inset-0 after:rounded-[12px] hover:underline"
                                >
                                    {c.name}
                                </Link>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setSheet({ id: c.id })}
                                    aria-label={`${canWrite ? "Edit" : "Open"} ${c.name}`}
                                    className="relative z-[1] h-[26px] gap-[5px] rounded-[7px] px-[7px] text-[12px] text-brand coarse:h-11"
                                >
                                    {canWrite ? (
                                        <Pencil
                                            className="size-3"
                                            strokeWidth={2}
                                            aria-hidden
                                        />
                                    ) : null}
                                    {canWrite ? "Edit" : "Open"}
                                </Button>
                            </div>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                {collectionNote(c)}
                            </p>
                            {web ? (
                                <p className="mt-0.5 text-[12px] text-muted-foreground">
                                    {web}
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
            {footnote ? (
                <p className="text-[11.5px] leading-[1.5] text-muted-foreground">
                    {footnote}
                </p>
            ) : null}
            {host}
        </section>
    );
}
