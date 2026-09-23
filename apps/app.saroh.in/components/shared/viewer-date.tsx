"use client";

import { useSyncExternalStore } from "react";

import {
    formatDayHeading,
    formatMoment,
    formatShortDate,
    formatShortDateTime,
} from "@/lib/format/datetime";

/**
 * A date shown in the VIEWER'S timezone, without breaking hydration.
 *
 * Every `toLocaleDateString` without an explicit `timeZone` silently uses the
 * runtime's own zone. In production the server runs in UTC and the merchant does
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
const getTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const getServerTimeZone = () => "UTC";

export function ViewerDate({
    iso,
    variant = "short",
    className,
}: {
    iso: string;
    /**
     * `heading` says "Today" / "Tomorrow" where it applies; `short` is a date;
     * `datetime` adds the time, for a timeline where the hour matters.
     */
    variant?:
        | "short"
        | "heading"
        | "datetime"
        | "dayMonth"
        | "dayMonthLong"
        | "time"
        // "Today, 09:14" — a step on a timeline (Order Detail).
        | "moment"
        // "August 2026".
        | "monthYear";
    className?: string;
}) {
    const timeZone = useSyncExternalStore(
        subscribe,
        getTimeZone,
        getServerTimeZone,
    );

    const text =
        variant === "moment"
            ? formatMoment(iso, timeZone)
            : variant === "monthYear"
              ? new Intl.DateTimeFormat("en-GB", {
                    month: "long",
                    year: "numeric",
                    timeZone,
                }).format(new Date(iso))
              : variant === "heading"
                ? formatDayHeading(iso, timeZone)
                : variant === "datetime"
                  ? formatShortDateTime(iso, timeZone)
                  : variant === "dayMonth"
                    ? // "18 Sep" — a stat tile's figure, where the year is noise. Three
                      // letters every month (ICU writes "Sept"), as the design does.
                      dayMonth(iso, timeZone)
                    : variant === "dayMonthLong"
                      ? // "2 September" — said in a sentence.
                        new Intl.DateTimeFormat("en-GB", {
                            day: "numeric",
                            month: "long",
                            timeZone,
                        }).format(new Date(iso))
                      : variant === "time"
                        ? new Intl.DateTimeFormat("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone,
                          }).format(new Date(iso))
                        : formatShortDate(iso, timeZone);

    return (
        // `<time dateTime>` carries the exact instant regardless of how the
        // visible text is rounded to a day, so the machine-readable value is
        // never the approximate one.
        <time dateTime={iso} className={className}>
            {text}
        </time>
    );
}

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

function dayMonth(iso: string, timeZone: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "numeric",
        timeZone,
    }).formatToParts(new Date(iso));
    const day = parts.find((p) => p.type === "day")?.value ?? "";
    const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
    return `${day} ${MONTHS[month - 1] ?? ""}`;
}
