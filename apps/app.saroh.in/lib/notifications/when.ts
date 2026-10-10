/**
 * When a notification came in, as the inbox says it (10 Oct 2026): how
 * long ago while that is the useful answer, then the day. And which group
 * it sits in: Today, or Earlier.
 *
 * Days are the business's (`timeZone`), so "today" is the day the shop is
 * having. Pure: `now` is passed in, so the server and the browser say the
 * same thing from the same instant.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `2026-10-10`, the calendar day of an instant in a zone. */
function dayKey(at: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(at);
}

export type NoticeGroup = "today" | "earlier";

/** Today in the business's zone, or before it. */
export function noticeGroup(
    iso: string,
    now: Date,
    timeZone: string,
): NoticeGroup {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "earlier";
    return dayKey(at, timeZone) === dayKey(now, timeZone) ? "today" : "earlier";
}

/**
 * "Just now", "5 min ago", "2 hr ago", "Yesterday", "3 days ago", then the
 * date: "22 Sep", with the year once it isn't this one.
 */
export function relativeWhen(iso: string, now: Date, timeZone: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const ago = now.getTime() - at.getTime();
    const sameDay = dayKey(at, timeZone) === dayKey(now, timeZone);
    if (sameDay || ago < HOUR) {
        if (ago < MINUTE) return "Just now";
        if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
        return `${Math.floor(ago / HOUR)} hr ago`;
    }
    if (
        dayKey(at, timeZone) === dayKey(new Date(now.getTime() - DAY), timeZone)
    ) {
        return "Yesterday";
    }
    const days = Math.floor(ago / DAY);
    if (days < 7) return `${Math.max(days, 2)} days ago`;
    const thisYear =
        dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
        ...(thisYear ? {} : { year: "numeric" }),
    })
        .format(at)
        .replace("Sept", "Sep");
}

/** The exact moment, for the row's title text: "10 Oct 2026, 9:30 am". */
export function exactWhen(iso: string, timeZone: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    })
        .format(at)
        .replace("Sept", "Sep");
}
