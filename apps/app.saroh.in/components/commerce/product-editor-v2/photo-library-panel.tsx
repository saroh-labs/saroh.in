"use client";

import { cn } from "@saroh/ui/lib/utils";
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
    // Read once, when the panel opens.
    useEffect(() => {
        let live = true;
        void listLibrary().then((list) => {
            if (live) setItems(list);
        });
        return () => {
            live = false;
        };
    }, []);
    return (
        <div className="mt-3 rounded-[10px] bg-muted/50 p-3">
            <div className="mb-2.5 flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] font-semibold">
                    Your photos · tap to add or take off
                </span>
                <button
                    type="button"
                    onClick={onDone}
                    className="h-7 rounded-[7px] bg-foreground px-[11px] text-[12px] font-semibold text-background hover:bg-foreground/90 coarse:h-11"
                >
                    Done
                </button>
            </div>
            {items === "loading" ? (
                <p role="status" className="text-[12px] text-muted-foreground">
                    Loading your photos…
                </p>
            ) : items === null ? (
                <p role="alert" className="text-[12px] text-destructive">
                    Couldn&apos;t load your photos. Close this and try again, or
                    upload one.
                </p>
            ) : items.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">
                    No photos in your library yet — upload one.
                </p>
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
                                        "w-full overflow-hidden rounded-[8px] bg-card text-left disabled:cursor-not-allowed disabled:opacity-50",
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
