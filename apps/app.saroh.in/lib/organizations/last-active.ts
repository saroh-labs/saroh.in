/**
 * The line under a person's name on Team → People that says when they were
 * last around ("Saroh Settings" design v4).
 *
 * Pure, so the words can be pinned without a browser. The API's
 * `lastActiveAt` is the newest session the person holds — their last activity
 * anywhere in Saroh, and a floor, since a session is only touched at sign-in
 * and at most daily after — so "Active now" means within the last few
 * minutes, and anything older is counted in calendar days.
 */

/** "Active now" holds for this long after the last touch. */
const NOW_WINDOW_MS = 5 * 60 * 1000;

/** From this many days, the line turns Saffron: someone may have left. */
const STALE_DAYS = 30;

export interface LastActive {
    text: string;
    /** A month or more — worth a second look at whether they still need access. */
    stale: boolean;
}

/**
 * What to say, or `null` when there is nothing true to say — they hold no
 * session. That is not "never signed in": sessions expire and are cleared, so
 * someone long gone reads the same as someone brand new.
 */
export function lastActive(
    at: string | Date | null | undefined,
    now: Date = new Date(),
): LastActive | null {
    if (!at) return null;
    const when = new Date(at);
    if (Number.isNaN(when.getTime())) return null;

    if (now.getTime() - when.getTime() <= NOW_WINDOW_MS) {
        return { text: "Active now", stale: false };
    }

    const days = calendarDaysBetween(when, now);
    if (days <= 0) return { text: "Active today", stale: false };
    if (days === 1) return { text: "Active yesterday", stale: false };
    if (days < STALE_DAYS) {
        return { text: `Active ${days} days ago`, stale: false };
    }
    return { text: `Last active ${days} days ago`, stale: true };
}

/** Whole local days from `from` to `to`, ignoring the time of day. */
function calendarDaysBetween(from: Date, to: Date): number {
    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
