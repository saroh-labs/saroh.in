import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { dayText } from "@/lib/subscriptions/view";

/**
 * Customer Detail's short dates, in the business's zone. Pure: `now` and the
 * zone are passed in, so the server and the browser write the same words.
 * Split from `view.ts` (C14), which re-exports them.
 */

/** "August 2026" in the business's zone. */
export function monthText(at: string, timeZone: string): string {
    return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        month: "long",
        year: "numeric",
    }).format(new Date(at));
}

function localDate(at: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(at));
}

/** "Today", "Yesterday" or "18 Sep" — the design's short when. */
export function whenText(at: string, timeZone: string, now: Date): string {
    const day = localDate(at, timeZone);
    if (day === localDate(now.toISOString(), timeZone)) return "Today";
    const yesterday = new Date(now.getTime() - 86_400_000).toISOString();
    if (day === localDate(yesterday, timeZone)) return "Yesterday";
    return dayText(at, timeZone, now);
}
