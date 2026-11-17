"use client";

import { formatClock } from "@/lib/format/datetime";
import { chipClass } from "@saroh/ui/chip";
import { ChoiceGroup } from "@saroh/ui/choice-group";
import { cn } from "@saroh/ui/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];

/** A row in a sheet's group: the label on the left, its value on the right. */
export const FIELD_ROW =
    "flex min-h-[52px] w-full items-center gap-3 border-b border-border bg-card px-3.5 text-left text-[15px] text-foreground last:border-b-0";

/** The picker's buttons: 44px, squarer than a chip, the numbers aligned. */
const pick = (on: boolean) =>
    chipClass(
        on,
        "h-11 w-full justify-center rounded-[10px] px-0 text-[14px] tabular-nums",
    );

/**
 * A time of day as a row of the sheet it is in ("Opens · 9:00 am"), as the
 * Hours and time off boards draw it (U17): pressing the row opens a picker
 * under it — the hour, the minutes on the quarter hour, am or pm — and
 * each press picks at once, so the time is set in two or three taps with
 * no list to scroll. One row is open at a time; its parent says which.
 * An end time (`upTo`) reads 12 am as midnight at the end of the day.
 */
export function ClockRow({
    label,
    value,
    onPick,
    open,
    onToggle,
    upTo = false,
    indent = false,
    disabled = false,
}: {
    label: string;
    /** Minutes from local midnight; 1440 is midnight at the day's end. */
    value: number;
    onPick: (minute: number) => void;
    open: boolean;
    onToggle: () => void;
    upTo?: boolean;
    /** Under a switch it belongs to (a lunch break's From and To). */
    indent?: boolean;
    disabled?: boolean;
}) {
    const minute = value % 1440;
    const h24 = Math.floor(minute / 60);
    const mins = minute % 60;
    const pm = h24 >= 12;
    const h12 = ((h24 + 11) % 12) + 1;
    const make = (h: number, m: number, isPm: boolean) => {
        const at = ((h % 12) + (isPm ? 12 : 0)) * 60 + m;
        return upTo && at === 0 ? 1440 : at;
    };
    return (
        <>
            <button
                type="button"
                aria-expanded={open}
                disabled={disabled}
                onClick={onToggle}
                className={cn(
                    FIELD_ROW,
                    "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-card",
                    open && "bg-muted/40",
                )}
            >
                <span className={cn("flex-1", indent && "pl-3")}>{label}</span>
                <span
                    className={cn(
                        "tabular-nums",
                        open
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {formatClock(minute)}
                </span>
            </button>
            {open ? (
                <div
                    role="group"
                    aria-label={`Pick a time for ${label}`}
                    className="border-b border-border bg-muted/40 px-3 pb-3 pt-2.5 last:border-b-0"
                >
                    <ChoiceGroup
                        label="Hour"
                        className="grid grid-cols-6 gap-1.5"
                        value={String(h12)}
                        onChange={(h) => onPick(make(Number(h), mins, pm))}
                        choices={HOURS.map((h) => ({
                            value: String(h),
                            label: h,
                            ariaLabel: `${h} o'clock`,
                        }))}
                        itemClassName={pick}
                    />
                    <div className="mt-1.5 grid grid-cols-[repeat(4,1fr)_8px_repeat(2,1fr)] gap-1.5">
                        <ChoiceGroup
                            label="Minutes"
                            className="col-span-4 grid grid-cols-4 gap-1.5"
                            value={String(mins)}
                            onChange={(m) => onPick(make(h12, Number(m), pm))}
                            choices={MINUTES.map((m) => ({
                                value: String(m),
                                label: `:${String(m).padStart(2, "0")}`,
                                ariaLabel: `${m} minutes past`,
                            }))}
                            itemClassName={pick}
                        />
                        <span aria-hidden />
                        <ChoiceGroup
                            label="am or pm"
                            className="col-span-2 grid grid-cols-2 gap-1.5"
                            value={pm ? "pm" : "am"}
                            onChange={(p) =>
                                onPick(make(h12, mins, p === "pm"))
                            }
                            choices={[
                                { value: "am", label: "am" },
                                { value: "pm", label: "pm" },
                            ]}
                            itemClassName={pick}
                        />
                    </div>
                </div>
            ) : null}
        </>
    );
}
