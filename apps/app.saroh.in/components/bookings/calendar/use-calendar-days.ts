"use client";

import { useMemo } from "react";

import { formatDay } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import type { BookingsCalendar } from "@/lib/services/booking-calendar";
import { EVERYONE } from "@/lib/services/bookings-opens";
import { summaryLine } from "@/lib/services/calendar-header";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import type {
    Block,
    LocalDate,
    ServiceHours,
    Span,
} from "@/lib/services/diary";
import {
    addDays,
    blocksOnDay,
    bookedValue,
    dayColumns,
    isLive,
    localDateOf,
    visibleHours,
    weekdayOf,
    weekStartOf,
} from "@/lib/services/diary";
import {
    CANCELLED_LINE_MINUTES,
    closedKind,
    hoursAcross,
} from "@/lib/services/diary-view";
import type { Service } from "@/lib/services/service";
import type { StaffView } from "@/lib/staff/types";

import { columnsFor, dayFactsOf, personChoices } from "./header/header-facts";

/** A block's place on the diary's hours: a cancelled one is a thin line. */
const drawnSpan = (b: Block): Span =>
    isLive(b) ? [b.start, b.end] : [b.start, b.start + CANCELLED_LINE_MINUTES];

/**
 * What the calendar draws from its reads (U15): each person's column on
 * the day and across the week, whose bookings are shown, the hours to
 * draw, the summary line, and Header C's facts and person choices. Pure
 * derivation from the reads and the address; the screen holds the state.
 */
export function useCalendarDays({
    calendar,
    staff,
    staffById,
    services,
    layout,
    date,
    today,
    timezone,
    serviceHours,
    cancelledShown,
    askedPerson,
}: {
    calendar: BookingsCalendar;
    staff: StaffView[] | null;
    staffById: ReadonlyMap<string, StaffView>;
    services: Service[];
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    timezone: string;
    serviceHours: ServiceHours | null;
    cancelledShown: boolean;
    /** Whose bookings the address asks for: a staff id, or everyone. */
    askedPerson: string;
}) {
    const money = calendar.money;
    const gapAfter = useMemo(() => {
        const after = new Map(
            services.map((s) => [s.id, s.bufferAfterMinutes]),
        );
        return (id: string) => after.get(id) ?? 0;
    }, [services]);

    // A gap is offered only when something this person takes fits in it.
    const minFree = useMemo(() => {
        const oneToOne = services.filter(
            (s) => s.status === "ACTIVE" && s.capacity <= 1,
        );
        return (person: StaffView) => {
            const theirs = oneToOne
                .filter((s) => person.serviceIds.includes(s.id))
                .map((s) => s.durationMinutes);
            return theirs.length ? Math.min(...theirs) : 30;
        };
    }, [services]);
    const allColumns = useMemo(
        () =>
            dayColumns(
                calendar,
                staff,
                date,
                timezone,
                gapAfter,
                minFree,
                serviceHours,
                cancelledShown,
            ),
        [
            calendar,
            staff,
            date,
            timezone,
            gapAfter,
            minFree,
            serviceHours,
            cancelledShown,
        ],
    );
    // Whose bookings are shown (the chip): one person's column, or all.
    const person =
        askedPerson === EVERYONE ||
        allColumns.some((c) => c.key === askedPerson)
            ? askedPerson
            : EVERYONE;
    const columns = useMemo(
        () => columnsFor(allColumns, person),
        [allColumns, person],
    );
    // What the day draws, and everything on it (cancelled too) for the
    // count and for a quick look that stays open over a cancel.
    const dayBlocks = columns
        .flatMap((c) => c.blocks)
        .sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
    const shownOf = useMemo(
        () => (byPerson: Map<string, Block[]>) =>
            person === EVERYONE
                ? Array.from(byPerson.values()).flat()
                : (byPerson.get(person) ?? []),
        [person],
    );
    const everyDayBlock = useMemo(
        () => shownOf(blocksOnDay(calendar, date, timezone)),
        [calendar, date, timezone, shownOf],
    );
    const weekStart = weekStartOf(date);
    const week = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        return days.map((d) => {
            // The same columns the day draws, so the week agrees with it
            // about what is open, closed and off.
            const all = dayColumns(
                calendar,
                staff,
                d,
                timezone,
                gapAfter,
                minFree,
                serviceHours,
                cancelledShown,
            );
            const cols = columnsFor(all, person);
            return {
                all,
                cols,
                date: d,
                label: formatDay(d, { weekday: "short", year: "never" }),
                blocks: cols
                    .flatMap((c) => c.blocks)
                    .sort((a, b) => a.start - b.start),
                every: shownOf(blocksOnDay(calendar, d, timezone)),
                hours: hoursAcross(cols),
                today: d === today,
                selected: d === date,
                // "Closed on Sundays" only when nobody shown works that
                // weekday at all (U5).
                closed: closedKind(cols, (key) =>
                    (staffById.get(key)?.hours ?? []).some(
                        (h) => h.dayOfWeek === weekdayOf(d),
                    ),
                ),
            };
        });
    }, [
        staffById,
        calendar,
        staff,
        timezone,
        gapAfter,
        minFree,
        serviceHours,
        cancelledShown,
        weekStart,
        today,
        date,
        person,
        shownOf,
    ]);

    const inWeek = layout === "week";
    const shownBlocks = inWeek ? week.flatMap((d) => d.blocks) : dayBlocks;
    const everyBlock = inWeek ? week.flatMap((d) => d.every) : everyDayBlock;
    const openHours = inWeek
        ? week.flatMap((d) => d.hours?.windows ?? [])
        : columns.flatMap((c) => c.day?.windows ?? []);
    const span: Span = visibleHours(openHours, shownBlocks.map(drawnSpan));
    const live = everyBlock.filter(isLive);
    const cancelledCount = everyBlock.length - live.length;
    const value = bookedValue(everyBlock, money);
    const first = everyBlock.at(0);
    const currencyCode = first
        ? ((first.kind === "one"
              ? first.booking.service.currency
              : first.session.service.currency) ?? null)
        : null;
    // The week's totals cover all seven days, even on a phone, where the list
    // under them shows one day at a time. Free times only with the hours.
    const freeCount =
        staff === null
            ? null
            : (inWeek ? week.flatMap((d) => d.cols) : columns).reduce(
                  (n, c) => n + (c.day?.free.length ?? 0),
                  0,
              );
    const summary = summaryLine({
        booked: live.length,
        free: freeCount,
        money:
            value !== null && currencyCode
                ? formatMoney(value, currencyCode)
                : null,
        cancelledShown: cancelledShown ? cancelledCount : 0,
    });

    // ── Header C: whose bookings, and what each day holds ─────────────────
    const readFirst = calendar.from
        ? localDateOf(calendar.from, timezone)
        : date;
    const readLast = calendar.to
        ? localDateOf(new Date(Date.parse(calendar.to) - 1), timezone)
        : date;
    const facts = useMemo(
        () =>
            dayFactsOf({
                calendar,
                staff,
                timezone,
                gapAfter,
                minFree,
                serviceHours,
                person,
                first: readFirst,
                last: readLast,
            }),
        [
            calendar,
            staff,
            timezone,
            gapAfter,
            minFree,
            serviceHours,
            person,
            readFirst,
            readLast,
        ],
    );
    const periodColumns = inWeek ? week.flatMap((d) => d.all) : allColumns;
    const choices = personChoices(staff, allColumns, (key) =>
        periodColumns
            .filter((c) => key === EVERYONE || c.key === key)
            .reduce((n, c) => n + c.blocks.filter(isLive).length, 0),
    );

    return {
        person,
        allColumns,
        columns,
        dayBlocks,
        week,
        weekStart,
        inWeek,
        span,
        summary,
        cancelledCount,
        everyBlock,
        facts,
        choices,
    };
}
