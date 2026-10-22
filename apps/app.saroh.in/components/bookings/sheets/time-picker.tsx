"use client";

import { Button } from "@saroh/ui/button";
import { Calendar } from "@saroh/ui/calendar";
import { FailedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { CalendarDays } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import {
    ChipGroup,
    ChoiceGroup,
} from "@/components/shared/fields/choice-group";
import { formatTime } from "@/lib/format/datetime";
import { listAvailability } from "@/lib/services/actions";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, localDateOf, zonedInstant } from "@/lib/services/diary";
import type { PickerSlot } from "@/lib/services/time-picker";
import {
    dayName,
    firstName,
    nextFreeDay,
    partsOfDay,
    PICKER_DAYS,
    pickerDays,
    slotPerson,
    slotsByDay,
    takenMessage,
    zoneShortName,
} from "@/lib/services/time-picker";

/** Someone who takes the service. */
export interface TimePickerPerson {
    id: string;
    name: string;
}

/** "Anyone free" in the With chips. */
const ANYONE = "__anyone";

const WEEKDAY_LONG = [
    "Sundays",
    "Mondays",
    "Tuesdays",
    "Wednesdays",
    "Thursdays",
    "Fridays",
    "Saturdays",
];

/**
 * The one time picker (U3, BKMNewBookingStep4, BKMQuickLookStep2's Move,
 * BKDNewBooking step 4, BKDQuickLook's Move): New booking's day-and-time
 * step and Move use it, at both widths.
 *
 * - **With**: the people who take the service and "Anyone free" (shown
 *   when `people` has more than one, or `onWithChange` is given). With
 *   Anyone free, each time names who is free then.
 * - **Day strip**: two weeks from today, each day with how many times are
 *   free, "Closed" on a day the business is shut, and **Pick a date** for
 *   a day further on.
 * - **Times** of the chosen day, Morning then Afternoon and evening, in
 *   the business's zone with its short label (Q10). Only free times are
 *   offered: the same read the booking page uses.
 * - **No times that day**: why, in one line, "Why isn't a time offered?",
 *   and **Next free day** to jump to it.
 * - **A time just taken**: pass the refused start as `taken`; the picker
 *   says "10:00 am was just booked by someone else. Pick another time."
 *   and reads the times again. The sheet around it stays open.
 *
 * Controlled for the time (`value`, `onChange`) and the person
 * (`withId`, `onWithChange`); it reads the times itself.
 */
export function TimePicker({
    serviceId,
    timezone,
    value,
    onChange,
    people = [],
    withId = null,
    onWithChange,
    taken = null,
    reloadKey = 0,
    closedWeekdays = [],
    slotNote,
    initialDay,
    hoursHref = "/bookings/availability",
    withChips,
    strip = true,
    now: nowProp,
    className,
}: {
    serviceId: string;
    /** The business's zone (Q10). */
    timezone: string;
    /** The chosen start, ISO; null for none yet. */
    value: string | null;
    /**
     * A time was picked (or the day changed, and it is cleared): with who
     * takes it, by name, when the picker knows (Anyone free names them).
     */
    onChange: (startAt: string | null, person: TimePickerPerson | null) => void;
    /** Who takes the service; With is shown for more than one. */
    people?: readonly TimePickerPerson[];
    /** Whose diary the times are read from; null for Anyone free. */
    withId?: string | null;
    onWithChange?: (id: string | null) => void;
    /** A start the API just refused as taken: said, and read again. */
    taken?: string | null;
    /** Bump to read the times again. */
    reloadKey?: number;
    /** Days the business is shut, 0 = Sunday, to say "Closed". */
    closedWeekdays?: readonly number[];
    /** A note under a time, such as a class's "4 places left". */
    slotNote?: (slot: PickerSlot) => string | null;
    /** The day to open on; today when left out. */
    initialDay?: LocalDate;
    /** Where "Why isn't a time offered?" points for more. */
    hoursHref?: string;
    /**
     * Draw the With chips. Left out: when there is more than one person,
     * or `onWithChange` is given. New booking asks who they'll see on a
     * step of its own (U8), so it passes false.
     */
    withChips?: boolean;
    /**
     * Draw the day strip and Pick a date. False shows only the times of
     * `initialDay`, for a flow that chose the day itself (Book their next
     * visit's Tomorrow / Next week / Pick a date, Q16).
     */
    strip?: boolean;
    /** For tests: what "now" is. */
    now?: number;
    className?: string;
}) {
    const ids = {
        with: useId(),
        day: useId(),
        times: useId(),
        why: useId(),
    };
    const [now] = useState(() => nowProp ?? Date.now());
    const today = localDateOf(new Date(now), timezone);
    // Two weeks from today, unless the day to open on is further on.
    const [windowStart, setWindowStart] = useState<LocalDate>(
        initialDay && initialDay >= addDays(today, PICKER_DAYS)
            ? initialDay
            : today,
    );
    const [day, setDay] = useState<LocalDate>(initialDay ?? today);
    // A read that failed is said as one, with Try again, never as a day
    // with no free times.
    const [read, setRead] = useState<
        | { key: string; slots: PickerSlot[] }
        | { key: string; failed: true }
        | null
    >(null);
    const [retry, setRetry] = useState(0);
    const [askedWhy, setAskedWhy] = useState(false);
    const [pickOpen, setPickOpen] = useState(false);

    const readKey = `${serviceId}|${withId ?? ""}|${windowStart}|${reloadKey}|${taken ?? ""}|${retry}`;
    useEffect(() => {
        let live = true;
        const start = zonedInstant(windowStart, 0, timezone).getTime();
        const from = new Date(Math.max(start, now)).toISOString();
        const to = zonedInstant(
            addDays(windowStart, PICKER_DAYS),
            0,
            timezone,
        ).toISOString();
        listAvailability(serviceId, from, to, withId ?? undefined).then(
            (slots) => {
                if (live) setRead({ key: readKey, slots });
            },
            () => {
                if (live) setRead({ key: readKey, failed: true });
            },
        );
        return () => {
            live = false;
        };
    }, [readKey, serviceId, withId, windowStart, timezone, now]);

    const loading = read?.key !== readKey;
    const failed = read?.key === readKey && "failed" in read;
    const slots = useMemo(
        () => (read && !loading && "slots" in read ? read.slots : []),
        [read, loading],
    );
    const byDay = useMemo(() => slotsByDay(slots, timezone), [slots, timezone]);
    const days = pickerDays({
        from: windowStart,
        today,
        byDay,
        closedWeekdays,
        timeZone: timezone,
    });
    const dayShown = days.find((d) => d.date === day);
    const daySlots = byDay.get(day) ?? [];
    const { morning, later } = partsOfDay(daySlots, timezone);
    const next = loading || failed ? null : nextFreeDay(days, day);
    const person = withId ? people.find((p) => p.id === withId) : null;
    const zone = zoneShortName(timezone, now);
    const showWith =
        withChips ?? (people.length > 1 || onWithChange !== undefined);

    function pickDay(date: LocalDate) {
        setDay(date);
        setAskedWhy(false);
        if (value) onChange(null, null);
        const end = addDays(windowStart, PICKER_DAYS);
        if (date < windowStart || date >= end) {
            setWindowStart(date < today ? today : date);
        }
    }

    function pickTime(startAt: string) {
        const slot = daySlots.find((s) => s.startAt === startAt);
        const who = person ?? (slot ? slotPerson(slot, people) : null) ?? null;
        onChange(startAt, who);
    }

    const timeLabel = (slot: PickerSlot) => {
        const note =
            slotNote?.(slot) ??
            (withId === null && people.length > 1
                ? (() => {
                      const who = slotPerson(slot, people);
                      return who ? firstName(who.name) : null;
                  })()
                : null);
        return (
            <>
                <span>{formatTime(slot.startAt, timezone)}</span>
                {note ? (
                    <small className="text-[11px] font-medium opacity-75">
                        {note}
                    </small>
                ) : null}
            </>
        );
    };

    const timeButton = (on: boolean) =>
        cn(
            "flex min-h-12 min-w-0 flex-col items-center justify-center rounded-[10px] border px-1 py-1 text-[14px] font-medium tabular-nums",
            on
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-foreground hover:border-border-strong active:bg-accent-active",
        );

    const closedWord = WEEKDAY_LONG[new Date(`${day}T00:00:00Z`).getUTCDay()];

    return (
        <div className={cn("grid min-w-0 gap-3.5", className)}>
            {showWith ? (
                <div className="grid min-w-0 gap-1.5">
                    <span id={ids.with} className="label">
                        With
                    </span>
                    <ChipGroup
                        labelledBy={ids.with}
                        value={withId ?? ANYONE}
                        onChange={(v) => {
                            if (value) onChange(null, null);
                            onWithChange?.(v === ANYONE ? null : v);
                        }}
                        choices={[
                            { value: ANYONE, label: "Anyone free" },
                            ...people.map((p) => ({
                                value: p.id,
                                label: firstName(p.name),
                            })),
                        ]}
                    />
                </div>
            ) : null}

            <div className={cn("grid min-w-0 gap-1.5", !strip && "hidden")}>
                <span id={ids.day} className="label">
                    Day
                </span>
                <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none]">
                    <ChoiceGroup
                        labelledBy={ids.day}
                        className="flex gap-1.5"
                        value={day}
                        onChange={pickDay}
                        choices={days.map((d) => ({
                            value: d.date,
                            ariaLabel: d.aria,
                            label: (
                                <>
                                    <span className="text-[11px] font-medium opacity-80">
                                        {d.weekday}
                                    </span>
                                    <span className="font-display text-[17px] font-semibold leading-[1.1]">
                                        {d.day}
                                    </span>
                                    <span className="text-[10.5px] font-semibold tabular-nums opacity-80">
                                        {loading || failed ? "…" : d.count}
                                    </span>
                                </>
                            ),
                        }))}
                        itemClassName={(on, choice) =>
                            cn(
                                "flex h-[62px] w-[50px] shrink-0 flex-col items-center justify-center gap-px rounded-[12px] border p-0",
                                on
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border bg-card text-foreground hover:border-border-strong",
                                !on &&
                                    choice.value === today &&
                                    "border-[1.5px] border-foreground",
                                !on &&
                                    days.find((d) => d.date === choice.value)
                                        ?.closed &&
                                    "bg-[repeating-linear-gradient(135deg,hsl(var(--card))_0_6px,hsl(var(--muted))_6px_9px)]",
                            )
                        }
                    />
                    <Popover open={pickOpen} onOpenChange={setPickOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-[62px] w-[76px] shrink-0 flex-col gap-0.5 rounded-[12px] px-1 text-[10.5px] font-semibold coarse:h-[62px]"
                            >
                                <CalendarDays
                                    aria-hidden
                                    className="size-[18px]"
                                />
                                Pick a date
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={new Date(`${day}T12:00:00Z`)}
                                disabled={{
                                    before: new Date(`${today}T12:00:00Z`),
                                }}
                                onSelect={(picked) => {
                                    if (!picked) return;
                                    const y = picked.getFullYear();
                                    const m = String(
                                        picked.getMonth() + 1,
                                    ).padStart(2, "0");
                                    const d = String(picked.getDate()).padStart(
                                        2,
                                        "0",
                                    );
                                    pickDay(`${y}-${m}-${d}`);
                                    setPickOpen(false);
                                }}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span id={ids.times} className="text-[15px] font-semibold">
                        {dayName(day, today, timezone)}
                    </span>
                    <span className="text-[12.5px] text-muted-foreground">
                        {person ? `With ${person.name} · ` : ""}times in{" "}
                        {zone || timezone}
                    </span>
                </div>

                {taken ? (
                    <Notice tone="warning" role="alert">
                        {takenMessage(taken, timezone)}
                    </Notice>
                ) : null}

                {loading ? (
                    <div aria-busy="true" className="grid gap-2">
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {Array.from({ length: 9 }, (_, i) => (
                                <Skeleton
                                    key={i}
                                    className="h-12 rounded-[10px]"
                                />
                            ))}
                        </div>
                        <p className="text-[12.5px] text-muted-foreground">
                            Finding free times…
                        </p>
                    </div>
                ) : failed ? (
                    <FailedState
                        size="inline"
                        title="Couldn't load times"
                        description="Nothing has changed. Try again in a moment."
                        onRetry={() => setRetry((n) => n + 1)}
                    />
                ) : daySlots.length > 0 ? (
                    <ChoiceGroup
                        labelledBy={ids.times}
                        value={value}
                        onChange={pickTime}
                        choices={daySlots.map((s) => ({
                            value: s.startAt,
                            label: timeLabel(s),
                        }))}
                        itemClassName={(on) => timeButton(on)}
                        layout={(item) => (
                            <div className="grid gap-3">
                                {morning.length > 0 ? (
                                    <div className="grid gap-1.5">
                                        <span className="label">Morning</span>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                            {morning.map((s) =>
                                                item(s.startAt),
                                            )}
                                        </div>
                                    </div>
                                ) : null}
                                {later.length > 0 ? (
                                    <div className="grid gap-1.5">
                                        <span className="label">
                                            Afternoon and evening
                                        </span>
                                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                            {later.map((s) => item(s.startAt))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        )}
                    />
                ) : (
                    <div className="grid justify-items-center gap-1.5 rounded-[12px] border border-border bg-card px-4 py-5 text-center">
                        <p className="text-[15px] font-semibold">
                            No free times on{" "}
                            {dayName(day, today, timezone).replace(
                                /^Today /,
                                "",
                            )}
                        </p>
                        <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                            {dayShown?.closed
                                ? `You're closed on ${closedWord}.`
                                : person
                                  ? `${firstName(person.name)} has no free time that day.`
                                  : "Nobody has free time that day."}{" "}
                            <Button
                                type="button"
                                variant="link"
                                size="inline"
                                aria-expanded={askedWhy}
                                aria-controls={ids.why}
                                className="font-semibold text-foreground underline"
                                onClick={() => setAskedWhy((v) => !v)}
                            >
                                Why isn&apos;t a time offered?
                            </Button>
                        </p>
                        {askedWhy ? (
                            <p
                                id={ids.why}
                                className="max-w-[44ch] text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                            >
                                A time is offered inside{" "}
                                {person
                                    ? `${firstName(person.name)}'s`
                                    : "your"}{" "}
                                working hours and the service&apos;s own hours,
                                when nobody is booked then and it is far enough
                                ahead for your booking rules. You can change
                                them in{" "}
                                <TextLink href={hoursHref}>
                                    Hours and time off
                                </TextLink>
                                .
                            </p>
                        ) : null}
                        {next ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="mt-1.5"
                                data-ph-unmask=""
                                onClick={() => pickDay(next.date)}
                            >
                                Next free day:{" "}
                                {dayName(next.date, today, timezone)}
                            </Button>
                        ) : (
                            <p className="text-[12.5px] text-muted-foreground">
                                The days shown are full. Pick a date further
                                ahead.
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
