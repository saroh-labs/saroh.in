"use client";

import { usePathname } from "next/navigation";

import { SearchPageSkeleton } from "@/components/search-pages/page-skeleton";
import { ConsolePageShape } from "@/components/states/console-page-shape";

/**
 * Search pages on their way, inside the console that stays (owner, 1 Nov):
 * a page's shape for ‹ Previous / Next › and a row opened from the list,
 * the list's shape on the way back. One boundary for both: a new page
 * address changes this segment, so a loading file under `[slug]` never shows.
 */
export default function Loading() {
    const onePage = usePathname().split("/").filter(Boolean).length > 1;
    return onePage ? (
        <SearchPageSkeleton />
    ) : (
        <ConsolePageShape shape="list" label="Loading search pages" />
    );
}
