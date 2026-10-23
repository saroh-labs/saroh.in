"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

import type { StartView } from "@/lib/services/bookings-opens";
import type { DayCell, DayFacts } from "@/lib/services/calendar-header";
import {
    addMonths,
    monthCells,
    monthTitle,
    weekCells,
    weekStripLabel,
} from "@/lib/services/calendar-header";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { addDays, weekStartOf } from "@/lib/services/diary";

import { BookingsViewSwitch } from "@/components/bookings/all-bookings/bookings-view-switch";
import { HeaderOverlay } from "./header-overlay";
import { usePhone } from "./use-phone";

const STEP_SMALL =
    "grid size-9 shrink-0 cursor-pointer place-items-center rounded-[8px] text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:size-11";
/** The eyebrow over each part: the `.label` utility. */
const LABEL = "label";
const HELP = "mt-1.5 text-[12.5px] leading-normal text-muted-foreground";
const VIEW_NAME = { day: "Day", week: "Week", list: "List" } as const;

/**
 * "Go to a day" (U2; BKMBookingsDayMonthSheet, BKDCalendarDay's date
 * popover): this week with each day's count, the month with dots for busy
 * days and "Closed" on days nobody works, Show as Day / Week / List, and
 * Go to today. Picking a day goes to it in the view shown; nothing here
 * changes a booking.
 *
 * The week and the month step on their own without leaving the sheet;
 * counts are known for the days the calendar read (its week and its
 * month), and other days show the date alone.
 */
export function DateSheet({
    open,
    onOpenChange,
    trigger,
    title,
    layout,
    date,
    today,
    facts,
    start,
    hrefFor,
    onGo,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: ReactElement;
    /** The header's own title: "Today, Mon 19 Oct". */
    title: string;
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    facts: (d: LocalDate) => DayFacts;
    /** "Start Bookings on", to say which view Bookings opens on. */
    start: StartView;
    /** The calendar's address for a view and a day, keeping the rest. */
    hrefFor: (layout: CalendarLayout, date: LocalDate) => string;
    /** Go to an address and close. */
    onGo: (href: string) => void;
}) {
    const phone = usePhone();
    const word = layout === "week" ? "week" : "day";
    return (
        <HeaderOverlay
            open={open}
            onOpenChange={onOpenChange}
            trigger={trigger}
            title="Go to a day"
            subtitle={title}
            width={372}
            footer={
                <Button
                    variant="outline"
                    className="w-full coarse:h-12"
                    onClick={() => onGo(hrefFor(layout, today))}
                >
                    Go to today
                </Button>
            }
        >
            <DateSheetBody
                layout={layout}
                date={date}
                today={today}
                facts={facts}
                phone={phone}
                onPick={(d) => onGo(hrefFor(layout, d))}
            />
            <p className={HELP}>
                Numbers and dots show how many bookings a day has.{" "}
                {phone
                    ? `Swipe the calendar left or right to go a ${word} back or on.`
                    : `The arrows beside the date go a ${word} back or on.`}
            </p>
            <div className={cn(LABEL, "mt-3.5")}>Show as</div>
            <div
                className="mt-1.5"
                // A view is a link: the page under the popover stays, so
                // it is closed as the link is followed.
                onClickCapture={(e) => {
                    if ((e.target as Element).closest("a")) onOpenChange(false);
                }}
            >
                <BookingsViewSwitch
                    current={layout}
                    hrefFor={(l) => hrefFor(l, date)}
                    withAll={false}
                    className="w-full [&>*]:flex-1"
                />
            </div>
            <p className={HELP}>
                {start === "last"
                    ? `Bookings opens on the view you leave it on, on this ${phone ? "phone" : "computer"}.`
                    : `Bookings always opens on ${VIEW_NAME[start]} for you. Change it under ⋯.`}
            </p>
        </HeaderOverlay>
    );
}

/** The week strip and the month, each stepping on its own. */
function DateSheetBody({
    layout,
    date,
    today,
    facts,
    phone,
    onPick,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    facts: (d: LocalDate) => DayFacts;
    phone: boolean;
    onPick: (d: LocalDate) => void;
}) {
    const [weekStart, setWeekStart] = useState(weekStartOf(date));
    const [month, setMonth] = useState(date.slice(0, 7));
    // In a week the whole week is picked; elsewhere the day.
    const picked = layout === "week" ? weekStartOf(date) : date;
    const isPicked = (c: DayCell) =>
        layout === "week" ? weekStartOf(c.date) === picked : c.picked;
    const week = weekCells(weekStart, date, today, facts);
    const { lead, days } = monthCells(month, date, today, facts);

    return (
        <>
            <div className="flex min-h-[34px] items-center gap-1">
                <span className={cn(LABEL, "flex-1")}>
                    {weekStripLabel(weekStart, today)}
                </span>
                <button
                    type="button"
                    aria-label="Previous week"
                    className={STEP_SMALL}
                    onClick={() => setWeekStart(addDays(weekStart, -7))}
                >
                    <ChevronLeft aria-hidden className="size-4" />
                </button>
                <button
                    type="button"
                    aria-label="Next week"
                    className={STEP_SMALL}
                    onClick={() => setWeekStart(addDays(weekStart, 7))}
                >
                    <ChevronRight aria-hidden className="size-4" />
                </button>
            </div>
            <div
                role="radiogroup"
                aria-label="Pick a day"
                className="mt-0.5 grid grid-cols-7 gap-0.5"
            >
                {week.map((c) => (
                    <button
                        key={c.date}
                        type="button"
                        role="radio"
                        aria-checked={isPicked(c)}
                        aria-label={c.label}
                        onClick={() => onPick(c.date)}
                        className="flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[10px] py-1.5 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:h-[60px] max-[759px]:rounded-[12px] max-[759px]:py-0"
                    >
                        <span
                            className={cn(
                                "text-[11px] font-medium text-muted-foreground",
                                c.today && "font-semibold text-destructive",
                            )}
                        >
                            {c.today
                                ? "Today"
                                : phone
                                  ? c.weekday.slice(0, 1)
                                  : c.weekday}
                        </span>
                        <span
                            className={cn(
                                "grid size-8 place-items-center rounded-full font-display text-[16px] font-semibold max-[759px]:size-[30px]",
                                c.picked &&
                                    "bg-primary text-primary-foreground",
                            )}
                        >
                            {c.day}
                        </span>
                        <span className="text-[10.5px] tabular-nums leading-tight text-muted-foreground max-[759px]:text-[10px] max-[759px]:font-semibold">
                            {c.closed
                                ? "Closed"
                                : c.count === null
                                  ? " "
                                  : c.count > 0
                                    ? c.count
                                    : "–"}
                        </span>
                    </button>
                ))}
            </div>

            <div className="mt-2 flex min-h-[34px] items-center gap-1 border-t border-border pt-1.5 max-[759px]:mt-3">
                <span className={cn(LABEL, "flex-1")}>{monthTitle(month)}</span>
                <button
                    type="button"
                    aria-label="Previous month"
                    className={STEP_SMALL}
                    onClick={() => setMonth(addMonths(month, -1))}
                >
                    <ChevronLeft aria-hidden className="size-4" />
                </button>
                <button
                    type="button"
                    aria-label="Next month"
                    className={STEP_SMALL}
                    onClick={() => setMonth(addMonths(month, 1))}
                >
                    <ChevronRight aria-hidden className="size-4" />
                </button>
            </div>
            <div
                role="group"
                aria-label={monthTitle(month)}
                className="grid grid-cols-7 gap-0.5 text-center"
            >
                {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
                    <span
                        key={i}
                        aria-hidden
                        className="py-[3px] text-[11px] text-muted-foreground max-[759px]:py-1 max-[759px]:text-[11.5px]"
                    >
                        {w}
                    </span>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                    <span key={`lead-${i}`} aria-hidden />
                ))}
                {days.map((c) => (
                    <button
                        key={c.date}
                        type="button"
                        aria-label={c.label}
                        aria-current={c.picked ? "date" : undefined}
                        onClick={() => onPick(c.date)}
                        className={cn(
                            "flex h-10 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[9px] text-[13.5px] font-medium tabular-nums text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:h-11 max-[759px]:gap-[3px] max-[759px]:rounded-[10px] max-[759px]:text-[14px]",
                            c.past && !c.picked && "text-muted-foreground",
                            c.today &&
                                !c.picked &&
                                "shadow-[inset_0_0_0_1.5px_hsl(var(--foreground))]",
                            c.picked &&
                                "bg-primary font-bold text-primary-foreground hover:bg-primary-hover",
                        )}
                    >
                        <span>{c.day}</span>
                        {c.closed ? (
                            <span
                                className={cn(
                                    "text-[8.5px] leading-[5px] max-[759px]:text-[9px]",
                                    c.picked
                                        ? "text-primary-foreground"
                                        : "text-muted-foreground",
                                )}
                            >
                                Closed
                            </span>
                        ) : (
                            <span aria-hidden className="flex h-1 gap-0.5">
                                {Array.from({ length: c.dots }, (_, i) => (
                                    <i
                                        key={i}
                                        className={cn(
                                            "size-1 rounded-full",
                                            c.picked
                                                ? "bg-primary-foreground"
                                                : "bg-diary-one",
                                        )}
                                    />
                                ))}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </>
    );
}
