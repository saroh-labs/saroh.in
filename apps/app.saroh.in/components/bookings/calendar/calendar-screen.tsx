"use client";

import { PartialRead } from "@/components/shared/failed-read";
import { formatClock, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { showError, showInfo, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

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
import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";
import { callName } from "@/lib/services/call-name";
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
    visibleHours,
    weekStartOf,
    whoFor,
} from "@/lib/services/diary";
import {
    CANCELLED_LINE_MINUTES,
    closedSpans,
    hoursAcross,
    legendOf,
    offSpans,
} from "@/lib/services/diary-view";
import type { Service, Slot } from "@/lib/services/service";
import type { BookingRules, StaffView } from "@/lib/staff/types";
import { Users } from "lucide-react";

import { useHold } from "@/components/shared/use-hold";
import { Segmented } from "@saroh/ui/segmented";
import { TextLink } from "@saroh/ui/text-link";
import { AddPersonDialog } from "../availability/add-person-dialog";
import { AgendaList, AgendaMonth } from "./agenda-month";
import { BookingQuickLook } from "./booking-quick-look";
import { CalendarToolbar, Legend, ServiceHoursHint } from "./calendar-toolbar";
import { DayByPerson } from "./day-by-person";
import type { GapTarget } from "./new-booking-from-gap";
import { NewBookingFromGap } from "./new-booking-from-gap";
import type { HoursTarget } from "./open-hours-dialog";
import { OpenHoursDialog } from "./open-hours-dialog";
import type { QuickLookActions } from "./quick-look-types";
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
    const [phonePerson, setPhonePerson] = useState<string | null>(null);

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
    const columns = useMemo(
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
    // What the day draws, and everything on it (cancelled too) for the
    // count and for a quick look that stays open over a cancel.
    const dayBlocks = columns
        .flatMap((c) => c.blocks)
        .sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
    const everyDayBlock = useMemo(
        () => Array.from(blocksOnDay(calendar, date, timezone).values()).flat(),
        [calendar, date, timezone],
    );
    const weekStart = weekStartOf(date);
    const week = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        return days.map((d) => {
            // The same columns the day draws, so the week agrees with it
            // about what is open, closed and off.
            const cols = dayColumns(
                calendar,
                staff,
                d,
                timezone,
                gapAfter,
                minFree,
                serviceHours,
                cancelledShown,
            );
            return {
                date: d,
                label: formatDay(d, { weekday: "short", year: "never" }),
                blocks: cols
                    .flatMap((c) => c.blocks)
                    .sort((a, b) => a.start - b.start),
                every: Array.from(
                    blocksOnDay(calendar, d, timezone).values(),
                ).flat(),
                hours: hoursAcross(cols),
                today: d === today,
                selected: d === date,
            };
        });
    }, [
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
    ]);

    const inWeek = layout === "week";
    const shownBlocks = inWeek ? week.flatMap((d) => d.blocks) : dayBlocks;
    const everyBlock = inWeek ? week.flatMap((d) => d.every) : everyDayBlock;
    const openHours = inWeek
        ? week.flatMap((d) => d.hours?.windows ?? [])
        : columns.flatMap((c) => c.day?.windows ?? []);
    const span: Span = visibleHours(openHours, shownBlocks.map(drawnSpan));
    const hatched = inWeek
        ? week.flatMap((d) => (d.hours ? [d.hours] : []))
        : columns.flatMap((c) => (c.day ? [c.day] : []));
    // The agenda is a list: it has no hours to hatch.
    const legend = legendOf({
        blocks: shownBlocks,
        closed:
            layout !== "agenda" &&
            hatched.some((h) => closedSpans(h, span).length > 0),
        off:
            layout !== "agenda" &&
            hatched.some((h) => offSpans(h, span).length > 0),
    });
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
    // under them shows one day at a time.
    const summary = `${count(live.length, "booking")}${
        layout === "week" ? " this week" : ""
    }${
        value !== null && currencyCode
            ? ` · ${formatMoney(value, currencyCode)} booked`
            : ""
    }`;

    // From everything on the view, drawn or not: a booking cancelled from
    // its quick look leaves the diary, and the quick look keeps its Undo.
    const peekBlock = peek
        ? (everyBlock.find((b) => b.key === peek) ??
          // A block opened from the week that is not on the day.
          week.flatMap((d) => d.every).find((b) => b.key === peek) ??
          null)
        : null;

    const phoneKey =
        phonePerson && columns.some((c) => c.key === phonePerson)
            ? phonePerson
            : (columns[0]?.key ?? "");

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
                `${firstName(b)} checked in.${price ? ` Take ${price} now.` : ""}`,
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
                `Marked ${firstName(b)} a no-show.`,
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

    function bookGap(column: Column, free: Span) {
        const person = staffById.get(column.key);
        if (!person) return;
        // Past the plan's team limit (#800): no new bookings with them, and
        // why, rather than a form the API would refuse.
        if (person.paused) {
            showInfo(diaryPausedWords([person.name]));
            return;
        }
        setGap({ staff: person, date, free });
    }

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

    const go = (l: CalendarLayout, d: LocalDate) =>
        router.push(calendarHref(l, d, { cancelled: cancelledShown }), {
            scroll: false,
        });
    // Nothing is read again for it, so the address is written in place
    // (Next keeps `history.replaceState` in step with its router).
    const showCancelledBookings = (on: boolean) => {
        setCancelledShown(on);
        window.history.replaceState(
            null,
            "",
            calendarHref(layout, date, { cancelled: on }),
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
            for (const b of d.bookings) {
                if (b.status !== "CANCELLED")
                    days.add(localDateOf(b.startAt, timezone));
            }
            for (const s of d.classes)
                days.add(localDateOf(s.startAt, timezone));
        }
        return days;
    }, [calendar, timezone]);

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
            <CalendarToolbar
                layout={layout}
                date={date}
                today={today}
                summary={summary}
                cancelled={{
                    count: cancelledCount,
                    shown: cancelledShown,
                    onChange: showCancelledBookings,
                }}
                newBooking={newBooking}
            />
            <div>
                {limitNotice ? <div className="mb-3">{limitNotice}</div> : null}
                <Legend keys={legend} />
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
                        {columns.length > 1 ? (
                            <Segmented
                                label="Whose day"
                                block
                                className="mb-2.5 flex-nowrap overflow-x-auto min-[760px]:hidden"
                                value={phoneKey}
                                onValueChange={setPhonePerson}
                                options={columns.map((c) => ({
                                    value: c.key,
                                    label: callName(c.name),
                                    count: c.blocks.filter(isLive).length,
                                }))}
                            />
                        ) : null}
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
                                onDay={(d) => go("day", d)}
                                onBlock={(b) => setPeek(b.key)}
                            />
                        </div>
                        <div className="min-[760px]:hidden">{agendaList}</div>
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
                    hoursHint="Change their hours in Availability."
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
