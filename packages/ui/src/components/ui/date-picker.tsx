"use client";

import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * Pinned locale: the label is rendered on the server and again on the
 * client, and an inherited locale can differ between them and fail
 * hydration.
 */
const FORMAT = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
});

export interface DatePickerProps {
    value: Date | undefined;
    onValueChange: (value: Date | undefined) => void;
    placeholder?: string;
    id?: string;
    disabled?: boolean;
    className?: string;
    /** Days that cannot be picked, e.g. `{ before: new Date() }`. */
    disabledDays?: React.ComponentProps<typeof Calendar>["disabled"];
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}

/**
 * A date, picked from a calendar in a popover — shadcn's date picker.
 *
 * Replaces `<input type="date">`, which draws a different control in every
 * browser and cannot be styled to match the product's fields.
 */
export function DatePicker({
    value,
    onValueChange,
    placeholder = "Pick a date",
    id,
    disabled,
    className,
    disabledDays,
    ...aria
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-label={aria["aria-label"]}
                    aria-describedby={aria["aria-describedby"]}
                    aria-invalid={aria["aria-invalid"]}
                    className={cn(
                        // `flex`, not the button's inline-flex, so it sits under its
                        // label in a form row like every other field.
                        "flex w-[11rem] justify-start gap-2 bg-field font-normal",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    <CalendarIcon aria-hidden className="size-4" />
                    {value ? FORMAT.format(value) : placeholder}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={value}
                    onSelect={(d) => {
                        onValueChange(d);
                        setOpen(false);
                    }}
                    disabled={disabledDays}
                    initialFocus
                />
            </PopoverContent>
        </Popover>
    );
}

/** "2026-11-30" as a local day, or undefined when it isn't one. */
export function dateFromIso(iso: string | null | undefined): Date | undefined {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
    if (!m) return undefined;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** A local day as "2026-11-30". */
export function isoFromDate(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface DateInputProps extends Omit<
    DatePickerProps,
    "value" | "onValueChange" | "disabledDays"
> {
    /** The day as "YYYY-MM-DD"; "" for none. Leave out to let it hold its own. */
    value?: string;
    /** The first day shown when `value` is left out. */
    defaultValue?: string;
    onValueChange?: (iso: string) => void;
    /** The earliest and latest day it takes, as "YYYY-MM-DD". */
    min?: string;
    max?: string;
    /** Posted with a form under this name, as "YYYY-MM-DD" ("" for none). */
    name?: string;
    required?: boolean;
    /** Offers "Clear" for an optional day. */
    clearable?: boolean;
}

/**
 * The shadcn date picker for a day kept as "YYYY-MM-DD": what an
 * `<input type="date">` gave a form (a string, `min`/`max`, a `name` to
 * post), with the product's own field instead of each browser's. Use it
 * for every date field; `check:date-inputs` refuses `type="date"`.
 */
export function DateInput({
    value,
    defaultValue,
    onValueChange,
    min,
    max,
    name,
    required,
    clearable,
    placeholder = "Pick a date",
    ...rest
}: DateInputProps) {
    const [own, setOwn] = React.useState(defaultValue ?? "");
    const iso = value ?? own;
    const change = (next: string) => {
        if (value === undefined) setOwn(next);
        onValueChange?.(next);
    };
    const before = dateFromIso(min);
    const after = dateFromIso(max);
    const disabledDays = [
        ...(before ? [{ before }] : []),
        ...(after ? [{ after }] : []),
    ];
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <DatePicker
                {...rest}
                placeholder={placeholder}
                value={dateFromIso(iso)}
                onValueChange={(d) => change(d ? isoFromDate(d) : "")}
                disabledDays={disabledDays.length ? disabledDays : undefined}
            />
            {clearable && iso && !rest.disabled ? (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => change("")}
                    aria-label={
                        rest["aria-label"]
                            ? `Clear ${rest["aria-label"]}`
                            : "Clear the date"
                    }
                >
                    Clear
                </Button>
            ) : null}
            {name ? (
                <input
                    type="hidden"
                    name={name}
                    value={iso}
                    required={required}
                />
            ) : null}
        </span>
    );
}
