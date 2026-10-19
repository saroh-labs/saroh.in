import { avatarInitials } from "@saroh/ui/avatar";

import type { BookingsCalendar } from "@/lib/services/booking-calendar";
import { EVERYONE } from "@/lib/services/bookings-opens";
import type { DayFacts } from "@/lib/services/calendar-header";
import type { Column, LocalDate, ServiceHours } from "@/lib/services/diary";
import { dayColumns, isLive } from "@/lib/services/diary";
import type { StaffView } from "@/lib/staff/types";

import type { PersonChoice } from "./people-sheet";

/**
 * What header C says about each day and each person (U2), from the same
 * read and the same columns the calendar draws, so the date sheet's counts
 * and the people sheet's agree with the view.
 */

/** Only the columns of whose bookings are shown. */
export function columnsFor(columns: Column[], person: string): Column[] {
    return person === EVERYONE
        ? columns
        : columns.filter((c) => c.key === person);
}

/**
 * Each day's count and whether it is closed, for the days the calendar
 * read (`first` to `last`): outside them a day knows only its date. A day
 * is closed when the hours are known and nobody shown works it. Worked out
 * once a day, as the sheet asks.
 */
export function dayFactsOf({
    calendar,
    staff,
    timezone,
    gapAfter,
    minFree,
    serviceHours,
    person,
    first,
    last,
}: {
    calendar: BookingsCalendar;
    staff: StaffView[] | null;
    timezone: string;
    gapAfter: (serviceId: string) => number;
    minFree: (person: StaffView) => number;
    serviceHours: ServiceHours | null;
    person: string;
    first: LocalDate;
    last: LocalDate;
}): (d: LocalDate) => DayFacts {
    const seen = new Map<LocalDate, DayFacts>();
    return (d) => {
        const known = seen.get(d);
        if (known) return known;
        const inRead = d >= first && d <= last;
        const cols = columnsFor(
            dayColumns(
                calendar,
                staff,
                d,
                timezone,
                gapAfter,
                minFree,
                serviceHours,
                false,
            ),
            person,
        );
        const withHours = cols.filter((c) => c.day !== null);
        const facts: DayFacts = {
            count: inRead
                ? cols.reduce((n, c) => n + c.blocks.filter(isLive).length, 0)
                : null,
            closed:
                staff !== null &&
                withHours.length > 0 &&
                withHours.every((c) => (c.day?.windows.length ?? 0) === 0),
        };
        seen.set(d, facts);
        return facts;
    };
}

/**
 * Whose bookings: Everyone, then everyone active on the diary, each with
 * their live bookings in the view's period (`countOf`). With the staff
 * read missing, the people the bookings name.
 */
export function personChoices(
    staff: StaffView[] | null,
    columns: Column[],
    countOf: (key: string) => number,
): PersonChoice[] {
    const people = staff
        ? staff
              .filter((p) => p.status === "ACTIVE")
              .map((p) => ({ key: p.id, name: p.name, sub: p.title ?? "" }))
        : columns
              .filter((c) => c.day === null && c.key !== "unassigned")
              .map((c) => ({ key: c.key, name: c.name, sub: c.title ?? "" }));
    const choices = people.map((p) => ({
        ...p,
        initials: avatarInitials(p.name),
        count: countOf(p.key),
    }));
    return [
        {
            key: EVERYONE,
            name: "Everyone",
            initials: "All",
            sub: "Everyone’s bookings together",
            count: countOf(EVERYONE),
        },
        ...choices,
    ];
}
