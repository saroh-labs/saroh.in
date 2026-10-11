"use client";

import { PartialRead } from "@/components/shared/failed-read";

import type { CalendarMonth } from "@/lib/calendar/types";

const listed = (labels: string[]) =>
    labels.length < 2
        ? (labels[0] ?? "")
        : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

/**
 * The layers that couldn't be read, named with a Try again, over a month or
 * a week that shows everything else. A failed layer is a different state
 * from a failed read, which the segment's boundary shows.
 */
export function CalendarMissing({
    data,
    span,
}: {
    data: CalendarMonth;
    /** "month" or "week": what the rest is still here for. */
    span: string;
}) {
    const missing = data.unavailable.map((u) => u.label);
    if (missing.length === 0) return null;
    const money = data.takings !== undefined;
    const noMoney =
        data.money?.total === null || (money && data.takings?.total === null);
    return (
        <PartialRead
            things={listed(missing)}
            so={`Everything else in this ${span} is here.${
                noMoney ? " Money is left out while part of it is missing." : ""
            }`}
        />
    );
}
