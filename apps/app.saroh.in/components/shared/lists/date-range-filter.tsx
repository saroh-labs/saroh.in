"use client";

import { DateInput } from "@saroh/ui/date-picker";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";

import {
    listFilterClass,
    NARROWED,
} from "@/components/shared/lists/list-toolbar";
import type { DatePick, DateRange } from "@/lib/views/date-range";
import { DATE_OPTIONS } from "@/lib/views/date-range";

/**
 * A list's date filter (`lib/views/date-range.ts`), the one Orders drew
 * first: a dropdown of presets and "Custom range…", which brings a From
 * and a To day. One of the toolbar's dropdowns at the desk, as wide as its
 * words; `stacked` in a phone's filters sheet, the sheet's width. Picking
 * a preset clears the days.
 */
export function DateRangeFilter({
    value,
    onChange,
    stacked = false,
    label = "Date",
}: {
    value: DateRange;
    onChange: (patch: Partial<DateRange>) => void;
    stacked?: boolean;
    /** The dropdown's accessible name: what the date is ("Issued"). */
    label?: string;
}) {
    const field = stacked ? "w-full min-w-0" : "w-auto min-w-0";
    return (
        <>
            <OptionSelect<DatePick | "">
                aria-label={label}
                value={value.date ?? ""}
                onValueChange={(v) =>
                    onChange({ date: v || null, from: null, to: null })
                }
                options={[{ value: "", label: "All dates" }, ...DATE_OPTIONS]}
                className={
                    stacked
                        ? "w-full"
                        : cn(listFilterClass, value.date && NARROWED)
                }
            />
            {value.date === "custom" ? (
                <div
                    className={
                        stacked ? "grid grid-cols-2 gap-2.5" : "contents"
                    }
                >
                    <DateInput
                        aria-label="From"
                        placeholder="From"
                        value={value.from ?? ""}
                        max={value.to ?? undefined}
                        onValueChange={(v) => onChange({ from: v || null })}
                        className={field}
                    />
                    <DateInput
                        aria-label="To"
                        placeholder="To"
                        value={value.to ?? ""}
                        min={value.from ?? undefined}
                        onValueChange={(v) => onChange({ to: v || null })}
                        className={field}
                    />
                </div>
            ) : null}
        </>
    );
}
