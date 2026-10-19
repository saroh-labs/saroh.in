"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Globe,
    MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import { formatDay } from "@/lib/format/datetime";
import type { BookingsOpens, ShowFor } from "@/lib/services/bookings-opens";
import { EVERYONE } from "@/lib/services/bookings-opens";
import type { DayFacts } from "@/lib/services/calendar-header";
import { dayRange, headerTitle } from "@/lib/services/calendar-header";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import { callName } from "@/lib/services/call-name";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, weekStartOf } from "@/lib/services/diary";

import { DateSheet } from "./date-sheet";
import { OptionsSheet } from "./options-sheet";
import type { PersonChoice } from "./people-sheet";
import { PeopleSheet, PersonFace } from "./people-sheet";
import { useBookingsOpens } from "./use-bookings-opens";

type Open = "date" | "people" | "opts" | null;

const STEP =
    "flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11";
/** On a phone the arrows are for a keyboard and a screen reader: swipe is the touch. */
const PHONE_STEP =
    "max-[759px]:sr-only max-[759px]:focus:not-sr-only max-[759px]:focus:absolute max-[759px]:focus:z-10 max-[759px]:focus:bg-card";

/**
 * Header C (U2, #1018; BKMBookingsDay on a phone, BKDCalendarDay on the
 * desk): one header for Day, Week and List. A date title that opens Go to a
 * day (the week, the month, Show as, Go to today); a person chip that opens
 * Whose bookings; "…" with the view's options; one summary line. On the
 * desk the arrows beside the date go a day (or week) back or on and the
 * line ends "Times in IST"; on a phone the arrows are for a keyboard and a
 * screen reader, and the calendar is swiped.
 *
 * Everything the old toolbar row held has a place: back and forward, Today
 * (Go to today), the view switch (Show as), the person switch (the chip),
 * the cancelled toggle, the colour key, All bookings and Hours (the "…"
 * sheet), and New booking (beside "…", a floating button on a phone).
 */
export function CalendarHeader({
    layout,
    date,
    today,
    summary,
    zone,
    choices,
    picked,
    facts,
    cancelled,
    opens: kept,
    me,
    hrefFor,
    newBooking,
    calOnly,
    onAddPerson,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    /** The one line: "5 booked · 3 free times · ₹2,400 booked". */
    summary: string;
    /** The business's zone, short: "IST". */
    zone: string;
    /** Everyone, then each person on the diary; empty with nobody to pick. */
    choices: readonly PersonChoice[];
    /** Whose bookings are shown: a staff id or `EVERYONE`. */
    picked: string;
    facts: (d: LocalDate) => DayFacts;
    cancelled: {
        count: number;
        shown: boolean;
        onChange: (on: boolean) => void;
    };
    /** Where Bookings opens for this person, as kept. */
    opens: BookingsOpens;
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me: { id: string; name: string } | null;
    /** The calendar's address for a layout, a day and a person. */
    hrefFor: (
        layout: CalendarLayout,
        date: LocalDate,
        person?: string,
    ) => string;
    newBooking: ReactNode;
    /** They see the calendar but can't book or change bookings. */
    calOnly: boolean;
    /** Add someone who takes bookings, for someone who may. */
    onAddPerson?: () => void;
}) {
    const router = useRouter();
    const [open, setOpen] = useState<Open>(null);
    const { opens, change } = useBookingsOpens(kept);
    const toggle = (which: Exclude<Open, null>) => (o: boolean) =>
        setOpen(o ? which : null);
    const go = (href: string) => {
        setOpen(null);
        router.push(href, { scroll: false });
    };

    const title = headerTitle(layout, date, today);
    const step = layout === "week" ? 7 : 1;
    const unit = layout === "week" ? "week" : "day";
    const inWeek = layout === "week";
    const weekStart = weekStartOf(date);
    const periodWord = inWeek ? "this week" : "today";
    const period = inWeek
        ? `${dayRange(weekStart, addDays(weekStart, 6), " to ")}${weekStart === weekStartOf(today) ? " · this week" : ""}`
        : `${formatDay(date, { weekday: "short", today })}${date === today ? " · today" : ""}`;
    const optsTitle =
        layout === "week"
            ? "This week"
            : layout === "agenda"
              ? "This list"
              : "This day";

    const person = choices.find((c) => c.key === picked) ?? choices.at(0);
    const others = choices.filter((c) => c.key !== EVERYONE);
    // One person in the business: no chip, the title alone (U2).
    const showChip = others.length > 1;
    const everyone = picked === EVERYONE || person === undefined;
    const whoName = everyone ? "Everyone" : person.name;
    const remembered =
        !everyone && opens.showFor === "last"
            ? `Showing ${callName(whoName)}, your last pick`
            : null;
    const hoursLabel = everyone
        ? "Hours and time off"
        : `${callName(whoName)}’s hours and time off`;
    const hoursHref = everyone
        ? "/bookings/availability"
        : `/bookings/availability?person=${encodeURIComponent(picked)}`;

    const pickPerson = (key: string) => {
        go(hrefFor(layout, date, key));
        void change({ lastPerson: key === EVERYONE ? null : key });
    };
    const pickShowFor = (showFor: ShowFor) => {
        void change({ showFor });
        if (showFor === "all") go(hrefFor(layout, date, EVERYONE));
        else if (showFor === "me" && me) go(hrefFor(layout, date, me.id));
    };

    const titleButton = (
        <button
            type="button"
            aria-label={`${title}. Change the day or the view`}
            data-calendar-title=""
            className={cn(
                "inline-flex h-11 min-w-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] pl-1.5 pr-2 font-display text-[28px] font-semibold tracking-[-0.03em] text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted",
                "max-[759px]:h-12 max-[759px]:flex-1 max-[759px]:gap-1 max-[759px]:rounded-none max-[759px]:px-0 max-[759px]:text-left max-[759px]:text-[19px] max-[759px]:tracking-[-0.02em] max-[759px]:hover:bg-transparent max-[759px]:data-[state=open]:bg-transparent",
            )}
        >
            <span className="min-w-0 truncate">{title}</span>
            <ChevronDown
                aria-hidden
                className="size-5 shrink-0 max-[759px]:size-[18px]"
            />
        </button>
    );

    const chip = person ? (
        <button
            type="button"
            aria-label={`Whose bookings: ${whoName}. Change`}
            className="inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card pl-1 pr-2.5 text-[13.5px] font-semibold text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground max-[759px]:h-11 max-[759px]:text-[14px]"
        >
            {/* Faces: on the desk a stack of everyone's, on a phone one. */}
            <span aria-hidden className="flex max-[759px]:hidden">
                {(everyone ? others.slice(0, 3) : [person]).map((c, i) => (
                    <PersonFace
                        key={c.key}
                        choice={c}
                        className={cn(
                            "size-7 border-2 border-card text-[10.5px]",
                            i > 0 && "-ml-2",
                        )}
                    />
                ))}
            </span>
            <PersonFace
                choice={everyone ? { key: EVERYONE, initials: "All" } : person}
                className="size-[34px] text-[11.5px] min-[760px]:hidden"
            />
            <span className="max-[759px]:hidden">{whoName}</span>
            <span className="min-[760px]:hidden">
                {everyone ? "Everyone" : callName(whoName)}
            </span>
            <ChevronDown aria-hidden className="size-4" />
        </button>
    ) : null;

    const optsButton = (
        <button
            type="button"
            aria-label={`${optsTitle}: show cancelled, all bookings, hours, start on, colours`}
            className="grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-[9px] border border-border bg-card text-foreground/80 transition-colors duration-fast hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground max-[759px]:size-11 max-[759px]:rounded-full"
        >
            <MoreHorizontal aria-hidden className="size-[18px]" />
        </button>
    );

    return (
        <div
            data-calendar-header=""
            className="relative mb-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 max-[759px]:mb-3 max-[759px]:gap-x-2 max-[759px]:gap-y-0 max-[759px]:border-b max-[759px]:border-border max-[759px]:pb-0.5"
        >
            <Link
                href={hrefFor(layout, addDays(date, -step))}
                scroll={false}
                aria-label={`Previous ${unit}`}
                className={cn(STEP, PHONE_STEP, "order-1")}
            >
                <ChevronLeft aria-hidden className="size-4" />
            </Link>
            <Link
                href={hrefFor(layout, addDays(date, step))}
                scroll={false}
                aria-label={`Next ${unit}`}
                className={cn(
                    STEP,
                    PHONE_STEP,
                    "order-1 -ml-1 max-[759px]:ml-0",
                )}
            >
                <ChevronRight aria-hidden className="size-4" />
            </Link>

            <h1 className="order-2 m-0 flex min-w-0 max-[759px]:flex-1">
                <DateSheet
                    open={open === "date"}
                    onOpenChange={toggle("date")}
                    trigger={titleButton}
                    title={title}
                    layout={layout}
                    date={date}
                    today={today}
                    facts={facts}
                    start={opens.start}
                    hrefFor={(l, d) => hrefFor(l, d, picked)}
                    onGo={go}
                />
            </h1>

            {showChip && chip ? (
                <div className="order-3">
                    <PeopleSheet
                        open={open === "people"}
                        onOpenChange={toggle("people")}
                        trigger={chip}
                        period={period}
                        periodWord={periodWord}
                        choices={choices}
                        picked={everyone ? EVERYONE : picked}
                        showFor={opens.showFor}
                        onPick={pickPerson}
                        onAdd={onAddPerson}
                    />
                </div>
            ) : null}

            {/* A phone's own line break: the summary starts the second row. */}
            <span
                aria-hidden
                className="order-4 hidden basis-full max-[759px]:block"
            />

            <div className="order-6 flex min-h-11 basis-full items-center gap-2 text-[13px] tabular-nums text-muted-foreground max-[759px]:order-5 max-[759px]:min-w-0 max-[759px]:flex-1 max-[759px]:basis-auto max-[759px]:text-[13.5px] max-[759px]:text-foreground/80 min-[760px]:min-h-0 min-[760px]:pl-[84px]">
                <span role="status" className="min-w-0 max-[759px]:flex-1">
                    {summary}
                </span>
                <span aria-hidden className="max-[759px]:hidden">
                    ·
                </span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap max-[759px]:hidden">
                    <Globe aria-hidden className="size-[13px]" />
                    Times in {zone}
                </span>
                {remembered ? (
                    <>
                        <span aria-hidden className="max-[759px]:hidden">
                            ·
                        </span>
                        <span className="max-[759px]:hidden">{remembered}</span>
                    </>
                ) : null}
            </div>

            <div className="order-5 ml-auto flex items-center gap-2 max-[759px]:order-6 max-[759px]:ml-0">
                <OptionsSheet
                    open={open === "opts"}
                    onOpenChange={toggle("opts")}
                    trigger={optsButton}
                    title={optsTitle}
                    summary={summary}
                    cancelled={{
                        shown: cancelled.shown,
                        onChange: cancelled.onChange,
                        line:
                            cancelled.count > 0
                                ? `${cancelled.count} cancelled ${periodWord}`
                                : `None cancelled ${periodWord}`,
                    }}
                    allBookingsHref="/bookings/all"
                    hours={{ href: hoursHref, label: hoursLabel }}
                    start={opens.start}
                    onStart={(start) => void change({ start })}
                    showFor={opens.showFor}
                    onShowFor={pickShowFor}
                    me={me ? callName(me.name) : null}
                    whoNow={everyone ? "everyone" : whoName}
                />
                {newBooking}
            </div>

            {calOnly ? (
                <p className="order-7 m-0 basis-full text-[12.5px] text-muted-foreground max-[759px]:pb-2 min-[760px]:pl-[84px]">
                    Your role sees the calendar only, so you can't book or
                    change bookings. An owner can change this in Settings ›
                    Team.
                </p>
            ) : null}
        </div>
    );
}
