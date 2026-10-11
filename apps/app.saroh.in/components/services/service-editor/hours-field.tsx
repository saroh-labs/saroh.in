"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Field, FieldError } from "@saroh/ui/field";
import { OptionSelect } from "@saroh/ui/option-select";
import { TimeSelect } from "@saroh/ui/time-select";
import { useId } from "react";

import type { HoursRow } from "@/lib/services/service-hours-draft";
import { DAY_NAMES } from "@/lib/services/service-hours-draft";

/** Monday first, as the week is listed everywhere else. */
const DAYS = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
    value: String(day),
    label: DAY_NAMES[day] ?? "",
}));

/**
 * A service's own weekly hours, as rows of the page's draft: a day, a
 * start and an end in the service's zone. Nothing here saves; the rows go
 * with the page's one Save. A row that can't be saved says so under
 * itself once the page asks (`problemOf`).
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
    const patch = (index: number, next: Partial<HoursRow>) =>
        onChange(
            rows.map((row, i) => (i === index ? { ...row, ...next } : row)),
        );

    return (
        <div className="grid gap-3">
            {rows.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="No hours of its own"
                    description="Add a window, or leave it to the free time of who takes it."
                />
            ) : null}

            {rows.map((row, index) => {
                const problem = problemOf(index);
                const day = DAY_NAMES[row.dayOfWeek] ?? "Day";
                return (
                    // Each window is a panel (12px), not a control; `wk-item`
                    // staggers them so adding a row reads as one arriving.
                    <div
                        key={index}
                        style={{ "--wk-i": index } as React.CSSProperties}
                        className="wk-item grid gap-2 rounded-xl border p-3"
                    >
                        <div className="flex flex-wrap items-end gap-3">
                            <Field label="Day">
                                <OptionSelect
                                    value={String(row.dayOfWeek)}
                                    disabled={disabled}
                                    onValueChange={(v) =>
                                        patch(index, { dayOfWeek: Number(v) })
                                    }
                                    options={DAYS}
                                    className="w-36"
                                />
                            </Field>
                            <Field label="Start">
                                <TimeSelect
                                    stepMinutes={15}
                                    value={row.start}
                                    disabled={disabled}
                                    aria-invalid={problem ? true : undefined}
                                    aria-describedby={
                                        problem
                                            ? `${id}-${index}-problem`
                                            : undefined
                                    }
                                    onValueChange={(start) =>
                                        patch(index, { start })
                                    }
                                />
                            </Field>
                            <Field label="End">
                                <TimeSelect
                                    stepMinutes={15}
                                    value={row.end}
                                    disabled={disabled}
                                    aria-invalid={problem ? true : undefined}
                                    aria-describedby={
                                        problem
                                            ? `${id}-${index}-problem`
                                            : undefined
                                    }
                                    onValueChange={(end) =>
                                        patch(index, { end })
                                    }
                                />
                            </Field>
                            {disabled ? null : (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Remove ${day}, ${row.start} to ${row.end}`}
                                    onClick={() =>
                                        onChange(
                                            rows.filter((_, i) => i !== index),
                                        )
                                    }
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                        <FieldError id={`${id}-${index}-problem`}>
                            {problem}
                        </FieldError>
                    </div>
                );
            })}

            {disabled ? null : (
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            onChange([
                                ...rows,
                                { dayOfWeek: 1, start: "09:00", end: "17:00" },
                            ])
                        }
                    >
                        Add a window
                    </Button>
                </div>
            )}
        </div>
    );
}
