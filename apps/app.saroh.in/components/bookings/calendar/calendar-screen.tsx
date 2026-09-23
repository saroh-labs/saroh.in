"use client";

import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showUndo } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { formatMoney } from "@/lib/format/money";
import {
    cancelBooking,
    recordBookingOutcome,
    rescheduleBooking,
} from "@/lib/services/actions";
import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import type { Block, Column, LocalDate, Span } from "@/lib/services/diary";
import {
    addDays,
    blocksOnDay,
    bookedValue,
    clock,
    dayColumns,
    dayLabel,
    isLive,
    localDateOf,
    localMinuteOf,
    UNASSIGNED,
    visibleHours,
    weekStartOf,
    whoFor,
} from "@/lib/services/diary";
import type { Service, Slot } from "@/lib/services/service";
import type { BookingRules, StaffView } from "@/lib/staff/types";

import { AgendaList, AgendaMonth } from "./agenda-month";
import { BookingQuickLook } from "./booking-quick-look";
import { DayByPerson } from "./day-by-person";
import type { GapTarget } from "./new-booking-from-gap";
import { NewBookingFromGap } from "./new-booking-from-gap";
import type { HoursTarget } from "./open-hours-dialog";
import { OpenHoursDialog } from "./open-hours-dialog";
import { BookingsTopBar } from "./parts";
import type { QuickLookActions } from "./quick-look-types";
import { useHeld } from "./use-held";
import { WeekView } from "./week-view";

export type CalendarLayout = "day" | "week" | "agenda";

export function calendarHref(layout: CalendarLayout, date: LocalDate) {
    const q = new URLSearchParams({ date });
    if (layout !== "day") q.set("layout", layout);
    return `/bookings?${q.toString()}`;
}

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

/**
 * Bookings › Calendar (U15, the "Saroh Bookings" design): the day by person
 * (default), the week, or the agenda with the month. Everything is read from
 * the bookings read (U4) and the staff read (U3); free gaps are what is left
 * of each person's hours. A booking opens a quick look; a free gap books;
 * closed time opens hours. Changes the desk makes are held for their Undo.
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
    contacts,
    can,
    newBooking,
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
    contacts: ContactOption[];
    can: { book: boolean; hours: boolean };
    /** The full New booking dialog, for any service at any open time. */
    newBooking: ReactNode;
}) {
    const router = useRouter();
    const { hold, undo, pending } = useHeld();
    const [overrides, setOverrides] = useState<Record<string, Override>>({});
    const [peek, setPeek] = useState<string | null>(null);
    const [gap, setGap] = useState<GapTarget | null>(null);
    const [hours, setHours] = useState<HoursTarget | null>(null);
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
        () => dayColumns(calendar, staff, date, timezone, gapAfter, minFree),
        [calendar, staff, date, timezone, gapAfter, minFree],
    );
    const dayBlocks = columns
        .flatMap((c) => c.blocks)
        .sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
    const weekStart = weekStartOf(date);
    const week = useMemo(() => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        return days.map((d) => {
            const byPerson = blocksOnDay(calendar, d, timezone);
            return {
                date: d,
                label: dayLabel(d),
                blocks: Array.from(byPerson.values())
                    .flat()
                    .sort((a, b) => a.start - b.start),
                today: d === today,
                selected: d === date,
            };
        });
    }, [calendar, timezone, weekStart, today, date]);

    const shownBlocks =
        layout === "week" ? week.flatMap((d) => d.blocks) : dayBlocks;
    const span: Span = visibleHours([
        ...shownBlocks.map((b): Span => [b.start, b.end]),
        ...columns.flatMap((c) => c.day?.windows ?? []),
    ]);
    const live = shownBlocks.filter(isLive);
    const value = bookedValue(shownBlocks, money);
    const first = shownBlocks.at(0);
    const currencyCode = first
        ? ((first.kind === "one"
              ? first.booking.service.currency
              : first.session.service.currency) ?? null)
        : null;
    const summary = `${live.length} ${live.length === 1 ? "booking" : "bookings"}${
        value !== null && currencyCode
            ? ` · ${formatMoney(value, currencyCode)} booked`
            : ""
    }`;

    const peekBlock = peek
        ? ((layout === "week" ? week.flatMap((d) => d.blocks) : dayBlocks).find(
              (b) => b.key === peek,
          ) ??
          // A block opened from the week that is not on the day.
          week.flatMap((d) => d.blocks).find((b) => b.key === peek) ??
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
                        : `${who}'s place cancelled — the class goes back to the ${b.paidWith === "PACK" ? "pack" : "membership"}.`
                    : `${who}'s place cancelled.`
                : `Cancelled ${who}'s ${clock(localMinuteOf(b.startAt, timezone))}.`;
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
                `${title} cancelled.${back ? ` ${back} ${back === 1 ? "class" : "classes"} given back.` : ""}`,
                async () => {
                    let failed = 0;
                    for (const b of seats) {
                        const res = await cancelBooking(b.id, {
                            returnCredit: true,
                        });
                        if (!res.ok) {
                            failed += 1;
                            setOverride(b.id, was[b.id] ?? null);
                        }
                    }
                    if (failed) {
                        showError(
                            `${failed} ${failed === 1 ? "place" : "places"} could not be cancelled.`,
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
                const to = `${dayLabel(localDateOf(slot.startAt, timezone))} at ${clock(localMinuteOf(slot.startAt, timezone))}`;
                showUndo(`Moved ${firstName(b)} to ${to}.`, () => {
                    void rescheduleBooking(b.id, b.startAt).then((back) => {
                        if (!back.ok) showError(back.error);
                        router.refresh();
                    });
                });
            });
        },
    };

    // ── Free gaps and closed time ──────────────────────────────────────────

    function bookGap(column: Column, free: Span) {
        const person = staffById.get(column.key);
        if (!person) return;
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
        router.push(calendarHref(l, d), { scroll: false });
    const step = layout === "week" ? 7 : 1;
    const heading =
        layout === "week"
            ? `Week of ${dayLabel(weekStart).slice(4)}`
            : `${dayLabel(date)}${date === today ? " · today" : ""}`;

    const freeRows =
        staff === null
            ? null
            : columns.flatMap((c) =>
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

    const nowMinute =
        date === today ? localMinuteOf(new Date(now), timezone) : null;
    const lanes = [...(staff ?? []).map((p) => p.id), UNASSIGNED];
    const peekFromDay = (b: Block) => setPeek(b.key);

    const agendaList = (
        <AgendaList
            blocks={dayBlocks}
            selected={peek}
            onBlock={peekFromDay}
            empty={
                date === today
                    ? "Nothing booked today."
                    : `Nothing booked on ${dayLabel(date)}.`
            }
        />
    );

    return (
        <>
            <BookingsTopBar page="Calendar">
                <div
                    role="radiogroup"
                    aria-label="Layout"
                    className="ml-auto flex gap-0.5 rounded-[9px] bg-primary p-[3px]"
                >
                    {(
                        [
                            ["day", "Day by person", "Day"],
                            ["week", "Week", "Week"],
                            ["agenda", "Agenda", "Agenda"],
                        ] as const
                    ).map(([id, label, short]) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={layout === id}
                            onClick={() => go(id, date)}
                            className={cn(
                                "rounded-[7px] px-2.5 py-[5px] text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                layout === id
                                    ? "bg-card text-foreground"
                                    : "text-primary-foreground hover:bg-primary-hover",
                                id === "week" && "max-[759px]:hidden",
                            )}
                        >
                            <span className="max-[759px]:hidden">{label}</span>
                            <span className="min-[760px]:hidden">{short}</span>
                        </button>
                    ))}
                </div>
            </BookingsTopBar>
            <div className="px-[22px] pb-6 pt-[18px] max-[759px]:px-4">
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <h1 className="m-0 font-display text-[28px] font-semibold leading-tight tracking-[-0.03em]">
                        {heading}
                    </h1>
                    <div className="flex gap-1">
                        <NavLink
                            href={calendarHref(layout, addDays(date, -step))}
                            label={
                                layout === "week"
                                    ? "Previous week"
                                    : "Previous day"
                            }
                        >
                            ‹
                        </NavLink>
                        <Link
                            href={calendarHref(layout, today)}
                            scroll={false}
                            className="flex h-8 items-center rounded-[8px] border border-border bg-card px-[11px] text-[12.5px] font-semibold hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11"
                        >
                            Today
                        </Link>
                        <NavLink
                            href={calendarHref(layout, addDays(date, step))}
                            label={layout === "week" ? "Next week" : "Next day"}
                        >
                            ›
                        </NavLink>
                    </div>
                    <span
                        role="status"
                        className="ml-auto text-[12.5px] text-muted-foreground max-[759px]:ml-0"
                    >
                        {summary}
                    </span>
                    {newBooking}
                </div>
                <Legend canBook={can.book} canOpen={can.hours} />
                {staff === null ? (
                    <PartialNotice className="mb-3">
                        Hours and time off could not be loaded, so free times
                        aren&apos;t shown. The bookings below are complete.
                    </PartialNotice>
                ) : null}

                {layout === "day" ? (
                    <>
                        {columns.length > 1 ? (
                            <div
                                role="radiogroup"
                                aria-label="Whose day"
                                className="mb-2.5 flex gap-0.5 overflow-x-auto rounded-[10px] bg-muted p-[3px] min-[760px]:hidden"
                            >
                                {columns.map((c) => {
                                    const on = c.key === phoneKey;
                                    const n = c.blocks.filter(isLive).length;
                                    return (
                                        <button
                                            key={c.key}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            onClick={() =>
                                                setPhonePerson(c.key)
                                            }
                                            className={cn(
                                                "h-10 min-w-fit flex-1 whitespace-nowrap rounded-[8px] px-2.5 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                on
                                                    ? "bg-card text-foreground shadow-sm"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {c.name.split(" ")[0]} · {n}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                        {columns.length ? (
                            <DayByPerson
                                columns={columns}
                                span={span}
                                nowMinute={nowMinute}
                                phoneKey={phoneKey}
                                selected={peek}
                                canBook={can.book}
                                canOpenHours={can.hours}
                                dayText={dayLabel(date)}
                                onBlock={peekFromDay}
                                onFree={bookGap}
                                onClosed={openClosed}
                            />
                        ) : (
                            <NoOneYet canHours={can.hours} />
                        )}
                    </>
                ) : null}

                {layout === "week" ? (
                    <>
                        <div className="max-[759px]:hidden">
                            <WeekView
                                days={week}
                                span={span}
                                lanes={lanes}
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

                <RulesNote rules={rules} canHours={can.hours} />
            </div>

            <BookingQuickLook
                block={peekBlock}
                onClose={() => setPeek(null)}
                ctx={{ timezone, now, money, rules, canBook: can.book }}
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
                contacts={contacts}
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
        </>
    );
}

function NavLink({
    href,
    label,
    children,
}: {
    href: string;
    label: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            scroll={false}
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-[8px] border border-border bg-card text-[15px] hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:size-11"
        >
            {children}
        </Link>
    );
}

function Legend({ canBook, canOpen }: { canBook: boolean; canOpen: boolean }) {
    const sw = "inline-block h-2.5 w-3.5 rounded-[3px]";
    return (
        <ul className="mb-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11.5px] text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn(sw, "bg-diary-one")} />
                One-to-one
            </li>
            <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn(sw, "bg-diary-class")} />
                Class
            </li>
            <li className="inline-flex items-center gap-1.5">
                <span
                    aria-hidden
                    className={cn(
                        sw,
                        "border border-dashed border-success-subtle-foreground bg-success-subtle",
                    )}
                />
                {canBook ? "Free — click to book or block" : "Free"}
            </li>
            <li className="inline-flex items-center gap-1.5">
                <span
                    aria-hidden
                    className={cn(
                        sw,
                        "bg-[repeating-linear-gradient(135deg,transparent_0_3px,hsl(var(--border-strong))_3px_4px)]",
                    )}
                />
                {canOpen ? "Closed — click to open hours" : "Closed"}
            </li>
            <li className="inline-flex items-center gap-1.5">
                <span
                    aria-hidden
                    className={cn(
                        sw,
                        "bg-[repeating-linear-gradient(135deg,hsl(var(--destructive))_0_2px,transparent_2px_5px)]",
                    )}
                />
                Time off
            </li>
        </ul>
    );
}

/** "Customers can book up to 3 weeks ahead, until 2 hours before, …" */
export function rulesSentence(rules: BookingRules | null): string {
    const parts: string[] = [];
    if (rules?.bookAheadDays) {
        const d = rules.bookAheadDays;
        parts.push(
            `up to ${d % 7 === 0 ? `${d / 7} ${d === 7 ? "week" : "weeks"}` : `${d} ${d === 1 ? "day" : "days"}`} ahead`,
        );
    }
    if (rules?.latestBookingMinutes) {
        const m = rules.latestBookingMinutes;
        parts.push(
            `until ${m % 1440 === 0 ? `${m / 1440} ${m === 1440 ? "day" : "days"}` : m % 60 === 0 ? `${m / 60} ${m === 60 ? "hour" : "hours"}` : `${m} minutes`} before`,
        );
    }
    const book = parts.length
        ? `Customers can book ${parts.join(", ")}`
        : "Customers can book any free time";
    const cancel =
        rules?.freeCancelHours !== null && rules?.freeCancelHours !== undefined
            ? `, and cancel for free until ${rules.freeCancelHours} ${rules.freeCancelHours === 1 ? "hour" : "hours"} before`
            : "";
    return `${book}${cancel}. Free times are worked out from availability, minus bookings and the gap after each.`;
}

function RulesNote({
    rules,
    canHours,
}: {
    rules: BookingRules | null;
    canHours: boolean;
}) {
    return (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
            {rulesSentence(rules)}{" "}
            {canHours ? (
                <>
                    <Link
                        href="/bookings/availability"
                        className="text-brand hover:text-foreground"
                    >
                        Change hours and rules
                    </Link>
                    {" · "}
                </>
            ) : null}
            <Link
                href="/bookings/all"
                className="text-brand hover:text-foreground"
            >
                Every booking as a list
            </Link>
        </p>
    );
}

function NoOneYet({ canHours }: { canHours: boolean }) {
    return (
        <div className="rounded-[12px] border border-dashed border-border px-5 py-8 text-center">
            <p className="text-[14px] font-semibold">
                Nobody is on the diary yet
            </p>
            <p className="mx-auto mt-1 max-w-[52ch] text-[12.5px] text-muted-foreground">
                Add the people who take bookings and their hours, and each gets
                a column here with their free times to book.
            </p>
            {canHours ? (
                <Link
                    href="/bookings/availability"
                    className="mt-3 inline-flex h-[38px] items-center rounded-[9px] bg-primary px-4 text-[14px] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                    Add someone
                </Link>
            ) : null}
        </div>
    );
}
