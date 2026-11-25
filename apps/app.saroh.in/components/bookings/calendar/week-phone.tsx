"use client";

import { formatDay } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";

import type { Block, Column, LocalDate, Span } from "@/lib/services/diary";

import { firstName } from "@/lib/names";
import { countBlocks, countedWords } from "@/lib/services/session-counts";
import { BookingRow, FreeRow } from "./week-day-rows";
import type { WeekDay } from "./week-view";
import { closedWords } from "./week-words";

type Row =
    | { kind: "block"; key: string; start: number; block: Block }
    | {
          kind: "free";
          key: string;
          start: number;
          column: Column;
          free: Span;
      };

/**
 * The week on a phone (U5, BKVCalendarBPhone): the header's week strip
 * (the same one Day has) picks the day, kept in the address; under it the
 * picked day's list, its bookings and its free times in time order, so
 * the count and the list agree. A free time books, a booking opens its
 * quick look; a day nobody works offers to open hours on it.
 */
export function WeekPhone({
    days,
    date,
    person,
    canBook,
    canOpenHours,
    offersFree,
    selected,
    onBlock,
    onFree,
    onOpenDay,
}: {
    days: WeekDay[];
    /** The day picked, from the address. */
    date: LocalDate;
    /** Whose bookings, when one person is picked; null on Everyone. */
    person: string | null;
    canBook: boolean;
    canOpenHours: boolean;
    offersFree: (column: Column) => boolean;
    selected: string | null;
    onBlock: (block: Block, date: LocalDate) => void;
    onFree: (column: Column, free: Span, date: LocalDate) => void;
    onOpenDay: (date: LocalDate) => void;
}) {
    // A week always has its seven days; the first stands in for a day
    // outside it.
    const day = days.find((d) => d.date === date) ?? days[0];

    const rows: Row[] = [
        ...day.blocks.map((b): Row => ({
            kind: "block",
            key: b.key,
            start: b.start,
            block: b,
        })),
        ...day.cols.filter(offersFree).flatMap((c) =>
            (c.day?.free ?? []).map((f): Row => ({
                kind: "free",
                key: `f${c.key}${f[0]}`,
                start: f[0],
                column: c,
                free: f,
            })),
        ),
    ].sort(
        (a, b) =>
            a.start - b.start ||
            (a.kind === b.kind ? 0 : a.kind === "free" ? -1 : 1),
    );
    const freeTimes = rows.filter((r) => r.kind === "free").length;
    const hoursKnown = day.cols.some((c) => c.day !== null);
    const on = formatDay(day.date, { weekday: "short", year: "never" });
    const title = `${on}${day.today ? " · today" : ""}${person ? ` · ${firstName(person)}` : ""}`;
    const words = day.closed ? closedWords(day) : null;

    return (
        <div data-week-view="phone" className="pt-1">
            <div className="mb-2 mt-2">
                <h2 className="text-[15px] font-semibold">{title}</h2>
                <div className="text-[12.5px] text-muted-foreground">
                    {words
                        ? "Closed"
                        : hoursKnown
                          ? `${countedWords(countBlocks(day.blocks))} · ${count(freeTimes, "free time")}`
                          : countedWords(countBlocks(day.blocks))}
                </div>
            </div>

            {words && rows.length === 0 ? (
                <div className="rounded-[12px] border border-border bg-card px-5 py-7 text-center">
                    <div className="font-display text-[17px] font-semibold">
                        {words.title}
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-normal text-muted-foreground">
                        {words.line}
                        {canOpenHours
                            ? " Open some hours if you want to see someone that day."
                            : ""}
                    </p>
                    {canOpenHours ? (
                        <Button
                            variant="outline"
                            className="mt-2.5 h-12"
                            onClick={() => onOpenDay(day.date)}
                        >
                            Open hours on this day
                        </Button>
                    ) : null}
                </div>
            ) : rows.length === 0 ? (
                <EmptyState
                    size="inline"
                    title={
                        day.today
                            ? "Nothing booked today."
                            : `Nothing booked on ${on}.`
                    }
                />
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border bg-card [&>li:last-child>*]:border-b-0">
                    {rows.map((r) =>
                        r.kind === "free" ? (
                            <FreeRow
                                key={r.key}
                                column={r.column}
                                free={r.free}
                                onBook={
                                    canBook
                                        ? () =>
                                              onFree(r.column, r.free, day.date)
                                        : null
                                }
                            />
                        ) : (
                            <BookingRow
                                key={r.key}
                                block={r.block}
                                selected={selected === r.key}
                                onOpen={() => onBlock(r.block, day.date)}
                            />
                        ),
                    )}
                </ul>
            )}
        </div>
    );
}
