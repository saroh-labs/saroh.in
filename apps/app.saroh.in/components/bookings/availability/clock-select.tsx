"use client";

import { formatClock } from "@/lib/format/datetime";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";

const TIMES = Array.from({ length: 38 }, (_, i) => 300 + i * 30); // 05:00–23:30

/**
 * A time of day on the half hour, on the 12-hour clock ("6:00 am"), as
 * the Availability design draws it — the hours chips beside it read the same.
 */
export function ClockSelect({
    value,
    onChange,
    label,
    upTo = false,
}: {
    value: number;
    onChange: (minute: number) => void;
    label: string;
    /** An end time: 24:00 is offered, 05:00 is not. */
    upTo?: boolean;
}) {
    const options = upTo ? [...TIMES.slice(1), 1440] : TIMES;
    return (
        <Select
            value={String(value)}
            onValueChange={(v) => onChange(Number(v))}
        >
            <SelectTrigger
                aria-label={label}
                className="h-8 w-[5.5rem] rounded-[8px] px-2 text-[12.5px] tabular-nums coarse:h-11"
            >
                <SelectValue>{formatClock(value)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-64">
                {options.map((m) => (
                    <SelectItem
                        key={m}
                        value={String(m)}
                        className="tabular-nums"
                    >
                        {formatClock(m)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
