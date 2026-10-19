"use client";

import { PartialRead } from "@/components/shared/failed-read";
import { formatClock, formatDay, timeZoneName } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showInfo, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { diaryPausedWords } from "@/lib/billing/paused";
import { formatMoney } from "@/lib/format/money";
import type { NoticeChannels } from "@/lib/messages/notice-reach";
import {
    cancelBooking,
    recordBookingOutcome,
    rescheduleBooking,
} from "@/lib/services/actions";
import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { BookingPeople } from "@/lib/services/booking-pay";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { BookingsOpens } from "@/lib/services/bookings-opens";
import {
    EVERYONE,
    OPENS_DEFAULT,
    rememberLastView,
} from "@/lib/services/bookings-opens";
import { summaryLine } from "@/lib/services/calendar-header";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import type {
    Block,
    Column,
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
    localMinuteOf,
    UNASSIGNED,
    visibleHours,
    weekdayOf,
    weekStartOf,
    whoFor,
} from "@/lib/services/diary";
import {
    CANCELLED_LINE_MINUTES,
    closedKind,
    hoursAcross,
} from "@/lib/services/diary-view";
import type { Service, Slot } from "@/lib/services/service";
import type { BookingRules, StaffView } from "@/lib/staff/types";
import { Users } from "lucide-react";

import { useHold } from "@/components/shared/use-hold";
import { TextLink } from "@saroh/ui/text-link";
import { AddPersonDialog } from "../availability/add-person-dialog";
import { AgendaList, AgendaMonth } from "./agenda-month";
import { BookingQuickLook } from "./booking-quick-look";
import { ServiceHoursHint } from "./calendar-toolbar";
import { DayByPerson } from "./day-by-person";
import { CalendarHeader } from "./header/calendar-header";
import { columnsFor, dayFactsOf, personChoices } from "./header/header-facts";
import { useSwipe } from "./header/use-swipe";
import type { GapTarget } from "./new-booking-from-gap";
import { NewBookingFromGap } from "./new-booking-from-gap";
import type { HoursTarget } from "./open-hours-dialog";
import { OpenHoursDialog } from "./open-hours-dialog";
import type { QuickLookActions } from "./quick-look-types";
import { WeekPhone } from "./week-phone";
import { WeekView } from "./week-view";

// The calendar's address lives in a plain module so the server page can
// build it too; a server component can't call into this client file.
export { calendarHref, type CalendarLayout };

type Override = Partial<
    Pick<DiaryBooking, "status" | "outcome" | "cancelledLate">
>;

/** The calendar with this screen's held changes applied on top. */
function withOverrides(
    calendar: BookingsCalendar,
    overrides: Record<string, Override>,
): BookingsCalendar {
    if (Object.keys(overrides).length === 0) return calendar;
    const apply = (b: DiaryBooking) => {
        const o = overrides[b.id] as Override | undefined;
        return o ? { ...b, ...o } : b;
    };
    return {
        ...calendar,
        diaries: calendar.diaries.map((d) => ({
            ...d,
            bookings: d.bookings.map(apply),
            classes: d.classes.map((s) => {
                const bookings = s.bookings.map(apply);
                return {
                    ...s,
                    bookings,
                    taken: bookings.filter((b) => b.status !== "CANCELLED")
                        .length,
                };
            }),
        })),
    };
}

/** A block's place on the diary's hours: a cancelled one is a thin line. */
const drawnSpan = (b: Block): Span =>
    isLive(b) ? [b.start, b.end] : [b.start, b.start + CANCELLED_LINE_MINUTES];

/**
 * Bookings › Calendar (U15, the "Saroh Bookings" design): the day by person
 * (default), the week, or the agenda with the month. Everything is read from
 * the bookings read (U4) and the staff read (U3); free gaps are what is left
 * of each person's hours. A booking opens a quick look; a free gap books;
 * closed time opens hours. Changes the desk makes are held for their Undo.
 *
 * Bookings are the only solid colour: free time is the plain page, closed
 * time and time off are hatched, and cancelled bookings stay off the diary
 * until the count's switch asks for them (kept in the address, so a reload
 * remembers). The hours drawn are trimmed to the day's own.
 */
export function CalendarScreen({
    layout,
    date,
    today,
    now,
    timezone,
    calendar: read,
    staff,
    services,
    rules,
    people,
    can,
    newBooking,
    notices = null,
    limitNotice = null,
    serviceHours = null,
    showCancelled = false,
    person: askedPerson = EVERYONE,
    opens = OPENS_DEFAULT,
    me = null,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    now: number;
    timezone: string;
    calendar: BookingsCalendar;
    /** Null when the staff read failed: no hours, so no free times. */
    staff: StaffView[] | null;
    services: Service[];
    rules: BookingRules | null;
    /** What New booking may do about the customer and a pay link (E4). */
    people: BookingPeople;
    can: {
        book: boolean;
        hours: boolean;
        order?: boolean;
        /** Take payment at the desk, and send a pay link instead (P2). */
        desk?: {
            canTake: boolean;
            canLink: boolean;
            /** The plan takes payment online (R33); else no link is offered. */
            online?: boolean;
        };
    };
    /** The full New booking dialog, for any service at any open time. */
    newBooking: ReactNode;
    /** What the business can tell its customers with (A14). */
    notices?: NoticeChannels | null;
    /** The plan's bookings-a-month notice at 80% and 100% (U14). */
    limitNotice?: ReactNode;
    /**
     * With nobody on the diary, the services' own hours (UX-023): drawn as
     * one column with its free time, as the booking page offers it.
     */
    serviceHours?: ServiceHours | null;
    /** The address asks for cancelled bookings to be drawn (`cancelled=1`). */
    showCancelled?: boolean;
    /** Whose bookings are shown: a staff id, or `EVERYONE` (DEC-170). */
    person?: string;
    /** Where Bookings opens for this person, as kept (DEC-170). */
    opens?: BookingsOpens;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me?: { id: string; name: string } | null;
}) {
    const router = useRouter();
    const { hold, undo, pending } = useHold();
    // Flipped here and written to the address without a round trip; a
    // navigation that changes what the address says wins.
    const [cancelledShown, setCancelledShown] = useState(showCancelled);
    const [asked, setAsked] = useState(showCancelled);
    if (asked !== showCancelled) {
        setAsked(showCancelled);
        setCancelledShown(showCancelled);
    }
    const [overrides, setOverrides] = useState<Record<string, Override>>({});
    const [peek, setPeek] = useState<string | null>(null);
    const [gap, setGap] = useState<GapTarget | null>(null);
    const [hours, setHours] = useState<HoursTarget | null>(null);
    const [addingPerson, setAddingPerson] = useState(false);
    // "Where I left it" (Q15): this device keeps the view it was left on.
    useEffect(() => rememberLastView(layout), [layout]);

    const calendar = useMemo(
        () => withOverrides(read, overrides),
        [read, overrides],
    );
    const money = calendar.money;
    const gapAfter = useMemo(() => {
        const after = new Map(
            services.map((s) => [s.id, s.bufferAfterMinutes]),
        );
        return (id: string) => after.get(id) ?? 0;
    }, [services]);
    const staffById = useMemo(
        () => new Map((staff ?? []).map((p) => [p.id, p])),
        [staff],
    );

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

    // From everything on the view, drawn or not: a booking cancelled from
    // its quick look leaves the diary, and the quick look keeps its Undo.
    const peekBlock = peek
        ? (everyBlock.find((b) => b.key === peek) ??
          // A block opened from the week that is not on the day.
          week.flatMap((d) => d.every).find((b) => b.key === peek) ??
          null)
        : null;

    // On a phone the day draws one column: the one picked, else the first
    // (U4 draws Everyone's day as one list).
    const phoneKey = columns[0]?.key ?? "";

    // ── What the desk does, held for Undo ──────────────────────────────────

    const setOverride = (id: string, o: Override | null) =>
        setOverrides((all) => {
            const next = { ...all };
            // Replaced, not merged: Undo puts back exactly what was there.
            if (o) next[id] = { ...o };
            else delete next[id];
            return next;
        });

    const firstName = (b: DiaryBooking) => whoFor(b).split(" ")[0] ?? "";
    const isClassSeat = (b: DiaryBooking) => b.service.capacity > 1;
    const lateNow = (b: DiaryBooking) =>
        rules?.freeCancelHours !== null &&
        rules?.freeCancelHours !== undefined &&
        now > Date.parse(b.startAt) - rules.freeCancelHours * 3_600_000;

    const act: QuickLookActions = {
        checkIn(b) {
            const was = overrides[b.id] ?? null;
            setOverride(b.id, { outcome: "ATTENDED" });
            const price =
                money && b.paidWith === "DESK"
                    ? formatMoney(
                          b.service.priceCents ?? null,
                          b.service.currency ?? null,
                      )
                    : null;
            hold(
                `outcome:${b.id}`,
                `${firstName(b)} ${BOOKING_WORDS.came.toLowerCase()}.${price ? ` Take ${price} now.` : ""}`,
                async () => {
                    const res = await recordBookingOutcome(b.id, "ATTENDED");
                    if (!res.ok) {
                        showError(res.error);
                        setOverride(b.id, was);
                    }
                    router.refresh();
                },
                () => setOverride(b.id, was),
            );
        },
        noShow(b) {
            const was = overrides[b.id] ?? null;
            setOverride(b.id, { outcome: "NO_SHOW" });
            hold(
                `outcome:${b.id}`,
                `Marked ${firstName(b)} as ${BOOKING_WORDS.didntCome.toLowerCase()}.`,
                async () => {
                    const res = await recordBookingOutcome(b.id, "NO_SHOW");
                    if (!res.ok) {
                        showError(res.error);
                        setOverride(b.id, was);
                    }
                    router.refresh();
                },
                () => setOverride(b.id, was),
            );
        },
        cancel(b) {
            const was = overrides[b.id] ?? null;
            const late = lateNow(b);
            const prepaid =
                b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP";
            setOverride(b.id, { status: "CANCELLED", cancelledLate: late });
            const who = firstName(b);
            const message = isClassSeat(b)
                ? prepaid
                    ? late
                        ? `${who}'s place cancelled. Within ${rules?.freeCancelHours} hours, so the class is used.`
                        : `${who}'s place cancelled. The class goes back to the ${b.paidWith === "PACK" ? "pack" : "membership"}.`
                    : `${who}'s place cancelled.`
                : `Cancelled ${who}'s ${formatClock(localMinuteOf(b.startAt, timezone))}.`;
            hold(
                `cancel:${b.id}`,
                message,
                async () => {
                    const res = await cancelBooking(b.id);
                    if (!res.ok) {
                        showError(res.error);
                        setOverride(b.id, was);
                    }
                    router.refresh();
                },
                () => setOverride(b.id, was),
            );
        },
        cancelClass(seats, title) {
            const was = Object.fromEntries(
                seats.map((b) => [b.id, overrides[b.id] ?? null]),
            );
            for (const b of seats) {
                setOverride(b.id, {
                    status: "CANCELLED",
                    cancelledLate: false,
                });
            }
            const back = seats.filter(
                (b) => b.paidWith === "PACK" || b.paidWith === "MEMBERSHIP",
            ).length;
            hold(
                `class:${seats.map((b) => b.id).join(",")}`,
                `${title} cancelled.${back ? ` ${count(back, "class", "classes")} given back.` : ""}`,
                async () => {
                    let failed = 0;
                    for (const b of seats) {
                        const res = await cancelBooking(b.id, {
                            returnCredit: true,
                            closesClass: true,
                        });
                        if (!res.ok) {
                            failed += 1;
                            setOverride(b.id, was[b.id] ?? null);
                        }
                    }
                    if (failed) {
                        showError(
                            `${count(failed, "place")} could not be cancelled.`,
                            "The rest are. Open the class to try those again.",
                        );
                    }
                    router.refresh();
                },
                () => {
                    for (const b of seats) setOverride(b.id, was[b.id] ?? null);
                },
            );
        },
        move(b, slot: Slot) {
            void rescheduleBooking(b.id, slot.startAt).then((res) => {
                if (!res.ok) {
                    showError(res.error);
                    router.refresh();
                    return;
                }
                setPeek(null);
                router.refresh();
                const to = `${formatDay(localDateOf(slot.startAt, timezone), { weekday: "short", year: "never" })} at ${formatClock(localMinuteOf(slot.startAt, timezone))}`;
                showUndo(`Moved ${firstName(b)} to ${to}.`, async () => {
                    const back = await rescheduleBooking(b.id, b.startAt);
                    router.refresh();
                    return back;
                });
            });
        },
    };

    // ── Free gaps and closed time ──────────────────────────────────────────

    function bookGap(column: Column, free: Span, on: LocalDate = date) {
        const person = staffById.get(column.key);
        if (!person) return;
        // Past the plan's team limit (#800): no new bookings with them, and
        // why, rather than a form the API would refuse.
        if (person.paused) {
            showInfo(diaryPausedWords([person.name]));
            return;
        }
        setGap({ staff: person, date: on, free });
    }

    // A day nobody works, from the week (U5): open hours for whoever is
    // picked, else the viewer when they take bookings, else the first
    // person on the diary, from when they usually start.
    function openDay(on: LocalDate) {
        const who =
            staffById.get(person) ??
            (me ? staffById.get(me.id) : undefined) ??
            (staff ?? []).find((p) => p.status === "ACTIVE");
        if (!who) return;
        const starts = who.hours.map((h) => h.startMinute);
        setHours({
            staff: who,
            date: on,
            from: starts.length ? Math.min(...starts) : 540,
            mode: "open",
            windows: [],
            blocks: [],
        });
    }
    const offersFree = (c: Column) => {
        const p = staffById.get(c.key);
        return c.key !== UNASSIGNED && p !== undefined && !p.paused;
    };

    function openClosed(column: Column, minute: number) {
        const person = staffById.get(column.key);
        if (!person) return;
        setHours({
            staff: person,
            date,
            from: minute,
            mode: "open",
            windows: column.day?.windows ?? [],
            blocks: column.blocks,
        });
    }

    function blockGap(target: GapTarget) {
        const column = columns.find((c) => c.key === target.staff.id);
        setGap(null);
        setHours({
            staff: target.staff,
            date: target.date,
            from: target.free[0],
            mode: "block",
            room: target.free[1] - target.free[0],
            windows: column?.day?.windows ?? [],
            blocks: column?.blocks ?? [],
        });
    }

    const hrefFor = (l: CalendarLayout, d: LocalDate, who = person) =>
        calendarHref(l, d, { cancelled: cancelledShown, person: who });
    const go = (l: CalendarLayout, d: LocalDate) =>
        router.push(hrefFor(l, d), { scroll: false });
    const step = inWeek ? 7 : 1;
    const swipe = useSwipe({
        onPrevious: () => go(layout, addDays(date, -step)),
        onNext: () => go(layout, addDays(date, step)),
    });
    // Nothing is read again for it, so the address is written in place
    // (Next keeps `history.replaceState` in step with its router).
    const showCancelledBookings = (on: boolean) => {
        setCancelledShown(on);
        window.history.replaceState(
            null,
            "",
            calendarHref(layout, date, { cancelled: on, person }),
        );
    };

    const freeRows =
        staff === null
            ? null
            : columns
                  // The services' own hours have nobody to book with a tap,
                  // and someone paused by the plan takes no new booking.
                  .filter((c) => {
                      const person = staffById.get(c.key);
                      return person !== undefined && !person.paused;
                  })
                  .flatMap((c) =>
                      (c.day?.free ?? []).map((f) => ({
                          key: `${c.key}${f[0]}`,
                          who: c.name,
                          from: f[0],
                          to: f[1],
                          book: () => bookGap(c, f),
                      })),
                  );
    const monthBusy = useMemo(() => {
        const days = new Set<LocalDate>();
        for (const d of calendar.diaries) {
            if (person !== EVERYONE && d.person?.id !== person) continue;
            for (const b of d.bookings) {
                if (b.status !== "CANCELLED")
                    days.add(localDateOf(b.startAt, timezone));
            }
            for (const s of d.classes)
                days.add(localDateOf(s.startAt, timezone));
        }
        return days;
    }, [calendar, timezone, person]);

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

    const nobodyYet =
        staff !== null &&
        !staff.some((p) => p.status === "ACTIVE") &&
        columns.length > 0;
    const ownHours = serviceHours !== null && serviceHours.hours.length > 0;
    const addPerson = can.hours ? () => setAddingPerson(true) : undefined;
    const peekFromDay = (b: Block) => setPeek(b.key);

    const agendaList = (
        <AgendaList
            blocks={dayBlocks}
            selected={peek}
            onBlock={peekFromDay}
            empty={
                date === today
                    ? "Nothing booked today."
                    : `Nothing booked on ${formatDay(date, { weekday: "short", year: "never" })}.`
            }
        />
    );

    return (
        <div>
            <CalendarHeader
                layout={layout}
                date={date}
                today={today}
                summary={summary}
                zone={timeZoneName(timezone, "short", new Date(now), "en-IN")}
                choices={choices}
                picked={person}
                facts={facts}
                cancelled={{
                    count: cancelledCount,
                    shown: cancelledShown,
                    onChange: showCancelledBookings,
                }}
                opens={opens}
                me={me}
                hrefFor={hrefFor}
                newBooking={newBooking}
                calOnly={!can.book}
                onAddPerson={addPerson}
            />
            <div className="max-[759px]:touch-pan-y" {...swipe}>
                {limitNotice ? <div className="mb-3">{limitNotice}</div> : null}
                {staff === null ? (
                    <PartialRead
                        className="mb-3"
                        things="hours and time off"
                        so="Open and closed times aren't shown. The bookings below are complete."
                    />
                ) : null}

                {nobodyYet && ownHours ? (
                    // How the one column works, said once; the action stays
                    // at the head of the column.
                    <ServiceHoursHint onAdd={addPerson} />
                ) : nobodyYet ? (
                    <p className="mb-3 text-[12.5px] text-muted-foreground">
                        Nobody is on the diary and no service has hours of its
                        own yet, so customers have no free times to book.{" "}
                        {addPerson ? (
                            <TextLink
                                onClick={addPerson}
                                className="coarse:min-h-11"
                            >
                                Add who takes bookings
                            </TextLink>
                        ) : null}
                    </p>
                ) : null}
                {layout === "day" ? (
                    <>
                        {columns.length ? (
                            <DayByPerson
                                columns={columns}
                                span={span}
                                today={date === today}
                                timezone={timezone}
                                sightKey={`day:${date}`}
                                phoneKey={phoneKey}
                                selected={peek}
                                canBook={can.book}
                                canOpenHours={can.hours}
                                dayText={formatDay(date, {
                                    weekday: "short",
                                    year: "never",
                                })}
                                onBlock={peekFromDay}
                                onFree={bookGap}
                                onClosed={openClosed}
                                onAddPerson={addPerson}
                            />
                        ) : (
                            <NoOneYet
                                canHours={can.hours}
                                onAdd={() => setAddingPerson(true)}
                            />
                        )}
                    </>
                ) : null}

                {layout === "week" ? (
                    <>
                        <div className="max-[759px]:hidden">
                            <WeekView
                                days={week}
                                span={span}
                                timezone={timezone}
                                sightKey={`week:${weekStart}`}
                                selected={peek}
                                canBook={can.book}
                                canOpenHours={can.hours}
                                offersFree={offersFree}
                                onDay={(d) => go("day", d)}
                                onBlock={(b) => setPeek(b.key)}
                                onFree={bookGap}
                                onOpenDay={openDay}
                            />
                        </div>
                        <div className="min-[760px]:hidden">
                            <WeekPhone
                                days={week}
                                date={date}
                                person={
                                    person === EVERYONE
                                        ? null
                                        : (staffById.get(person)?.name ??
                                          columns.at(0)?.name ??
                                          null)
                                }
                                canBook={can.book}
                                canOpenHours={can.hours}
                                offersFree={offersFree}
                                selected={peek}
                                onPick={(d) => go("week", d)}
                                onBlock={(b) => setPeek(b.key)}
                                onFree={bookGap}
                                onOpenDay={openDay}
                            />
                        </div>
                    </>
                ) : null}

                {layout === "agenda" ? (
                    <AgendaMonth
                        date={date}
                        today={today}
                        busyDays={monthBusy}
                        free={can.book ? freeRows : null}
                        onDay={(d) => go("agenda", d)}
                    >
                        {agendaList}
                    </AgendaMonth>
                ) : null}
            </div>

            <BookingQuickLook
                block={peekBlock}
                onClose={() => setPeek(null)}
                ctx={{
                    timezone,
                    now,
                    money,
                    rules,
                    canBook: can.book,
                    canReadOrder: can.order ?? false,
                    desk: can.desk,
                    notices,
                }}
                act={act}
                heldFor={(id) => {
                    const key = pending.find(
                        (k) =>
                            k === `outcome:${id}` ||
                            k === `cancel:${id}` ||
                            (k.startsWith("class:") &&
                                k.slice(6).split(",").includes(id)),
                    );
                    return key ? () => undo(key) : null;
                }}
            />
            <NewBookingFromGap
                target={gap}
                services={services}
                people={people}
                timezone={timezone}
                money={money}
                onClose={() => setGap(null)}
                onBlock={blockGap}
            />
            <OpenHoursDialog
                target={hours}
                timezone={timezone}
                onClose={() => setHours(null)}
            />
            {/* Adding someone is a name and what they do, so it is done
                here; the dialog refreshes the calendar, which gives them
                their column. They start with the opening hours, and
                Availability is where their week is changed. */}
            {can.hours ? (
                <AddPersonDialog
                    open={addingPerson}
                    onOpenChange={setAddingPerson}
                    hoursHint="Change their hours in Hours and time off."
                />
            ) : null}
        </div>
    );
}

function NoOneYet({
    canHours,
    onAdd,
}: {
    canHours: boolean;
    onAdd: () => void;
}) {
    return (
        <EmptyState
            icon={<Users />}
            title="No one on the diary yet"
            description={
                canHours
                    ? "Add the people who take bookings and their hours, and each gets a column here."
                    : "The people who take bookings each get a column here."
            }
            action={
                canHours ? (
                    <Button onClick={onAdd}>Add someone</Button>
                ) : undefined
            }
        />
    );
}
