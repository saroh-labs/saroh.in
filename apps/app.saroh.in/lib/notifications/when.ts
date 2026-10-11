import {
    formatDate,
    formatDateTime,
    formatRelative,
    localDateKey,
} from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { sentenceStart } from "@/lib/format/sentence";

/**
 * When a notification came in, as the inbox says it (10 Oct 2026): how
 * long ago while that is the useful answer, then the day. And which group
 * it sits in: Today, or Earlier.
 *
 * Days are the business's (`timeZone`), so "today" is the day the shop is
 * having. Pure: `now` is passed in, so the server and the browser say the
 * same thing from the same instant. The words for a day, a time and how
 * long ago are `lib/format/datetime.ts`'s.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type NoticeGroup = "today" | "earlier";

/** Today in the business's zone, or before it. */
export function noticeGroup(
    iso: string,
    now: Date,
    timeZone: string,
): NoticeGroup {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "earlier";
    return localDateKey(at, timeZone) === localDateKey(now, timeZone)
        ? "today"
        : "earlier";
}

/**
 * "Just now", "5 minutes ago", "2 hours ago", "Yesterday", "3 days ago",
 * then the date: "22 Sep", with the year once it isn't this one.
 */
export function relativeWhen(iso: string, now: Date, timeZone: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    const ago = now.getTime() - at.getTime();
    const day = localDateKey(at, timeZone);
    if (day === localDateKey(now, timeZone) || ago < HOUR) {
        return sentenceStart(formatRelative(at, now));
    }
    if (day === localDateKey(new Date(now.getTime() - DAY), timeZone)) {
        return "Yesterday";
    }
    const days = Math.floor(ago / DAY);
    if (days < 7) return `${count(Math.max(days, 2), "day")} ago`;
    return formatDate(at, timeZone, { now });
}

/** The exact moment, for the row's title text: "10 Oct 2026, 9:30 am". */
export function exactWhen(iso: string, timeZone: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return "";
    return formatDateTime(at, timeZone, { year: "always" });
}
