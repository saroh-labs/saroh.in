/**
 * List reads are capped by the API (500 rows, newest first) and the screens
 * filter in the browser. So a page reads the newest rows AND everything still
 * live — an unpaid invoice, an active subscription — however old, and says
 * when the older history was cut off. Without the second read, an invoice
 * older than the newest 500 would silently vanish from Overdue.
 */

/** The most rows one API list read returns. */
export const LIST_LIMIT = 500;

export interface CappedList<T> {
    rows: T[];
    /** The newest-first read hit the cap, so older finished rows are missing. */
    truncated: boolean;
}

/** The newest rows, then any live ones not already among them. */
export function withLive<T extends { id: string }>(
    newest: readonly T[],
    ...live: (readonly T[])[]
): CappedList<T> {
    const seen = new Set(newest.map((r) => r.id));
    const rows = [...newest];
    for (const list of live) {
        for (const r of list) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            rows.push(r);
        }
    }
    return { rows, truncated: newest.length >= LIST_LIMIT };
}
