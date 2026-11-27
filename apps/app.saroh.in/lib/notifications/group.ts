import type { Notification } from "./service";

/**
 * Repeats as one row (DEC-278): notices of one kind that came in the same
 * day sit under the newest, with a count, so "Google Calendar is behind"
 * four times is one line and the one row that needs you isn't lost among
 * them. A booking is never folded: each is a different person at a
 * different time, and the desk acts on each.
 */
export interface NoticeRun {
    head: Notification;
    /** The older ones of its kind, newest first; empty for a single. */
    rest: Notification[];
}

export function isBookingNotice(n: Pick<Notification, "type">): boolean {
    return n.type.startsWith("booking.");
}

/** `rows` newest first, in runs by kind; the order of each run's newest. */
export function groupRepeats(rows: Notification[]): NoticeRun[] {
    const runs: NoticeRun[] = [];
    const byType = new Map<string, NoticeRun>();
    for (const n of rows) {
        const run = isBookingNotice(n) ? undefined : byType.get(n.type);
        if (run) {
            run.rest.push(n);
            continue;
        }
        const fresh: NoticeRun = { head: n, rest: [] };
        runs.push(fresh);
        if (!isBookingNotice(n)) byType.set(n.type, fresh);
    }
    return runs;
}
