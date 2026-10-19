"use client";

import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import type { ReactNode } from "react";

import { formatClock, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { KeptBooking } from "@/lib/services/availability-rules";
import { outsideHours } from "@/lib/services/availability-rules";
import { calendarHref } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { localDateOf, localMinuteOf } from "@/lib/services/diary";
import { DAYS } from "@/lib/staff/day-plan";
import type { BookingBrief, WeeklyRange } from "@/lib/staff/types";

/**
 * The bookings a person's hours now leave out, said once under the week:
 * the API's list after a change, else this week's from the calendar. They
 * stay booked; "See it" opens the one, "See them" their day on the list.
 */
export function outsideLine({
    staffId,
    briefs,
    kept,
    timezone,
    today,
}: {
    staffId: string;
    briefs: BookingBrief[] | undefined;
    kept: KeptBooking[];
    timezone: string;
    today: LocalDate;
}): ReactNode {
    const list = briefs
        ? briefs.map((b) => ({
              who: b.bookerName ?? b.serviceName,
              date: localDateOf(b.startAt, timezone),
              start: localMinuteOf(b.startAt, timezone),
              href: `/bookings/${b.id}`,
          }))
        : kept.map((k) => ({
              who: k.who,
              date: k.date ?? null,
              start: k.start,
              href: k.href ?? null,
          }));
    const first = list.at(0);
    if (!first) return null;
    if (list.length === 1) {
        const when = first.date
            ? `on ${formatDay(first.date, { weekday: "short", today })} `
            : "";
        return (
            <>
                {first.who} is booked {when}at {formatClock(first.start)}. It
                stays booked.
                {first.href ? (
                    <>
                        {" "}
                        <TextLink
                            href={first.href}
                            className="font-semibold text-inherit"
                        >
                            See it
                        </TextLink>
                    </>
                ) : null}
            </>
        );
    }
    return (
        <>
            {count(list.length, "booking is", "bookings are")} outside these
            hours. They stay booked.{" "}
            <TextLink
                href={calendarHref("agenda", first.date ?? today, {
                    person: staffId,
                })}
                className="font-semibold text-inherit"
            >
                See them
            </TextLink>
        </>
    );
}

/**
 * Under the week: the bookings this person's hours leave out, in a
 * warning, or nothing when there are none.
 */
export function OutsideNote({
    staffId,
    briefs,
    kept,
    week,
    timezone,
    today,
}: {
    staffId: string;
    /** What the API said after the last change, if there was one. */
    briefs: BookingBrief[] | undefined;
    /** This week's bookings, or null when they couldn't be read. */
    kept: KeptBooking[] | null;
    week: WeeklyRange[];
    timezone: string;
    today: LocalDate;
}) {
    const line = outsideLine({
        staffId,
        briefs,
        kept: kept
            ? DAYS.flatMap((d) => outsideHours(kept, staffId, week, d.day))
            : [],
        timezone,
        today,
    });
    return line ? (
        <Notice tone="warning" className="mt-2.5">
            {line}
        </Notice>
    ) : null;
}
