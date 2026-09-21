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
                        "w-[11rem] justify-start gap-2 bg-field font-normal",
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
