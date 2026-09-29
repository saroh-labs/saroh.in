"use client";

import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { WeekColumn } from "@/lib/calendar/week-columns";

import { TONE_FILL } from "./tones";

/** Closed, or the person picked is off: the month's stripes (E24). */
export const STRIPED =
    "bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--neutral-50))_6px_12px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_6px,hsl(var(--muted))_6px_12px)]";

/** The day header for a date, for handing focus back when its sheet closes. */
export function weekDayButton(date: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
        `#calendar-week [data-day="${date}"]`,
    );
}

/**
 * The Week as card columns (plan 005 E25), after the design: Monday to
 * Sunday side by side, each headed by its weekday and date, what came in
 * and went out, and who is off; under it the day's named problem and a
 * card per dated thing in time order — the time (or its layer), what it is,
 * a flag, and for a money role its amount — each opening its record. The
 * header opens the day's panel as a sheet. Past days are dimmed, today
 * carries a Saffron edge on top, and the picked day is tinted.
 *
 * Wider than a phone, so the columns scroll sideways inside their frame
 * rather than squeeze; the page itself never scrolls sideways.
 */
export function WeekColumns({
    title,
    columns,
    onPick,
}: {
    /** "14–20 Sep 2026", for the week's label. */
    title: string;
    columns: WeekColumn[];
    onPick: (date: string) => void;
}) {
    return (
        <div className="min-w-0 flex-[1_1_100%] overflow-x-auto rounded-xl border border-border bg-card">
            <div
                id="calendar-week"
                role="group"
                aria-label={title}
                className="grid min-w-[840px] grid-cols-[repeat(7,minmax(120px,1fr))]"
            >
                {columns.map((col, i) => (
                    <div
                        key={col.date}
                        role="group"
                        aria-label={col.label}
                        className={cn(
                            "min-h-[360px] min-w-0 overflow-hidden",
                            i < 6 && "border-r border-foreground/10",
                            col.outside
                                ? "bg-neutral-50 dark:bg-muted"
                                : col.selected
                                  ? "bg-brand-subtle"
                                  : col.off?.striped
                                    ? STRIPED
                                    : "bg-card",
                            col.isToday &&
                                "shadow-[inset_0_2px_0_hsl(var(--highlight))]",
                        )}
                    >
                        <button
                            type="button"
                            data-day={col.date}
                            onClick={() => onPick(col.date)}
                            disabled={col.outside}
                            aria-label={col.label}
                            aria-haspopup="dialog"
                            aria-current={col.isToday ? "date" : undefined}
                            className={cn(
                                "grid w-full gap-0.5 border-b border-foreground/10 bg-transparent px-2.5 pb-2 pt-[9px] text-left font-sans text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                col.outside
                                    ? "cursor-default"
                                    : "cursor-pointer hover:bg-muted/60 active:bg-muted",
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
                        </button>
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-1 p-1.5">
                            {col.problem ? (
                                <span className="truncate rounded-[4px] bg-destructive-subtle px-1.5 py-0.5 text-[11px] font-bold text-destructive-subtle-foreground">
                                    {col.problem}
                                </span>
                            ) : null}
                            {col.cards.map((card) => (
                                <Link
                                    key={card.key}
                                    href={card.href}
                                    title={card.full}
                                    className={cn(
                                        "grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5 overflow-hidden rounded-[7px] border border-foreground/10 bg-card px-[7px] py-1.5 text-foreground transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted/70",
                                        col.past && "opacity-[0.85]",
                                    )}
                                >
                                    <span className="flex min-w-0 items-baseline gap-[5px] text-[11px] tabular-nums text-muted-foreground">
                                        <span
                                            aria-hidden
                                            className={cn(
                                                "inline-block size-[7px] flex-none rounded-[2px]",
                                                TONE_FILL[card.tone],
                                            )}
                                        />
                                        <span className="min-w-0 truncate">
                                            {card.at}
                                        </span>
                                        <span className="flex-1" />
                                        {card.flag ? (
                                            <span
                                                className={cn(
                                                    "min-w-0 truncate font-bold",
                                                    card.flag.tone === "bad"
                                                        ? "text-destructive-subtle-foreground"
                                                        : "text-brand",
                                                )}
                                            >
                                                {card.flag.label}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="line-clamp-2 text-[12px] font-semibold leading-[1.3]">
                                        {card.title}
                                    </span>
                                    {card.amount ? (
                                        <span className="text-[11px] tabular-nums text-muted-foreground">
                                            {card.amount}
                                        </span>
                                    ) : null}
                                </Link>
                            ))}
                            {col.more > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => onPick(col.date)}
                                    aria-haspopup="dialog"
                                    className="cursor-pointer rounded-[7px] px-0.5 py-1 text-left text-[11.5px] font-semibold text-brand transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
                                >
                                    {col.more} more — open the day
                                </button>
                            ) : null}
                            {col.empty ? (
                                <span className="px-0.5 py-1 text-[11.5px] text-muted-foreground">
                                    {col.empty}
                                </span>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
