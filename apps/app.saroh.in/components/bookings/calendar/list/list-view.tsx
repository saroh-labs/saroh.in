"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import { useNewBookingLauncher } from "@/components/bookings/new-booking/launcher";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatClock, formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import type { Block, Column, LocalDate, Span } from "@/lib/services/diary";
import {
    blockTitle,
    isLive,
    localMinuteOf,
    STATE_LABEL,
    weekdayOf,
} from "@/lib/services/diary";
import {
    listLine,
    nextLine,
    nextTitle,
    nextUp,
    placesLeft,
} from "@/lib/services/diary-list";
import { closedKind } from "@/lib/services/diary-view";
import type { StaffView } from "@/lib/staff/types";

import { STATE_TONE } from "../parts";
import { closedWords } from "../week-words";
import { ListDayEmpty } from "./list-day-empty";
import type { FreeRow } from "./list-free-times";
import { ListFreeTimes } from "./list-free-times";

/**
 * Bookings › List (U6, #1022; BKMBookingsAgenda on a phone, BKDCalendarList
 * on the desk): one day as a list. Today it opens on the Next card ("11:30
 * am · Kabir Singh · in 10 min", Open); then the free times, a card that
 * opens on a phone and a right-hand column on the desk; then what is
 * booked, one row each, opening its quick look. A day with nothing booked
 * says whether it is closed (as Week does) or open, with the next step.
 *
 * The month the old agenda drew beside it is in header C's date sheet, with
 * its dots and Closed; the view switch is its Show as.
 */
export function ListView({
    blocks,
    columns,
    staff,
    person,
    date,
    today,
    now,
    timezone,
    selected,
    canBook,
    canHours,
    share,
    onBlock,
    onFree,
    onOpenDay,
}: {
    /** The day's blocks for whoever is shown, cancelled ones when drawn. */
    blocks: readonly Block[];
    /** The day's columns for whoever is shown: hours, free times. */
    columns: readonly Column[];
    /** Null when the hours couldn't be read: no free times, no closed day. */
    staff: StaffView[] | null;
    /** The one person shown, or null for everyone. */
    person: string | null;
    date: LocalDate;
    today: LocalDate;
    now: number;
    timezone: string;
    selected: string | null;
    canBook: boolean;
    canHours: boolean;
    /** "Share your booking page", while it is live; else null. */
    share: ReactNode;
    onBlock: (block: Block) => void;
    onFree: (column: Column, free: Span) => void;
    /** Open hours on this day, as Week does: whoever is picked, else you. */
    onOpenDay: () => void;
}) {
    const launcher = useNewBookingLauncher();
    const staffById = new Map((staff ?? []).map((p) => [p.id, p]));
    const isToday = date === today;
    const past = date < today;
    const dayWords = formatDay(date, { weekday: "short", year: "never" });

    // Free times: each person's, in turn. The services' own hours have
    // nobody to book with a tap, and someone paused by the plan takes no
    // new booking, so neither is offered.
    const free: FreeRow[] | null =
        staff === null
            ? null
            : columns.flatMap((c) => {
                  const p = staffById.get(c.key);
                  if (!p || p.paused) return [];
                  return (c.day?.free ?? []).map((f) => ({
                      key: `${c.key}${f[0]}`,
                      who: c.name,
                      from: f[0],
                      to: f[1],
                      book: canBook ? () => onFree(c, f) : null,
                  }));
              });

    // Closed, in Week's words: "Closed on Sundays" when nobody shown works
    // that weekday at all, else the date (time off, a closure).
    const kind =
        staff === null
            ? null
            : closedKind(columns, (key) =>
                  (staffById.get(key)?.hours ?? []).some(
                      (h) => h.dayOfWeek === weekdayOf(date),
                  ),
              );
    const closed = kind ? closedWords({ date, closed: kind }) : null;
    const firstFree = free
        ?.filter((f) => f.book)
        .sort((a, b) => a.from - b.from)
        .at(0);

    const nowMinute = localMinuteOf(new Date(now), timezone);
    const next = isToday ? nextUp(blocks, nowMinute) : null;
    const live = blocks.filter(isLive).length;

    if (blocks.length === 0) {
        const empty = (
            <ListDayEmpty
                closed={closed}
                dayWords={dayWords}
                today={isToday}
                past={past}
                canBook={canBook}
                onOpenHours={canHours ? onOpenDay : undefined}
                // New booking on this day (U8); without its host, the
                // day's first free time.
                onBookDay={
                    launcher && canBook
                        ? () =>
                              launcher.open({
                                  date,
                                  ...(person ? { staffId: person } : {}),
                              })
                        : (firstFree?.book ?? undefined)
                }
                share={share}
            />
        );
        // A closed day is the empty state alone on the desk; a phone keeps
        // the free times' card above it ("No free times this day").
        return (
            <div
                data-list-view=""
                className={cn(
                    "grid items-start gap-3",
                    !closed &&
                        free?.length &&
                        "min-[760px]:grid-cols-[minmax(0,1fr)_340px] min-[760px]:gap-5",
                )}
            >
                {free ? (
                    <ListFreeTimes
                        rows={free}
                        today={isToday}
                        person={person}
                        canBook={canBook}
                        className={cn(
                            "min-[760px]:col-start-2 min-[760px]:row-start-1",
                            (closed !== null || free.length === 0) &&
                                "min-[760px]:hidden",
                        )}
                    />
                ) : null}
                <div className="min-w-0 min-[760px]:col-start-1 min-[760px]:row-start-1">
                    {empty}
                </div>
            </div>
        );
    }

    return (
        <div
            data-list-view=""
            className={cn(
                "grid items-start gap-3",
                free !== null &&
                    "min-[760px]:grid-cols-[minmax(0,1fr)_340px] min-[760px]:gap-x-5 min-[760px]:gap-y-3.5",
            )}
        >
            {next ? (
                <NextCard
                    block={next}
                    minutesAway={next.start - nowMinute}
                    onOpen={() => onBlock(next)}
                />
            ) : null}
            {free ? (
                <ListFreeTimes
                    rows={free}
                    today={isToday}
                    person={person}
                    canBook={canBook}
                    className={cn(
                        "min-[760px]:sticky min-[760px]:top-4 min-[760px]:col-start-2 min-[760px]:row-start-1",
                        next && "min-[760px]:row-span-2",
                    )}
                />
            ) : null}
            <section
                aria-label="Booked"
                className={cn(
                    "min-w-0 min-[760px]:col-start-1",
                    next
                        ? "min-[760px]:row-start-2"
                        : "min-[760px]:row-start-1",
                )}
            >
                <div className="label mb-1.5 mt-1 min-[760px]:hidden">
                    Booked
                </div>
                <div className="overflow-hidden rounded-[12px] border border-border bg-card">
                    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5 max-[759px]:hidden">
                        <span className="label flex-1">Booked</span>
                        <span className="text-[12.5px] text-muted-foreground">
                            {count(live, "booking")}
                        </span>
                    </div>
                    <ul className="m-0 list-none p-0">
                        {blocks.map((b) => (
                            <li
                                key={b.key}
                                className="border-b border-border/60 last:border-b-0"
                            >
                                <BookedRow
                                    block={b}
                                    next={b.key === next?.key}
                                    selected={selected === b.key}
                                    onOpen={() => onBlock(b)}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            </section>
        </div>
    );
}

/** Today's next booking: when, who, with whom and how soon, and Open. */
function NextCard({
    block,
    minutesAway,
    onOpen,
}: {
    block: Block;
    minutesAway: number;
    onOpen: () => void;
}) {
    const title = nextTitle(block, formatClock(block.start));
    return (
        <section
            aria-label="Next"
            data-list-next=""
            className="flex min-w-0 items-center gap-3 rounded-[12px] border border-foreground bg-card px-3.5 py-3 min-[760px]:col-start-1 min-[760px]:row-start-1 min-[760px]:gap-4 min-[760px]:px-[18px] min-[760px]:py-4 min-[760px]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
        >
            <span className="label shrink-0 text-destructive min-[760px]:text-foreground">
                Next
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold min-[760px]:font-display min-[760px]:text-[19px]">
                    {title}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground min-[760px]:text-[13px]">
                    {nextLine(block, minutesAway)}
                </span>
            </span>
            <Button
                variant="outline"
                className="wk-press shrink-0 max-[759px]:h-11"
                aria-label={`Open ${title}`}
                onClick={onOpen}
            >
                Open
            </Button>
        </section>
    );
}

/** One booked row: the time, a bar in the kind's colour, who and what, and how it stands. */
function BookedRow({
    block: b,
    next,
    selected,
    onOpen,
}: {
    block: Block;
    next: boolean;
    selected: boolean;
    onOpen: () => void;
}) {
    const cancelled = b.state === "cancelled";
    const places = placesLeft(b);
    const label = STATE_LABEL[b.state];
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-current={selected ? "true" : undefined}
            className={cn(
                "flex min-h-[60px] w-full cursor-pointer items-stretch gap-2.5 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[760px]:min-h-[52px] min-[760px]:items-center min-[760px]:gap-3 min-[760px]:px-4",
                next ? "bg-muted" : "bg-card hover:bg-muted/40",
                selected && "shadow-[inset_3px_0_0_hsl(var(--foreground))]",
                cancelled && "text-muted-foreground",
            )}
        >
            {/* Wide enough for "12:30 pm" in bold: at 64px "pm" dropped
                under the time. */}
            <span className="w-[76px] shrink-0 whitespace-nowrap tabular-nums">
                <span className="block text-[14px] font-semibold">
                    {formatClock(b.start)}
                </span>
                <span className="block text-[11.5px] text-muted-foreground min-[760px]:text-[12px]">
                    {formatClock(b.end)}
                </span>
            </span>
            <span
                aria-hidden
                className={cn(
                    "w-1 shrink-0 self-stretch rounded-sm min-[760px]:w-[3px]",
                    cancelled || b.state === "noshow"
                        ? "bg-border-strong"
                        : b.kind === "class"
                          ? "bg-diary-class"
                          : "bg-diary-one",
                )}
            />
            <span className="min-w-0 flex-1 self-center">
                <span
                    className={cn(
                        "block text-[14.5px] font-semibold min-[760px]:text-[14px]",
                        cancelled && "line-through",
                    )}
                >
                    {blockTitle(b)}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                    {listLine(b)}
                </span>
            </span>
            <span className="shrink-0 self-center">
                {places ? (
                    <StatusBadge tone={STATE_TONE.open}>
                        <span className="min-[760px]:hidden">
                            {places.short}
                        </span>
                        <span className="max-[759px]:hidden">
                            {places.long}
                        </span>
                    </StatusBadge>
                ) : next && b.state === "booked" ? (
                    <StatusBadge tone={STATE_TONE.booked}>
                        <span className="min-[760px]:hidden">Next</span>
                        <span className="max-[759px]:hidden">{label}</span>
                    </StatusBadge>
                ) : (
                    <StatusBadge tone={STATE_TONE[b.state]}>
                        {label}
                    </StatusBadge>
                )}
            </span>
        </button>
    );
}
