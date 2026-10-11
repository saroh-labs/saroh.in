"use client";

import { useSyncExternalStore } from "react";

import {
    formatDate,
    formatDateTime,
    formatMonth,
    formatRecent,
    formatTime,
    viewerTimeZone,
} from "@/lib/format/datetime";
import { cn } from "@saroh/ui/lib/utils";

/**
 * A date shown in the VIEWER'S timezone, without breaking hydration.
 *
 * A date written without an explicit zone silently uses the runtime's own.
 * In production the server runs in UTC and the merchant does
 * not, so an instant late in their evening renders as one day on the server and
 * the next in the browser — React fails hydration on the mismatch and throws the
 * whole tree away.
 *
 * `suppressHydrationWarning` looks like the fix and is a trap: it silences the
 * warning by KEEPING the server's text, so the merchant would be left reading
 * the UTC date forever. The only correct answer is to render something both
 * sides agree on and then correct it once the client knows its own zone — which
 * is precisely what `useSyncExternalStore`'s server snapshot is for.
 *
 * Note what this does NOT apply to. Durations — "6 days overdue", "3 days
 * waiting" — are differences between two instants and mean the same thing in
 * every zone, so they render directly with no ceremony.
 */

/**
 * The zone never changes within a session, so there is nothing to subscribe to.
 * The unsubscribe is a real no-op, not an oversight.
 */
const noop = () => undefined;
const subscribe = () => noop;
const getServerTimeZone = () => "UTC";

/**
 * The variants that say a time of day. Since the 12-hour clock a time is
 * two words ("2:40 pm"), and in a narrow column the second dropped to a
 * line of its own. A time is one fact: it never wraps, wherever it is
 * drawn. The column it sits in is sized to fit it (`listTable.timeCol`).
 */
const HAS_TIME = new Set(["time", "datetime", "moment", "recent"]);

export function ViewerDate({
    iso,
    variant = "short",
    className,
    timeZone: fixedZone,
}: {
    iso: string;
    /**
     * A zone to write it in instead of the viewer's — the business's, for a
     * date printed on a document such as an invoice's issue date (#836).
     * Both sides know it, so server and client agree from the first paint.
     */
    timeZone?: string;
    /**
     * `short` is a date ("12 Oct", with the year when it is not this one);
     * `heading` says "Today" / "Tomorrow" where it applies; `datetime` adds
     * the time ("12 Oct, 9:30 am"), for a timeline where the hour matters.
     * The words themselves are `lib/format/datetime.ts`'s.
     */
    variant?:
        | "short"
        | "heading"
        | "datetime"
        | "dayMonth"
        | "dayMonthLong"
        | "time"
        // "Today, 9:14 am": a step on a timeline (Order Detail).
        | "moment"
        // "Today, 9:14 am", "Yesterday", "22 Sep": a log line (Settings ›
        // Activity).
        | "recent"
        // "August 2026".
        | "monthYear";
    className?: string;
}) {
    const viewerZone = useSyncExternalStore(
        subscribe,
        viewerTimeZone,
        getServerTimeZone,
    );
    const timeZone = fixedZone ?? viewerZone;

    const text =
        variant === "moment"
            ? formatDateTime(iso, timeZone, { relative: true })
            : variant === "recent"
              ? formatRecent(iso, timeZone)
              : variant === "monthYear"
                ? formatMonth(iso, timeZone)
                : variant === "heading"
                  ? formatDate(iso, timeZone, {
                        weekday: "short",
                        relative: true,
                    })
                  : variant === "datetime"
                    ? formatDateTime(iso, timeZone)
                    : variant === "dayMonth"
                      ? // "18 Sep": a stat tile's figure, where the year is noise.
                        formatDate(iso, timeZone, { year: "never" })
                      : variant === "dayMonthLong"
                        ? // "2 September": said in a sentence.
                          formatDate(iso, timeZone, {
                              month: "long",
                              year: "never",
                          })
                        : variant === "time"
                          ? formatTime(iso, timeZone)
                          : formatDate(iso, timeZone);

    return (
        // `<time dateTime>` carries the exact instant regardless of how the
        // visible text is rounded to a day, so the machine-readable value is
        // never the approximate one.
        <time
            dateTime={iso}
            className={
                HAS_TIME.has(variant)
                    ? cn("whitespace-nowrap", className)
                    : className
            }
        >
            {text}
        </time>
    );
}
