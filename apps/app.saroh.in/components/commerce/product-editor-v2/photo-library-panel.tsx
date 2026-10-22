"use client";

import { FailedRead } from "@/components/shared/states/failed-read";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import { useEffect, useState } from "react";

import { listLibrary } from "@/lib/media/actions";
import type { LibraryItem } from "@/lib/media/service";
import type { PhotoDraft } from "@/lib/products/editor-sections";

/**
 * "From your photos": the business's library, read once when it opens, to
 * add a photo to the product or take one off — never deleting it from the
 * library, where other products may use it.
 */
export function LibraryPanel({
    chosen,
    full,
    onToggle,
    onDone,
}: {
    chosen: PhotoDraft[];
    full: boolean;
    onToggle: (item: LibraryItem) => void;
    onDone: () => void;
}) {
    const [items, setItems] = useState<LibraryItem[] | null | "loading">(
        "loading",
    );
    // Read when the panel opens, and again on Try again.
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let live = true;
        void listLibrary().then((list) => {
            if (live) setItems(list);
        });
        return () => {
            live = false;
        };
    }, [attempt]);
    return (
        <div className="mt-3 rounded-[10px] bg-muted/50 p-3">
            <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] font-semibold">
                    Your photos · tap to add or take off
                </span>
                <Button size="xs" type="button" onClick={onDone}>
                    Done
                </Button>
            </div>
            {items === "loading" ? (
                <div role="status" aria-busy="true" className="flex gap-2">
                    <span className="sr-only">Loading your photos</span>
                    <Skeleton aria-hidden className="h-16 w-20" />
                    <Skeleton aria-hidden className="h-16 w-20" />
                    <Skeleton aria-hidden className="h-16 w-20" />
                </div>
            ) : items === null ? (
                <FailedRead
                    things="your photos"
                    reassurance="You can still upload one."
                    onRetry={() => {
                        setItems("loading");
                        setAttempt((n) => n + 1);
                    }}
                />
            ) : items.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No photos in your library yet"
                    description="Upload one."
                />
            ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
                    {items.map((item) => {
                        const on = chosen.some(
                            (p) => p.mediaId === item.id || p.url === item.url,
                        );
                        const off = !on && full;
                        return (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    aria-pressed={on}
                                    disabled={off}
                                    onClick={() => onToggle(item)}
                                    aria-label={`${item.filename}${on ? ", on this product. Take it off." : ". Add it."}`}
                                    className={cn(
                                        "w-full overflow-hidden rounded-[8px] bg-card text-left disabled:cursor-not-allowed disabled:text-disabled-foreground",
                                        on
                                            ? "border-[1.5px] border-foreground"
                                            : "border border-border",
                                    )}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a tenant's own photos */}
                                    <img
                                        src={item.url ?? ""}
                                        alt=""
                                        className="aspect-[4/3] w-full object-cover"
                                    />
                                    <span className="block truncate px-1.5 py-[5px] text-[11px]">
                                        {item.filename}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
