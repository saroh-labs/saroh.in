"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import { useState } from "react";

import type { KeptBooking } from "@/lib/services/availability-rules";
import {
    dayRanges,
    outsideHours,
    rangeRefusal,
    WEEK,
} from "@/lib/services/availability-rules";
import { clock } from "@/lib/services/diary";
import type { WeeklyRange } from "@/lib/staff/types";

import { ClockSelect } from "./clock-select";

/**
 * One person's week (the design's "Weekly hours"): each day's ranges as
 * chips, "+ Hours" to add one (an end before the start, or an overlap, is
 * refused on the spot), Monday copied to the weekdays, and — under any day —
 * the bookings the new hours would leave outside. They stay booked.
 */
export function WeeklyHours({
    staffId,
    hours,
    kept,
    canEdit,
    onChange,
}: {
    staffId: string;
    hours: WeeklyRange[];
    /** Bookings this week, or null when they could not be read. */
    kept: KeptBooking[] | null;
    canEdit: boolean;
    onChange: (hours: WeeklyRange[]) => void;
}) {
    const [adding, setAdding] = useState<{
        day: number;
        from: number;
        to: number;
    } | null>(null);

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
                        variant="outline"
                        className="h-[30px] rounded-[8px] px-[11px] text-[12px] coarse:h-11"
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
                    const bad = open
                        ? rangeRefusal(ranges, {
                              startMinute: open.from,
                              endMinute: open.to,
                          })
                        : null;
                    const out = kept
                        ? outsideHours(kept, staffId, hours, day)
                        : [];
                    return (
                        <li
                            key={day}
                            className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-[11px] last:border-b-0"
                        >
                            <span className="w-[90px] shrink-0 text-[13px] font-semibold">
                                {name}
                            </span>
                            <div className="flex min-w-0 flex-[1_1_240px] flex-wrap items-center gap-1.5">
                                {!ranges.length && !open ? (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        Not bookable
                                    </span>
                                ) : null}
                                {ranges.map((r) => (
                                    <span
                                        key={`${r.startMinute}`}
                                        className={cn(
                                            "inline-flex h-[30px] items-center gap-1 rounded-full bg-success-subtle text-[12.5px] font-semibold tabular-nums text-success-subtle-foreground",
                                            canEdit
                                                ? "pl-[11px] pr-1"
                                                : "px-[11px]",
                                        )}
                                    >
                                        {clock(r.startMinute)}–
                                        {clock(r.endMinute)}
                                        {canEdit ? (
                                            <button
                                                type="button"
                                                aria-label={`Remove ${clock(r.startMinute)} to ${clock(r.endMinute)} on ${name}`}
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
                                                className="grid size-[22px] place-items-center rounded-full hover:bg-success-subtle-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-8"
                                            >
                                                <X
                                                    aria-hidden
                                                    className="size-3.5"
                                                />
                                            </button>
                                        ) : null}
                                    </span>
                                ))}
                                {open ? (
                                    <span className="inline-flex flex-wrap items-center gap-1.5">
                                        <ClockSelect
                                            label="From"
                                            value={open.from}
                                            onChange={(from) =>
                                                setAdding({ ...open, from })
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
                                                setAdding({ ...open, to })
                                            }
                                        />
                                        <Button
                                            className="h-8 rounded-[8px] px-3 text-[12.5px] coarse:h-11"
                                            disabled={Boolean(bad)}
                                            onClick={() => {
                                                if (bad) return;
                                                onChange([
                                                    ...hours,
                                                    {
                                                        dayOfWeek: day,
                                                        startMinute: open.from,
                                                        endMinute: open.to,
                                                    },
                                                ]);
                                                setAdding(null);
                                            }}
                                        >
                                            Add
                                        </Button>
                                        <button
                                            type="button"
                                            onClick={() => setAdding(null)}
                                            className="px-1 text-[12px] text-muted-foreground hover:text-foreground"
                                        >
                                            Cancel
                                        </button>
                                    </span>
                                ) : canEdit ? (
                                    <button
                                        type="button"
                                        onClick={() => {
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
                                        className="h-[30px] rounded-full border border-dashed border-border-strong px-2.5 text-[12px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
                                    >
                                        + Hours
                                    </button>
                                ) : null}
                            </div>
                            {bad ? (
                                <p
                                    role="alert"
                                    className="basis-full text-[12px] text-destructive-subtle-foreground"
                                >
                                    {bad}
                                </p>
                            ) : null}
                            {out.length ? (
                                <p className="basis-full text-[12px] text-brand-subtle-foreground">
                                    {out.length}{" "}
                                    {out.length === 1
                                        ? "booking this week falls"
                                        : "bookings this week fall"}{" "}
                                    outside these hours —{" "}
                                    {out
                                        .map(
                                            (b) =>
                                                `${b.who.split(" ")[0]} ${clock(b.start)}`,
                                        )
                                        .join(", ")}
                                    . They stay booked; move them if you need
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
