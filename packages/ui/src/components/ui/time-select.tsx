"use client";

import * as React from "react";

import { cn } from "../../lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./select";

/** "13:30" → "1:30 PM". Pure string work, so server and client agree. */
export function formatTime(value: string): string {
    const [h = "0", m = "00"] = value.split(":");
    const hour = Number(h);
    const suffix = hour < 12 ? "AM" : "PM";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:${m.padStart(2, "0")} ${suffix}`;
}

function slots(stepMinutes: number): string[] {
    const out: string[] = [];
    for (let t = 0; t < 24 * 60; t += stepMinutes) {
        const h = String(Math.floor(t / 60)).padStart(2, "0");
        const m = String(t % 60).padStart(2, "0");
        out.push(`${h}:${m}`);
    }
    return out;
}

export interface TimeSelectProps {
    /** "HH:MM", 24-hour. */
    value: string;
    onValueChange: (value: string) => void;
    /** Minutes between options. A value off the grid is still offered. */
    stepMinutes?: number;
    id?: string;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
}

/**
 * A time of day, picked from a list rather than typed.
 *
 * The native `<input type="time">` renders a different control in every
 * browser — spinbuttons in Chrome, a wheel on iOS — and none of them match
 * the rest of the product's fields. A select over fixed steps is also what a
 * merchant actually means: a shop opens at 9:00 or 9:30, not at 9:07.
 * The value stays "HH:MM" so it is what the API stores.
 */
export function TimeSelect({
    value,
    onValueChange,
    stepMinutes = 30,
    id,
    disabled,
    className,
    ...aria
}: TimeSelectProps) {
    const options = React.useMemo(() => {
        const grid = slots(stepMinutes);
        return value && !grid.includes(value) ? [...grid, value].sort() : grid;
    }, [stepMinutes, value]);

    return (
        <Select value={value} onValueChange={onValueChange} disabled={disabled}>
            <SelectTrigger
                id={id}
                className={cn("w-[7.5rem] tabular-nums", className)}
                aria-label={aria["aria-label"]}
                aria-describedby={aria["aria-describedby"]}
                aria-invalid={aria["aria-invalid"]}
            >
                <SelectValue placeholder="Time">
                    {value ? formatTime(value) : undefined}
                </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-64">
                {options.map((t) => (
                    <SelectItem key={t} value={t} className="tabular-nums">
                        {formatTime(t)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
