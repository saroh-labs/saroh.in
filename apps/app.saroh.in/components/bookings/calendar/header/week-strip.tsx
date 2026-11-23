"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { useScreenLink } from "@/components/shared/page/screen-pending";
import type { DayFacts } from "@/lib/services/calendar-header";
import { weekCells } from "@/lib/services/calendar-header";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import type { LocalDate } from "@/lib/services/diary";
import { weekStartOf } from "@/lib/services/diary";

/**
 * The week on screen (BKVCalendarB, BKVCalendarBPhone): Mon to Sun of the
 * day shown, each with its count ("3"), "Closed" or a dash, one press to go
 * to that day in the view shown. "Go to a day" keeps its own week and
 * month; this is the same week without opening anything.
 */
export function WeekStrip({
    layout,
    date,
    today,
    facts,
    hrefFor,
}: {
    layout: CalendarLayout;
    date: LocalDate;
    today: LocalDate;
    facts: (d: LocalDate) => DayFacts;
    hrefFor: (layout: CalendarLayout, date: LocalDate) => string;
}) {
    const screenLink = useScreenLink();
    const cells = weekCells(weekStartOf(date), date, today, facts);
    return (
        <nav
            aria-label="This week"
            data-week-strip=""
            className="order-8 mt-1 grid basis-full grid-cols-7 gap-0.5"
        >
            {cells.map((c) => {
                const href = hrefFor(layout, c.date);
                return (
                    <Link
                        key={c.date}
                        href={href}
                        onNavigate={screenLink(href)}
                        scroll={false}
                        aria-label={c.label}
                        aria-current={c.picked ? "date" : undefined}
                        className={cn(
                            "flex min-h-11 flex-col items-center justify-center gap-px rounded-[10px] border border-transparent py-1 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            c.picked && "border-foreground bg-card",
                        )}
                    >
                        <span
                            className={cn(
                                "text-[11px] font-medium text-muted-foreground",
                                c.today && "font-semibold text-destructive",
                            )}
                        >
                            {c.weekday}
                        </span>
                        <span className="font-display text-[16px] font-semibold leading-tight">
                            {c.day}
                        </span>
                        <span
                            data-ph-unmask=""
                            className="text-[10.5px] tabular-nums leading-tight text-muted-foreground"
                        >
                            {c.closed
                                ? "Closed"
                                : c.count === null
                                  ? " "
                                  : c.count > 0
                                    ? c.count
                                    : "–"}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
