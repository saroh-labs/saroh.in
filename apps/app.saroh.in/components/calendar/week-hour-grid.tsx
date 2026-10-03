"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { GRID_PX, hourLabels } from "@/lib/calendar/hour-layout";
import type { HourDay } from "@/lib/calendar/week-hours";

import { TONE_BORDER, TONE_FILL } from "./tones";
import { STRIPED } from "./week-columns";

/** The gutter the hour labels sit in, then Monday to Sunday. */
const COLS = "grid grid-cols-[52px_repeat(7,minmax(0,1fr))]";

/** A line every hour, as the design rules the columns. */
const HOUR_LINES =
    "bg-[repeating-linear-gradient(180deg,transparent_0_43px,hsl(var(--foreground)/0.1)_43px_44px)]";

const LABELS = hourLabels();

/**
 * The Week as an hour grid (plan 005 E27), for a business with a team,
 * after the "Saroh Business Calendar" design: 06:00 to 22:00 at 44px an
 * hour under a header a day — its date, money in and out, who is off and
 * its named problem — and an All day row for what has no length. Bookings
 * and classes are blocks by start and length, side by side where they
 * overlap, each opening its record. Hours outside working time are shaded;
 * a day closed, or off for the person picked, is striped.
 *
 * Wider than a phone, so the grid scrolls sideways inside its frame; the
 * page never does. The header keeps `#calendar-week [data-day]`, so the day
 * sheet hands focus back to it as it does for the card columns.
 */
export function WeekHourGrid({
    title,
    days,
    onPick,
}: {
    /** "14–20 Sep 2026", for the grid's label. */
    title: string;
    days: HourDay[];
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
                        <button
                            key={col.date}
                            type="button"
                            data-day={col.date}
                            onClick={() => onPick(col.date)}
                            disabled={col.outside}
                            aria-label={col.label}
                            aria-haspopup="dialog"
                            aria-current={col.isToday ? "date" : undefined}
                            className={cn(
                                "grid min-w-0 gap-0.5 border-l border-foreground/10 px-2 pb-[7px] pt-2 text-left font-sans text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                col.outside
                                    ? "cursor-default bg-neutral-50 dark:bg-muted"
                                    : col.selected
                                      ? "cursor-pointer bg-brand-subtle hover:brightness-[0.98] active:brightness-95"
                                      : "cursor-pointer bg-transparent hover:bg-muted/60 active:bg-muted",
                                col.isToday &&
                                    "shadow-[inset_0_2px_0_hsl(var(--highlight))]",
                            )}
                        >
                            <span className="flex items-baseline gap-1.5">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                    {col.dow}
                                </span>
                                <span
                                    className={cn(
                                        "font-display text-[17px] font-semibold",
                                        col.outside
                                            ? "text-neutral-400 dark:text-muted-foreground"
                                            : col.isToday
                                              ? "text-brand"
                                              : col.past
                                                ? "text-muted-foreground"
                                                : "text-foreground",
                                    )}
                                >
                                    {col.n}
                                </span>
                            </span>
                            {/* In, then out; the header's label says both. */}
                            <span
                                aria-hidden
                                className="flex min-h-[14px] gap-1.5 text-[11px] font-semibold tabular-nums"
                            >
                                <span className="text-neutral-600 dark:text-muted-foreground">
                                    {col.moneyIn}
                                </span>
                                <span className="font-medium text-destructive-subtle-foreground">
                                    {col.moneyOut}
                                </span>
                            </span>
                            {col.off ? (
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
                                <Link
                                    key={chip.key}
                                    href={chip.href}
                                    title={chip.full}
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
                            ))}
                            {allDayMore > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onPick(col.date)}
                                    aria-haspopup="dialog"
                                    className="cursor-pointer rounded-[4px] px-0.5 text-left text-[11px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                                >
                                    {allDayMore} more — open the day
                                </button>
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
                                className="absolute right-1.5 text-[10.5px] tabular-nums text-muted-foreground"
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
                            {shade.bands.map((b) => (
                                <div
                                    key={b.top}
                                    aria-hidden
                                    className="absolute inset-x-0 bg-neutral-50 opacity-80 dark:bg-muted"
                                    style={{ top: b.top, height: b.height }}
                                />
                            ))}
                            {blocks.map((b) => (
                                <Link
                                    key={b.key}
                                    href={b.href}
                                    title={b.full}
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
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
