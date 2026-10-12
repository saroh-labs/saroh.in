"use client";

import { CheckRow } from "@/components/shared/check-row";
import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { submitOnModEnter } from "@/lib/hooks/keyboard-save";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Switch } from "@saroh/ui/switch";
import { Copy, X } from "lucide-react";
import { useState } from "react";

import type { KeptBooking } from "@/lib/services/availability-rules";
import {
    copyDay,
    dayRanges,
    outsideHours,
    rangeRefusal,
    WEEK,
} from "@/lib/services/availability-rules";
import { openingNote, whollyOutside } from "@/lib/services/in-person-hours";
import { startingDay } from "@/lib/staff/starting-week";
import type { WeeklyRange } from "@/lib/staff/types";

import { ClockSelect } from "./clock-select";

/** The same range, whichever object holds it. */
const sameRange = (
    a: Pick<WeeklyRange, "startMinute" | "endMinute">,
    b: Pick<WeeklyRange, "startMinute" | "endMinute">,
) => a.startMinute === b.startMinute && a.endMinute === b.endMinute;

/**
 * One person's week (the design's "Weekly hours"), one row a day: a switch
 * that takes the day off or puts it back, the day's name, and each range
 * as a chip that opens its From and To in a small popover over the row.
 * "+ Hours" adds a second range in the same popover, so no other day moves
 * (an end before the start, or an overlap, is refused there and keeps it
 * open). A day with hours copies to the other days ticked in its own
 * popover, and Monday still copies to the weekdays in one press. A day off
 * says so in words, and under any day are the bookings the new hours would
 * leave outside. They stay booked. With opening hours set, hours outside them are drawn as not
 * bookable in person, and the day says why (DEC-087).
 */
export function WeeklyHours({
    staffId,
    hours,
    opening = null,
    kept,
    canEdit,
    onChange,
}: {
    staffId: string;
    hours: WeeklyRange[];
    /** When the business is open, or null: nothing is cut. */
    opening?: WeeklyRange[] | null;
    /** Bookings this week, or null when they could not be read. */
    kept: KeptBooking[] | null;
    canEdit: boolean;
    onChange: (hours: WeeklyRange[]) => void;
}) {
    const [adding, setAdding] = useState<{
        day: number;
        from: number;
        to: number;
        /** The range being changed; absent for one being added. */
        was?: Pick<WeeklyRange, "startMinute" | "endMinute">;
    } | null>(null);
    // The day being copied, and the days ticked to take its hours.
    const [copying, setCopying] = useState<{
        day: number;
        to: number[];
    } | null>(null);
    // A day switched off keeps its hours here, so switching it back on
    // puts them back rather than starting the day again.
    const [parked, setParked] = useState<
        Partial<Record<number, WeeklyRange[]>>
    >({});

    return (
        <section
            aria-labelledby="weekly-hours"
            className="min-w-0 flex-[3_1_460px] overflow-hidden rounded-[12px] border border-border bg-card"
        >
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
                <h2
                    id="weekly-hours"
                    className="flex-1 font-display text-[15px] font-semibold tracking-[-0.02em]"
                >
                    Weekly hours
                </h2>
                {canEdit ? (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            const monday = dayRanges(hours, 1);
                            onChange([
                                ...hours.filter(
                                    (h) => h.dayOfWeek < 2 || h.dayOfWeek > 5,
                                ),
                                ...[2, 3, 4, 5].flatMap((day) =>
                                    monday.map((r) => ({
                                        ...r,
                                        dayOfWeek: day,
                                    })),
                                ),
                            ]);
                        }}
                    >
                        Copy Monday to weekdays
                    </Button>
                ) : null}
            </div>
            <ul>
                {WEEK.map(({ day, name }) => {
                    const ranges = dayRanges(hours, day);
                    const open = adding?.day === day ? adding : null;
                    const was = open?.was;
                    const bad = open
                        ? rangeRefusal(
                              // A range being changed doesn't clash with
                              // itself.
                              was
                                  ? ranges.filter((r) => !sameRange(r, was))
                                  : ranges,
                              {
                                  startMinute: open.from,
                                  endMinute: open.to,
                              },
                          )
                        : null;
                    const out = kept
                        ? outsideHours(kept, staffId, hours, day)
                        : [];
                    const closedNote = openingNote(ranges, opening, day);
                    return (
                        <li
                            key={day}
                            className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-[11px] last:border-b-0"
                        >
                            {canEdit ? (
                                <Switch
                                    size="sm"
                                    checked={ranges.length > 0}
                                    aria-label={`Bookable on ${name}`}
                                    onCheckedChange={(on) => {
                                        const rest = hours.filter(
                                            (h) => h.dayOfWeek !== day,
                                        );
                                        if (on) {
                                            onChange([
                                                ...rest,
                                                ...(parked[day] ??
                                                    startingDay(opening, day)),
                                            ]);
                                            return;
                                        }
                                        setParked((p) => ({
                                            ...p,
                                            [day]: ranges,
                                        }));
                                        setAdding(null);
                                        setCopying(null);
                                        onChange(rest);
                                    }}
                                />
                            ) : null}
                            <span className="w-[90px] shrink-0 text-[13px] font-semibold">
                                {name}
                            </span>
                            <div className="flex min-w-0 flex-[1_1_240px] flex-wrap items-center gap-1.5">
                                {!ranges.length ? (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        Not bookable
                                    </span>
                                ) : null}
                                {ranges.map((r) => (
                                    <span
                                        key={`${r.startMinute}`}
                                        className={cn(
                                            // Under a finger the chip and both its buttons are 44px.
                                            "inline-flex h-[30px] items-center gap-1 rounded-full text-[12.5px] font-semibold tabular-nums coarse:h-11",
                                            // Wholly outside opening hours:
                                            // not bookable in person.
                                            whollyOutside(r, opening, day)
                                                ? "border border-dashed border-border-strong bg-muted text-muted-foreground"
                                                : "bg-success-subtle text-success-subtle-foreground",
                                            canEdit ? "pl-1 pr-1" : "px-[11px]",
                                        )}
                                    >
                                        {canEdit ? (
                                            <button
                                                type="button"
                                                aria-haspopup="dialog"
                                                aria-label={`Change ${formatClockRange(r.startMinute, r.endMinute)} on ${name}`}
                                                onClick={() =>
                                                    setAdding({
                                                        day,
                                                        from: r.startMinute,
                                                        to: r.endMinute,
                                                        was: r,
                                                    })
                                                }
                                                className="h-[22px] rounded-full px-[7px] tabular-nums hover:bg-success-subtle-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11 coarse:px-2.5"
                                            >
                                                {formatClockRange(
                                                    r.startMinute,
                                                    r.endMinute,
                                                )}
                                            </button>
                                        ) : (
                                            formatClockRange(
                                                r.startMinute,
                                                r.endMinute,
                                            )
                                        )}
                                        {canEdit ? (
                                            <button
                                                type="button"
                                                aria-label={`Remove ${formatClockRange(r.startMinute, r.endMinute)} on ${name}`}
                                                onClick={() =>
                                                    onChange(
                                                        hours.filter(
                                                            (h) =>
                                                                !(
                                                                    h.dayOfWeek ===
                                                                        day &&
                                                                    h.startMinute ===
                                                                        r.startMinute &&
                                                                    h.endMinute ===
                                                                        r.endMinute
                                                                ),
                                                        ),
                                                    )
                                                }
                                                className="grid size-[22px] place-items-center rounded-full hover:bg-success-subtle-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11"
                                            >
                                                <X
                                                    aria-hidden
                                                    className="size-3.5"
                                                />
                                            </button>
                                        ) : null}
                                    </span>
                                ))}
                                {canEdit ? (
                                    <Popover
                                        open={Boolean(open)}
                                        onOpenChange={(o) => {
                                            if (!o) return setAdding(null);
                                            setCopying(null);
                                            const last = ranges.at(-1);
                                            const from = last
                                                ? Math.min(
                                                      last.endMinute + 60,
                                                      22 * 60,
                                                  )
                                                : 9 * 60;
                                            setAdding({
                                                day,
                                                from,
                                                to: Math.min(from + 180, 1440),
                                            });
                                        }}
                                    >
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className="h-[30px] rounded-full border border-dashed border-border-strong px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:h-11"
                                            >
                                                + Hours
                                            </button>
                                        </PopoverTrigger>
                                        {open ? (
                                            <PopoverContent
                                                align="start"
                                                collisionPadding={12}
                                                aria-label={`${was ? "Change" : "Add"} hours on ${name}`}
                                                className="w-auto max-w-[calc(100vw-1.5rem)] rounded-[12px] p-3"
                                            >
                                                <form
                                                    onKeyDown={submitOnModEnter}
                                                    className="grid gap-2.5"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        if (bad) return;
                                                        onChange([
                                                            ...(was
                                                                ? hours.filter(
                                                                      (h) =>
                                                                          !(
                                                                              h.dayOfWeek ===
                                                                                  day &&
                                                                              sameRange(
                                                                                  h,
                                                                                  was,
                                                                              )
                                                                          ),
                                                                  )
                                                                : hours),
                                                            {
                                                                dayOfWeek: day,
                                                                startMinute:
                                                                    open.from,
                                                                endMinute:
                                                                    open.to,
                                                            },
                                                        ]);
                                                        setAdding(null);
                                                    }}
                                                >
                                                    <p className="text-[12.5px] font-semibold">
                                                        {was ? "Change" : "Add"}{" "}
                                                        hours on {name}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <ClockSelect
                                                            label="From"
                                                            value={open.from}
                                                            onChange={(from) =>
                                                                setAdding({
                                                                    ...open,
                                                                    from,
                                                                })
                                                            }
                                                        />
                                                        <span className="text-[12px] text-muted-foreground">
                                                            to
                                                        </span>
                                                        <ClockSelect
                                                            label="To"
                                                            upTo
                                                            value={open.to}
                                                            onChange={(to) =>
                                                                setAdding({
                                                                    ...open,
                                                                    to,
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                    {bad ? (
                                                        <p
                                                            role="alert"
                                                            className="max-w-[16rem] text-pretty text-[12px] text-destructive-subtle-foreground"
                                                        >
                                                            {bad}
                                                        </p>
                                                    ) : null}
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            type="submit"
                                                            disabled={Boolean(
                                                                bad,
                                                            )}
                                                        >
                                                            {was
                                                                ? "Change hours"
                                                                : "Add hours"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                setAdding(null)
                                                            }
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </form>
                                            </PopoverContent>
                                        ) : null}
                                    </Popover>
                                ) : null}
                                {canEdit && ranges.length ? (
                                    <Popover
                                        open={copying?.day === day}
                                        onOpenChange={(o) => {
                                            if (!o) return setCopying(null);
                                            setAdding(null);
                                            setCopying({ day, to: [] });
                                        }}
                                    >
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={`Copy ${name} to other days`}
                                                className="grid size-[30px] place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active coarse:size-11"
                                            >
                                                <Copy
                                                    aria-hidden
                                                    className="size-3.5"
                                                />
                                            </button>
                                        </PopoverTrigger>
                                        {copying?.day === day ? (
                                            <PopoverContent
                                                align="end"
                                                collisionPadding={12}
                                                aria-label={`Copy ${name} to other days`}
                                                className="w-auto min-w-[13rem] max-w-[calc(100vw-1.5rem)] rounded-[12px] p-3"
                                            >
                                                <form
                                                    onKeyDown={submitOnModEnter}
                                                    className="grid gap-2"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        if (!copying.to.length)
                                                            return;
                                                        onChange(
                                                            copyDay(
                                                                hours,
                                                                day,
                                                                copying.to,
                                                            ),
                                                        );
                                                        setCopying(null);
                                                    }}
                                                >
                                                    <p className="text-[12.5px] font-semibold">
                                                        Copy {name}&apos;s hours
                                                        to
                                                    </p>
                                                    <div className="grid gap-1.5 coarse:gap-0">
                                                        {WEEK.filter(
                                                            (w) =>
                                                                w.day !== day,
                                                        ).map((w) => (
                                                            <CheckRow
                                                                key={w.day}
                                                                checked={copying.to.includes(
                                                                    w.day,
                                                                )}
                                                                onChange={(
                                                                    on,
                                                                ) =>
                                                                    setCopying({
                                                                        day,
                                                                        to: on
                                                                            ? [
                                                                                  ...copying.to,
                                                                                  w.day,
                                                                              ]
                                                                            : copying.to.filter(
                                                                                  (
                                                                                      x,
                                                                                  ) =>
                                                                                      x !==
                                                                                      w.day,
                                                                              ),
                                                                    })
                                                                }
                                                            >
                                                                {w.name}
                                                            </CheckRow>
                                                        ))}
                                                    </div>
                                                    <p className="max-w-[15rem] text-pretty text-[12px] text-muted-foreground">
                                                        This replaces the hours
                                                        those days have.
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            type="submit"
                                                            disabled={
                                                                !copying.to
                                                                    .length
                                                            }
                                                        >
                                                            Copy hours
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            type="button"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                setCopying(null)
                                                            }
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </form>
                                            </PopoverContent>
                                        ) : null}
                                    </Popover>
                                ) : null}
                            </div>
                            {closedNote ? (
                                <p className="basis-full text-[12px] text-muted-foreground">
                                    {closedNote}
                                </p>
                            ) : null}
                            {out.length ? (
                                <p className="basis-full text-[12px] text-foreground">
                                    {out.length}{" "}
                                    {out.length === 1
                                        ? "booking this week falls"
                                        : "bookings this week fall"}{" "}
                                    outside these hours:{" "}
                                    {out
                                        .map(
                                            (b) =>
                                                `${b.who.split(" ")[0]} ${formatClock(b.start)}`,
                                        )
                                        .join(", ")}
                                    . They stay booked. Move them if you need
                                    to.
                                </p>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
