"use client";

import { ListSearch } from "@saroh/ui/list-search";

/** A list longer than this offers "Search shades" (products audit, 16 Oct). */
export const FIND_FROM = 12;

/** Whether a row's words hold what was typed, letter case aside. */
export function matchesFind(find: string, ...words: string[]): boolean {
    const q = find.trim().toLowerCase();
    if (!q) return true;
    return words.some((w) => w.toLowerCase().includes(q));
}

/**
 * The search over a long list of variants or their counts (`ListSearch`,
 * the app's one list search): narrows what is drawn, never what is saved.
 */
export function FindRow({
    label,
    value,
    onChange,
    shown,
    total,
}: {
    /** "Search shades". */
    label: string;
    value: string;
    onChange: (value: string) => void;
    shown: number;
    total: number;
}) {
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
            <ListSearch
                placeholder={label}
                defaultValue={value}
                onSearch={onChange}
            />
            <span
                role="status"
                className="shrink-0 text-[11.5px] text-muted-foreground"
            >
                {value.trim() ? `${shown} of ${total}` : `${total} in all`}
            </span>
        </div>
    );
}
