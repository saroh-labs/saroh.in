"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { TimeSelect } from "@saroh/ui/time-select";
import { useId } from "react";

import { currencySymbol } from "@/lib/format/money";
import type { DayDraft, TurnOnDraft } from "@/lib/modules/turn-on";
import { hoursErrorsByWeekday, WEEK } from "@/lib/modules/turn-on";
import type { FieldErrors } from "@/lib/modules/turn-on-errors";

import { Field, INPUT } from "./field";
import type { Update } from "./setup-fields";

/**
 * Bookings' minimum (DEC-068): the opening hours, Mon–Sat 10 to 7 to
 * start, and the first service with its length and price. A compact week:
 * a box for each day that is open, and its open and close times beside it.
 */
export function BookingsFields({
    draft,
    update,
    errors,
}: {
    draft: TurnOnDraft;
    update: Update;
    errors: FieldErrors;
}) {
    const id = useId();
    const b = draft.APPOINTMENTS;
    const byDay = hoursErrorsByWeekday(errors, draft);
    const setDay = (weekday: number, change: Partial<DayDraft>) =>
        update((d) => ({
            ...d,
            APPOINTMENTS: {
                ...d.APPOINTMENTS,
                days: d.APPOINTMENTS.days.map((day) =>
                    day.weekday === weekday ? { ...day, ...change } : day,
                ),
            },
        }));
    const setService = (change: Partial<TurnOnDraft["APPOINTMENTS"]>) =>
        update((d) => ({
            ...d,
            APPOINTMENTS: { ...d.APPOINTMENTS, ...change },
        }));

    return (
        <>
            <fieldset className="grid min-w-0 gap-1.5">
                <legend className="mb-1.5 text-[12.5px] font-medium">
                    Opening hours
                </legend>
                <div className="grid min-w-0 divide-y divide-border/70 rounded-[9px] border border-border">
                    {WEEK.map(({ weekday, short, long }) => {
                        const day = b.days.find((d) => d.weekday === weekday);
                        if (!day) return null;
                        const problem = byDay.get(weekday);
                        return (
                            <div
                                key={weekday}
                                className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-3 py-2"
                            >
                                <label className="flex w-[74px] shrink-0 cursor-pointer items-center gap-2 text-[13px] font-medium coarse:min-h-11">
                                    <Checkbox
                                        checked={day.on}
                                        aria-label={`Open on ${long}`}
                                        onCheckedChange={(v) =>
                                            setDay(weekday, { on: v === true })
                                        }
                                    />
                                    {short}
                                </label>
                                {day.on ? (
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <TimeSelect
                                            value={day.open}
                                            onValueChange={(open) =>
                                                setDay(weekday, { open })
                                            }
                                            aria-label={`${long} opens`}
                                            aria-invalid={
                                                problem ? true : undefined
                                            }
                                            className="h-9 w-[6.75rem] text-[13px] coarse:h-11"
                                        />
                                        <span
                                            aria-hidden
                                            className="text-muted-foreground"
                                        >
                                            –
                                        </span>
                                        <TimeSelect
                                            value={day.close}
                                            onValueChange={(close) =>
                                                setDay(weekday, { close })
                                            }
                                            aria-label={`${long} closes`}
                                            aria-invalid={
                                                problem ? true : undefined
                                            }
                                            className="h-9 w-[6.75rem] text-[13px] coarse:h-11"
                                        />
                                    </span>
                                ) : (
                                    <span className="text-[12.5px] text-muted-foreground">
                                        Closed
                                    </span>
                                )}
                                {problem ? (
                                    <span className="basis-full text-[11.5px] text-destructive-subtle-foreground">
                                        {problem}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                {errors.hours ? (
                    <span className="text-[11.5px] text-destructive-subtle-foreground">
                        {errors.hours}
                    </span>
                ) : (
                    <span className="text-[11.5px] text-muted-foreground">
                        People can book inside these hours.
                    </span>
                )}
            </fieldset>

            <Field
                id={`${id}-service`}
                label="First service"
                error={errors["service.name"]}
                note="What people book, like “Haircut” or “Consultation”."
            >
                <Input
                    id={`${id}-service`}
                    value={b.name}
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={errors["service.name"] ? true : undefined}
                    aria-describedby={`${id}-service-note`}
                    onChange={(e) => setService({ name: e.target.value })}
                    className={INPUT}
                />
            </Field>
            <div className="grid min-w-0 grid-cols-2 gap-3">
                <Field
                    id={`${id}-minutes`}
                    label="Takes (minutes)"
                    error={errors["service.durationMinutes"]}
                >
                    <Input
                        id={`${id}-minutes`}
                        value={b.duration}
                        inputMode="numeric"
                        maxLength={4}
                        autoComplete="off"
                        aria-invalid={
                            errors["service.durationMinutes"] ? true : undefined
                        }
                        aria-describedby={
                            errors["service.durationMinutes"]
                                ? `${id}-minutes-note`
                                : undefined
                        }
                        onChange={(e) =>
                            setService({ duration: e.target.value })
                        }
                        className={INPUT}
                    />
                </Field>
                <Field
                    id={`${id}-price`}
                    label={`Price (${currencySymbol("INR")})`}
                    error={errors["service.price"]}
                >
                    <Input
                        id={`${id}-price`}
                        value={b.price}
                        inputMode="decimal"
                        maxLength={10}
                        autoComplete="off"
                        aria-invalid={
                            errors["service.price"] ? true : undefined
                        }
                        aria-describedby={
                            errors["service.price"]
                                ? `${id}-price-note`
                                : undefined
                        }
                        onChange={(e) => setService({ price: e.target.value })}
                        className={INPUT}
                    />
                </Field>
            </div>
        </>
    );
}
