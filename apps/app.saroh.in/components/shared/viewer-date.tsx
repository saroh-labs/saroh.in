"use client";

import { useSyncExternalStore } from "react";

import { formatDayHeading, formatShortDate } from "@/lib/format/datetime";

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
    /** `heading` says "Today" / "Tomorrow" where it applies; `short` is a date. */
    variant?: "short" | "heading";
    className?: string;
}) {
    const timeZone = useSyncExternalStore(
        subscribe,
        getTimeZone,
        getServerTimeZone,
    );

    const text =
        variant === "heading"
            ? formatDayHeading(iso, timeZone)
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
