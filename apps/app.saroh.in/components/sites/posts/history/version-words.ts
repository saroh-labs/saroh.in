import type { PostRevisionRow } from "@/lib/content/service";
import { localDateKey } from "@/lib/format/datetime";

/** Why a version was kept, in the History list's words. */
export function revisionWhy(row: PostRevisionRow): string {
    switch (row.reason) {
        case "autosave":
            return "autosaved";
        case "published":
            return "published";
        case "restored":
            return "an earlier version restored";
        case "ask_ai":
            return "Ask AI suggestion accepted";
        case "not_published":
            return row.note ?? "didn't go live";
    }
}

/** Today's versions, then the rest, newest first (as the API sends them). */
export function groupVersions(
    rows: PostRevisionRow[],
    zone: string,
    now: Date = new Date(),
): { day: "Today" | "Earlier"; rows: PostRevisionRow[] }[] {
    const today = localDateKey(now, zone);
    const groups = [
        {
            day: "Today" as const,
            rows: rows.filter((r) => localDateKey(r.createdAt, zone) === today),
        },
        {
            day: "Earlier" as const,
            rows: rows.filter((r) => localDateKey(r.createdAt, zone) !== today),
        },
    ];
    return groups.filter((g) => g.rows.length > 0);
}
