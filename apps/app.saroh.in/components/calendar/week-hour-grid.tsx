"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { GRID_PX, hourLabels } from "@/lib/calendar/hour-layout";
import type { HourDay } from "@/lib/calendar/week-hours";

import { Tip } from "@saroh/ui/tooltip";
import { TONE_BORDER, TONE_FILL } from "./tones";
import { STRIPED } from "./week-columns";
import type { DayExtra } from "./week-day-head";
import { ClosedCard, DayHead, NO_EXTRA } from "./week-day-head";

/** The gutter the hour labels sit in, then Monday to Sunday. */
const COLS = "grid grid-cols-[52px_repeat(7,minmax(0,1fr))]";

/** A line every hour, as the design rules the columns. */
const HOUR_LINES =
    "bg-[repeating-linear-gradient(180deg,transparent_0_43px,hsl(var(--foreground)/0.1)_43px_44px)]";

const LABELS = hourLabels();

/**
 * The Week as an hour grid (plan 005 E27), for a business with a team,
 * after the "Saroh Business Calendar" design: 06:00 to 22:00 at 44px an
 * hour under a head a day (`DayHead`: its date and how many things are on,
 * money in and out, who is off, its named problem, and Book or "Closed on
 * Sundays", bookings U14) and an All day row for what has no length. Bookings
 * and classes are blocks by start and length, side by side where they
 * overlap, each opening its record. Hours outside working time are shaded;
 * a day closed, or off for the person picked, is striped.
 *
 * The desk's only: a phone gets the strip and the day's list instead
 * (`WeekStrip`). A closed day with nothing on it holds a card saying so.
 * The head keeps `#calendar-week [data-day]`, so the day sheet hands focus
 * back to it as it does for the card columns.
 */
export function WeekHourGrid({
    title,
    days,
    extras,
    onPick,
}: {
    /** "14–20 Sep 2026", for the grid's label. */
    title: string;
    days: HourDay[];
    /** Each day's Book, or why it is closed (bookings U14). */
    extras: Map<string, DayExtra>;
    onPick: (date: string) => void;
}) {
    return (
        <div className="min-w-0 flex-[1_1_100%] overflow-x-auto rounded-xl border border-border bg-card">
            <div
                id="calendar-week"
                role="group"
                aria-label={title}
                className="min-w-[880px]"
            >
                <div className={cn(COLS, "border-b border-border")}>
                    <div />
                    {days.map(({ column: col }) => (
                        <DayHead
                            key={col.date}
                            column={col}
                            extra={extras.get(col.date) ?? NO_EXTRA}
                            onPick={onPick}
                            className="border-l border-foreground/10"
                        />
                    ))}
                </div>

                <div className={cn(COLS, "border-b border-border")}>
                    <div className="px-1.5 pt-1.5 text-right text-[10.5px] text-muted-foreground">
                        All day
                    </div>
                    {days.map(({ column: col, allDay, allDayMore }) => (
                        <div
                            key={col.date}
                            className={cn(
                                "grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-[3px] border-l border-foreground/10 p-1",
                                col.outside && "bg-neutral-50 dark:bg-muted",
                            )}
                        >
                            {allDay.map((chip) => (
                                <Tip key={chip.key} label={chip.full}>
                                    <Link
                                        href={chip.href}
                                        aria-label={chip.full}
                                        className={cn(
                                            "block truncate rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold text-layer-foreground transition-[filter] duration-fast hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:brightness-90",
                                            chip.bad
                                                ? "bg-destructive-subtle-foreground"
                                                : TONE_FILL[chip.tone],
                                            // Quieter in colour, not see-through (4.5:1).
                                            col.past && "saturate-50",
                                        )}
                                    >
                                        {chip.title}
                                    </Link>
                                </Tip>
                            ))}
                            {allDayMore > 0 ? (
                                <Button
                                    variant="link"
                                    size="inline"
                                    type="button"
                                    onClick={() => onPick(col.date)}
                                    aria-haspopup="dialog"
                                    className="cursor-pointer px-0.5 text-left text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-fast hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                                >
                                    {allDayMore} more. Open the day
                                </Button>
                            ) : null}
                        </div>
                    ))}
                </div>

                <div className={COLS}>
                    <div
                        aria-hidden
                        className="relative"
                        style={{ height: GRID_PX }}
                    >
                        {LABELS.map((l) => (
                            <span
                                key={l.text}
                                className="absolute right-1.5 whitespace-nowrap text-[10.5px] tabular-nums text-muted-foreground"
                                style={{ top: l.top }}
                            >
                                {l.text}
                            </span>
                        ))}
                    </div>
                    {days.map(({ column: col, blocks, shade }) => (
                        <div
                            key={col.date}
                            role="group"
                            aria-label={col.label}
                            className={cn(
                                "relative min-w-0 border-l border-foreground/10",
                                col.outside
                                    ? "bg-neutral-50 dark:bg-muted"
                                    : HOUR_LINES,
                            )}
                            style={{ height: GRID_PX }}
                        >
                            {shade.striped ? (
                                <div
                                    aria-hidden
                                    className={cn("absolute inset-0", STRIPED)}
                                />
                            ) : null}
                            {blocks.length === 0 ? (
                                <ClosedCard
                                    extra={extras.get(col.date) ?? NO_EXTRA}
                                    className="absolute inset-x-2 top-[200px] z-[1]"
                                />
                            ) : null}
                            {shade.bands.map((b) => (
                                <div
                                    key={b.top}
                                    aria-hidden
                                    className="absolute inset-x-0 bg-neutral-50 opacity-80 dark:bg-muted"
                                    style={{ top: b.top, height: b.height }}
                                />
                            ))}
                            {blocks.map((b) => (
                                <Tip key={b.key} label={b.full}>
                                    <Link
                                        href={b.href}
                                        aria-label={b.full}
                                        className={cn(
                                            "absolute box-border block overflow-hidden rounded-md border-0 border-l-[3px] px-1.5 py-[3px] text-foreground shadow-[0_0_0_1px_hsl(var(--border))] transition-[filter,box-shadow] duration-fast hover:brightness-[0.97] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:brightness-[0.93] dark:hover:brightness-110",
                                            TONE_BORDER[b.tone],
                                            b.bad
                                                ? "bg-destructive-subtle"
                                                : "bg-card",
                                            col.past && "opacity-[0.85]",
                                            b.struck && "line-through",
                                            b.startsEarlier && "rounded-t-none",
                                            b.endsLater && "rounded-b-none",
                                        )}
                                        style={{
                                            top: b.top,
                                            height: b.height,
                                            left: `calc(${b.left}% + 2px)`,
                                            width: `calc(${b.width}% - 4px)`,
                                        }}
                                    >
                                        <span className="block truncate text-[10.5px] tabular-nums opacity-[0.85]">
                                            {b.startsEarlier ? (
                                                <span aria-hidden>↑ </span>
                                            ) : null}
                                            {b.time}
                                            {b.flag ? ` · ${b.flag.label}` : ""}
                                            {b.endsLater ? (
                                                <span aria-hidden> ↓</span>
                                            ) : null}
                                        </span>
                                        <span className="block truncate text-[11.5px] font-semibold leading-[1.25]">
                                            {b.title}
                                        </span>
                                    </Link>
                                </Tip>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
