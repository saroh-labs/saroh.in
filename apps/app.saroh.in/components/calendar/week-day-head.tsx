"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

import type { WeekColumn } from "@/lib/calendar/week-columns";
import type { ClosedDay } from "@/lib/calendar/week-days";
import { dayOnWords } from "@/lib/calendar/week-days";

/** What the Calendar week adds to each day on the desk (bookings U14). */
export interface DayExtra {
    /** Nobody takes bookings that day, and why. */
    closed: ClosedDay | null;
    /** "Book" on that day: Bookings opening New booking on it (U8). */
    book: string | null;
    /** "Open hours on this day", for whoever may change hours. */
    openHours: string | null;
}

export const NO_EXTRA: DayExtra = { closed: null, book: null, openHours: null };

/**
 * A day's head on the desk's week, after BKDCalWeek: its weekday and date
 * with how many things are on ("11 on", "Closed"), what came in and went
 * out, who is off and its named problem — all one button that opens the
 * day — and under it "Book" for that day, or "Closed on Sundays". Shared
 * by the hour grid and the card columns, so the two say the same thing.
 * Keeps `#calendar-week [data-day]` for the day sheet's focus.
 */
export function DayHead({
    column: col,
    extra,
    onPick,
    className,
}: {
    column: WeekColumn;
    extra: DayExtra;
    onPick: (date: string) => void;
    className?: string;
}) {
    const { closed, book } = extra;
    // A closure is in the column's own label already.
    const label =
        closed && !col.off?.striped
            ? `${col.label}, ${closed.title}`
            : col.label;
    return (
        <div
            className={cn(
                "grid min-w-0 content-start",
                col.outside
                    ? "bg-neutral-50 dark:bg-muted"
                    : col.selected
                      ? "bg-muted"
                      : col.isToday
                        ? "bg-muted/50"
                        : "",
                col.isToday && "shadow-[inset_0_2px_0_hsl(var(--foreground))]",
                className,
            )}
        >
            <button
                type="button"
                data-day={col.date}
                onClick={() => onPick(col.date)}
                disabled={col.outside}
                aria-label={label}
                aria-haspopup="dialog"
                aria-current={col.isToday ? "date" : undefined}
                className={cn(
                    "grid min-w-0 gap-[3px] px-2.5 pb-1 pt-2 text-left font-sans text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    col.outside
                        ? "cursor-default"
                        : "cursor-pointer hover:bg-muted/60 active:bg-muted",
                )}
            >
                <span className="flex min-w-0 items-baseline gap-1.5">
                    <span
                        className={cn(
                            "label",
                            col.isToday && "text-destructive",
                        )}
                    >
                        {col.dow}
                    </span>
                    <span
                        className={cn(
                            "font-display text-[17px] font-semibold",
                            col.outside
                                ? "text-neutral-400 dark:text-muted-foreground"
                                : col.past && !col.isToday
                                  ? "text-muted-foreground"
                                  : "text-foreground",
                        )}
                    >
                        {col.n}
                    </span>
                    {col.outside ? null : (
                        <span
                            aria-hidden
                            className="ml-auto whitespace-nowrap text-[11.5px] text-muted-foreground"
                        >
                            {dayOnWords(col.count, closed !== null)}
                        </span>
                    )}
                </span>
                {/* In, then out; the head's label says both. */}
                {col.moneyIn || col.moneyOut ? (
                    <span
                        aria-hidden
                        className="flex gap-2 text-[11px] font-semibold tabular-nums"
                    >
                        <span className="text-success-subtle-foreground">
                            {col.moneyIn}
                        </span>
                        <span className="text-destructive-subtle-foreground">
                            {col.moneyOut}
                        </span>
                    </span>
                ) : null}
                {col.off && !closed ? (
                    <span
                        aria-hidden
                        title={col.off.title}
                        className="truncate text-[10.5px] font-semibold text-muted-foreground"
                    >
                        {col.off.text}
                    </span>
                ) : null}
                {col.problem ? (
                    <span
                        aria-hidden
                        className="truncate text-[10.5px] font-bold text-destructive-subtle-foreground"
                    >
                        {col.problem}
                    </span>
                ) : null}
            </button>
            <div className="min-h-2 px-2.5 pb-2">
                {book ? (
                    <Link
                        href={book}
                        aria-label={`Book on ${col.dow} ${col.n}`}
                        className="inline-flex min-h-7 items-center gap-1 text-[12px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-muted-foreground coarse:min-h-11"
                    >
                        <Plus
                            aria-hidden
                            className="size-3"
                            strokeWidth={2.4}
                        />
                        Book
                    </Link>
                ) : closed ? (
                    <span
                        className="block truncate text-[11.5px] font-semibold text-muted-foreground"
                        title={closed.title}
                    >
                        {closed.title}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

/**
 * A closed day's body (BKDCalWeek's Sunday): "Closed on Sundays · Nothing
 * is on this day", and "Open hours on this day" for whoever may change
 * hours, which opens that day in Bookings.
 */
export function ClosedCard({
    extra: { closed, openHours },
    className,
}: {
    /** Nothing is drawn for a day that is open. */
    extra: DayExtra;
    className?: string;
}) {
    if (!closed) return null;
    return (
        <div
            className={cn(
                "flex flex-col items-center gap-2 rounded-[10px] border border-border bg-card px-2 py-3.5 text-center",
                className,
            )}
        >
            <span className="text-[13px] font-semibold">{closed.title}</span>
            <span className="text-[11.5px] text-muted-foreground">
                {closed.line}
            </span>
            {openHours ? (
                <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-auto min-h-8 whitespace-normal px-2.5 py-1.5 text-[12px] leading-[1.3] coarse:min-h-11"
                >
                    <Link href={openHours}>Open hours on this day</Link>
                </Button>
            ) : null}
        </div>
    );
}
