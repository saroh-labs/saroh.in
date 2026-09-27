import type { SearchParams } from "./search-params";

/**
 * The `?since=` contract (round 2, F6): Home's "Last 24 hours" links land
 * on a list narrowed to the rows from that instant on, so "3 new orders"
 * opens those three and not every order. The instant is Home's own, carried
 * in the link, so the list and the count agree to the second rather than
 * each measuring 24 hours from when it was opened.
 *
 * Anything that isn't an instant up to now is no filter: a malformed or
 * hand-edited link shows the whole list, never an empty one.
 */
export function sinceParam(
    params: SearchParams | undefined,
    now: Date = new Date(),
): Date | null {
    const raw = params?.since;
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) return null;
    // A minute's grace for two clocks; later than that isn't a link Home made.
    if (at.getTime() > now.getTime() + 60_000) return null;
    return at;
}

/** Whether a row's instant falls in the window; a row without one doesn't. */
export function isSince(
    iso: string | null | undefined,
    since: Date | null,
): boolean {
    if (!since) return true;
    if (!iso) return false;
    const at = new Date(iso).getTime();
    return !Number.isNaN(at) && at >= since.getTime();
}

/** The same address without the window: "Show all". */
export function withoutSince(path: string, params: SearchParams): string {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (key === "since" || value === undefined) continue;
        for (const v of Array.isArray(value) ? value : [value])
            q.append(key, v);
    }
    const s = q.toString();
    return s ? `${path}?${s}` : path;
}
