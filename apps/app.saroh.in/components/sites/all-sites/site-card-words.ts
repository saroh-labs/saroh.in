import { formatRecent } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { SiteSummary } from "@/lib/sites/service";

/** "297 visits, last 7 days", or null when the API didn't count them. */
export function visitsLine(visits: number | null | undefined): string | null {
    if (visits === null || visits === undefined) return null;
    return `${count(visits, "visit")}, last 7 days`;
}

/**
 * "Ritika edited 2:40 pm", "Mohit published 9 Nov", "Edited 3 Nov" with no
 * name (A4), or null when the API didn't say.
 */
export function lastActivityLine(
    activity: SiteSummary["lastActivity"],
    timeZone: string,
    now: Date = new Date(),
): string | null {
    if (!activity) return null;
    const when = formatRecent(activity.at, timeZone, now);
    return activity.by
        ? `${activity.by} ${activity.kind} ${when}`
        : `${activity.kind === "edited" ? "Edited" : "Published"} ${when}`;
}
