import type { TrackerKind } from "@saroh/block-contract";
import { TRACKER_KINDS } from "@saroh/block-contract";

/**
 * The tools most shops connect, shown first (Website › Settings audit):
 * Google Analytics, Meta Pixel and Google Ads.
 */
export const COMMON_TRACKERS: readonly TrackerKind[] = [
    "ga4",
    "meta-pixel",
    "google-ads",
];

/**
 * The trackers list in two parts: the common tools and every connected
 * one, always shown; the rest, folded behind "N more tools". A connected
 * tool is never folded away, whatever it is.
 */
export function splitTrackers(connected: ReadonlySet<TrackerKind>): {
    shown: TrackerKind[];
    folded: TrackerKind[];
} {
    const shown = [
        ...COMMON_TRACKERS,
        ...TRACKER_KINDS.filter(
            (k) => !COMMON_TRACKERS.includes(k) && connected.has(k),
        ),
    ];
    const folded = TRACKER_KINDS.filter((k) => !shown.includes(k));
    return { shown, folded };
}

/** "4 more tools", "1 more tool". */
export function moreToolsLine(count: number): string {
    return count === 1 ? "1 more tool" : `${count} more tools`;
}
