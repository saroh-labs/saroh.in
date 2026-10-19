"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Field, FieldError } from "@saroh/ui/field";
import { OptionSelect } from "@saroh/ui/option-select";
import { ChevronDown, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { ClockRow } from "@/components/bookings/availability/clock-select";
import type { HoursRow } from "@/lib/services/service-hours-draft";
import {
    DAY_NAMES,
    minutesToTime,
    timeToMinutes,
} from "@/lib/services/service-hours-draft";
import { windowWords } from "@/lib/services/service-panels";
import { cn } from "@saroh/ui/lib/utils";

/** Monday first, as the week is listed everywhere else. */
const DAYS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    value: String(day),
    label: DAY_NAMES[day] ?? "",
}));

/** The next day without a window, Monday first; Monday when all have one. */
function nextFreeDay(rows: readonly HoursRow[]): number {
    const used = new Set(rows.map((r) => r.dayOfWeek));
    return [1, 2, 3, 4, 5, 6, 0].find((d) => !used.has(d)) ?? 1;
}

/**
 * A service's own weekly hours (U16): a row a window, "Monday · 9:00 am to
 * 7:00 pm", that opens under itself to change its day and its times with
 * the same 12-hour picker as Hours and time off (`ClockRow`, quarter
 * hours), and Remove. Nothing here saves; the rows are the draft's and go
 * with its Save. A row that can't be saved says so under itself once the
 * page asks (`problemOf`), and opens.
 */
export function HoursField({
    rows,
    onChange,
    problemOf,
    disabled = false,
}: {
    rows: HoursRow[];
    onChange: (rows: HoursRow[]) => void;
    /** What is wrong with a row, once it should be said; else null. */
    problemOf: (index: number) => string | null;
    /** Read-only: a role that can't change services sees the windows. */
    disabled?: boolean;
}) {
    const id = useId();
    // The row being changed, and which of its times has its picker open.
    const [open, setOpen] = useState<number | null>(null);
    const [clock, setClock] = useState<"start" | "end" | null>(null);
    const patch = (index: number, next: Partial<HoursRow>) =>
        onChange(
            rows.map((row, i) => (i === index ? { ...row, ...next } : row)),
        );

    return (
        <div className="grid gap-2.5">
            {rows.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No hours of its own"
                    description="Add a window, or leave it to the free time of who does it."
                />
            ) : (
                <ul className="overflow-hidden rounded-[12px] border border-border bg-card">
                    {rows.map((row, index) => {
                        const problem = problemOf(index);
                        const day = DAY_NAMES[row.dayOfWeek] ?? "Day";
                        const shown = open === index || problem !== null;
                        const start = timeToMinutes(row.start) ?? 540;
                        const end = timeToMinutes(row.end) ?? 1020;
                        return (
                            <li
                                key={index}
                                className="border-b border-border last:border-b-0"
                            >
                                <div className="flex min-h-[52px] items-center gap-1 pl-3.5 pr-1.5">
                                    <button
                                        type="button"
                                        aria-expanded={shown}
                                        aria-invalid={
                                            problem ? true : undefined
                                        }
                                        aria-describedby={
                                            problem
                                                ? `${id}-${index}-problem`
                                                : undefined
                                        }
                                        disabled={disabled}
                                        onClick={() => {
                                            setOpen(shown ? null : index);
                                            setClock(null);
                                        }}
                                        className="flex min-h-11 flex-1 items-center gap-3 rounded-md text-left text-[14.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                                    >
                                        <span className="w-24 shrink-0 font-semibold">
                                            {day}
                                        </span>
                                        <span className="flex-1 tabular-nums text-muted-foreground">
                                            {windowWords(row)}
                                        </span>
                                        {disabled ? null : (
                                            <ChevronDown
                                                aria-hidden
                                                className={cn(
                                                    "size-4 text-muted-foreground transition-transform",
                                                    shown && "rotate-180",
                                                )}
                                            />
                                        )}
                                    </button>
                                    {disabled ? null : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Remove ${day}, ${windowWords(row)}`}
                                            onClick={() => {
                                                setOpen(null);
                                                onChange(
                                                    rows.filter(
                                                        (_, i) => i !== index,
                                                    ),
                                                );
                                            }}
                                        >
                                            <X aria-hidden className="size-4" />
                                        </Button>
                                    )}
                                </div>
                                {shown && !disabled ? (
                                    <div className="border-t border-border bg-muted/30 px-3.5 pb-3 pt-2.5">
                                        <Field label="Day">
                                            <OptionSelect
                                                value={String(row.dayOfWeek)}
                                                onValueChange={(v) =>
                                                    patch(index, {
                                                        dayOfWeek: Number(v),
                                                    })
                                                }
                                                options={DAYS}
                                                className="w-40"
                                            />
                                        </Field>
                                        <div className="mt-2.5 overflow-hidden rounded-[10px] border border-border">
                                            <ClockRow
                                                label="Opens"
                                                value={start}
                                                open={clock === "start"}
                                                onToggle={() =>
                                                    setClock(
                                                        clock === "start"
                                                            ? null
                                                            : "start",
                                                    )
                                                }
                                                onPick={(m) =>
                                                    patch(index, {
                                                        start: minutesToTime(m),
                                                    })
                                                }
                                            />
                                            <ClockRow
                                                label="Closes"
                                                upTo
                                                value={end}
                                                open={clock === "end"}
                                                onToggle={() =>
                                                    setClock(
                                                        clock === "end"
                                                            ? null
                                                            : "end",
                                                    )
                                                }
                                                onPick={(m) =>
                                                    patch(index, {
                                                        end: minutesToTime(m),
                                                    })
                                                }
                                            />
                                        </div>
                                    </div>
                                ) : null}
                                <FieldError
                                    id={`${id}-${index}-problem`}
                                    className={
                                        problem ? "px-3.5 pb-2.5" : undefined
                                    }
                                >
                                    {problem}
                                </FieldError>
                            </li>
                        );
                    })}
                </ul>
            )}

            {disabled ? null : (
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            const next = [
                                ...rows,
                                {
                                    dayOfWeek: nextFreeDay(rows),
                                    start: "09:00",
                                    end: "17:00",
                                },
                            ];
                            onChange(next);
                            setOpen(next.length - 1);
                            setClock(null);
                        }}
                    >
                        <Plus aria-hidden className="size-4" />
                        Add a window
                    </Button>
                </div>
            )}
            <p className="text-[12.5px] leading-normal text-muted-foreground">
                Times are 12-hour, in 15-minute steps, the same as Hours and
                time off.
            </p>
        </div>
    );
}
