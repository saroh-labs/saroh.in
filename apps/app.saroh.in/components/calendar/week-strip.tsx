"use client";

import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";

import type { Shortcut } from "@/lib/calendar/range";
import type {
    StripDay,
    WeekDayChip,
    WeekDayRow,
} from "@/lib/calendar/week-days";

import { TONE_FILL } from "./tones";
import { STRIPED } from "./week-columns";
import type { DayExtra } from "./week-day-head";
import { ClosedCard } from "./week-day-head";

/** The strip's day for a date, for focus to come back to. */
export function stripDayButton(date: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(
        `#calendar-strip [data-strip-day="${date}"]`,
    );
}

/**
 * The week on a phone (bookings U14, BKMOverviewWeek): Monday to Sunday as
 * seven days side by side, each with how many things are on — "11 on",
 * "Closed" — the picked one dark, today ringed, a closed day striped. One
 * radio group: a tap or the arrow keys pick a day, and its list shows
 * below. Nothing scrolls sideways; the desk's grid is never drawn here.
 */
export function WeekStrip({
    days,
    picked,
    onPick,
}: {
    days: StripDay[];
    picked: string;
    onPick: (date: string) => void;
}) {
    const open = days.filter((d) => !d.outside);
    const move = (from: string, by: number | "first" | "last") => {
        const i = open.findIndex((d) => d.date === from);
        const next =
            by === "first"
                ? open.at(0)
                : by === "last"
                  ? open.at(-1)
                  : open.at(Math.min(open.length - 1, Math.max(0, i + by)));
        if (!next) return;
        onPick(next.date);
        stripDayButton(next.date)?.focus();
    };
    const keys: Partial<Record<string, number | "first" | "last">> = {
        ArrowLeft: -1,
        ArrowUp: -1,
        ArrowRight: 1,
        ArrowDown: 1,
        Home: "first",
        End: "last",
    };

    return (
        <div
            id="calendar-strip"
            role="radiogroup"
            aria-label="Pick a day"
            className="mt-2 grid grid-cols-7 gap-1"
        >
            {days.map((d) => {
                const on = d.date === picked;
                return (
                    <button
                        key={d.date}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={d.label}
                        data-strip-day={d.date}
                        disabled={d.outside}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onPick(d.date)}
                        onKeyDown={(e) => {
                            const by = keys[e.key];
                            if (by === undefined) return;
                            e.preventDefault();
                            move(d.date, by);
                        }}
                        className={cn(
                            "flex h-[76px] min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-border bg-card p-0 font-sans text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:brightness-95 disabled:cursor-default disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground",
                            d.closed && !on && STRIPED,
                            d.isToday && "border-[1.5px] border-foreground",
                            on &&
                                "border-primary bg-primary text-primary-foreground",
                        )}
                    >
                        <span
                            className={cn(
                                "text-[11px]",
                                on
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground",
                            )}
                        >
                            {d.w}
                        </span>
                        <span className="font-display text-[17px] font-semibold leading-[1.1]">
                            {d.d}
                        </span>
                        <span
                            className={cn(
                                "text-[10.5px] font-semibold tabular-nums",
                                on
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground",
                            )}
                        >
                            {d.outside ? "" : d.n}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/**
 * The picked day on a phone (BKMOverviewWeek), the day sheet's job done on
 * the page itself: its title and how many things, Book, what came in and
 * went out (`payment:read` only), who is off, what has no time as chips,
 * then everything in time order — each row its time, who it is for and
 * what, a flag, and the fix for a named problem — opening its record. A
 * closed day says so, with "Open hours on this day" for whoever may.
 */
export function WeekDay({
    date,
    today,
    count: n,
    shortcuts,
    money,
    offLine,
    chips,
    rows,
    more,
    extra,
    hidden,
}: {
    date: string;
    today: string;
    /** Things on it among the layers switched on. */
    count: number;
    /** "Book on this day", "New order": what this person may make on it. */
    shortcuts: Shortcut[];
    /** In and out that day, for `payment:read` only; null otherwise. */
    money: { in: string; out: string } | null;
    /** Who is off, or the business closed (E24). */
    offLine: string | null;
    chips: WeekDayChip[];
    rows: WeekDayRow[];
    /** Things the day holds past the ones read. */
    more: number;
    extra: DayExtra;
    /** Something is on it, only under a layer switched off. */
    hidden: boolean;
}) {
    const ahead = date > today;
    const title =
        formatDay(date, { today, weekday: "short" }) +
        (date === today ? " · today" : "");
    const sub =
        n > 0
            ? `${count(n, "thing")}${ahead ? " coming up" : ""}`
            : extra.closed
              ? "Closed"
              : "";

    return (
        <section aria-labelledby="calendar-week-day" className="mt-3">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <h2
                        id="calendar-week-day"
                        className="text-[15px] font-semibold"
                    >
                        {title}
                    </h2>
                    {sub ? (
                        <p className="text-[12.5px] text-muted-foreground">
                            {sub}
                        </p>
                    ) : null}
                </div>
                {shortcuts.map((s) => (
                    <Button
                        key={s.label}
                        asChild
                        variant="outline"
                        className="h-11 gap-1.5 rounded-[10px] px-3.5"
                    >
                        <Link href={s.href} aria-label={s.label}>
                            <Plus aria-hidden className="size-4" />
                            {s.label === "Book on this day" ? "Book" : s.label}
                        </Link>
                    </Button>
                ))}
            </div>

            {offLine ? (
                <p className="mt-1 text-[12.5px] text-neutral-600 dark:text-muted-foreground">
                    {offLine}
                </p>
            ) : null}

            {money ? (
                <div className="mt-2.5 flex gap-2">
                    <Badge variant="success" className="h-7 tabular-nums">
                        In +{money.in}
                    </Badge>
                    <Badge variant="error" className="h-7 tabular-nums">
                        Out −{money.out}
                    </Badge>
                </div>
            ) : null}

            {chips.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                        <Link
                            key={c.key}
                            href={c.href}
                            className={cn(
                                "inline-flex h-9 max-w-full items-center truncate rounded-full border bg-card px-3.5 text-[13px] font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted",
                                c.bad
                                    ? "border-destructive-subtle-foreground text-destructive-subtle-foreground"
                                    : "border-border-strong text-foreground",
                            )}
                        >
                            <span className="truncate">{c.title}</span>
                        </Link>
                    ))}
                </div>
            ) : null}

            {rows.length > 0 ? (
                <ul className="mt-2.5 overflow-hidden rounded-xl border border-border bg-card">
                    {rows.map((r) => (
                        <li
                            key={r.key}
                            className="border-b border-border/70 last:border-b-0"
                        >
                            <Link
                                href={r.href}
                                className="flex min-h-14 items-center gap-2.5 px-3 py-1.5 text-foreground transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted"
                            >
                                <span className="w-16 flex-none text-[13.5px] font-semibold tabular-nums">
                                    {r.time}
                                </span>
                                <span
                                    aria-hidden
                                    className={cn(
                                        "w-1 self-stretch rounded-sm",
                                        TONE_FILL[r.tone],
                                    )}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold">
                                        {r.title}
                                    </span>
                                    {r.sub ? (
                                        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                                            {r.sub}
                                        </span>
                                    ) : null}
                                </span>
                                {r.flag ? (
                                    <Badge
                                        variant={
                                            r.flag.tone === "bad"
                                                ? "error"
                                                : "neutral"
                                        }
                                        size="sm"
                                        className="shrink-0"
                                    >
                                        {r.flag.label}
                                    </Badge>
                                ) : null}
                                {r.action ? (
                                    <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold underline decoration-border-strong underline-offset-4">
                                        {r.action}
                                    </span>
                                ) : null}
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}

            {more > 0 ? (
                <Link
                    href={`/bookings?date=${encodeURIComponent(date)}&layout=day`}
                    className="inline-flex min-h-11 items-center text-[13px] font-semibold text-foreground underline decoration-border-strong underline-offset-4 active:text-muted-foreground"
                >
                    {more} more · open the day in Bookings
                </Link>
            ) : null}

            {n === 0 && extra.closed ? (
                <ClosedCard extra={extra} className="mt-3 px-6 py-6" />
            ) : n === 0 ? (
                <EmptyState
                    size="inline"
                    className="py-2.5"
                    title={
                        hidden
                            ? "Nothing on this day for what you're showing"
                            : date >= today
                              ? "Nothing on this day yet"
                              : "Nothing happened on this day"
                    }
                />
            ) : null}
        </section>
    );
}
