"use client";

import { Button } from "@saroh/ui/button";
import { Chip } from "@saroh/ui/chip";
import { ChipGroup } from "@saroh/ui/choice-group";
import { DateInput } from "@saroh/ui/date-picker";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { formatDay } from "@/lib/format/datetime";
import type {
    ForwardPick,
    MoreFilters,
    Order,
    StatusPick,
} from "@/lib/services/all-bookings";
import {
    forwardPickOf,
    forwardRange,
    moreCount,
    STATUS_PICKS,
    UNASSIGNED,
} from "@/lib/services/all-bookings";
import type { LocalDate } from "@/lib/services/diary";
import type { DateRange } from "@/lib/views/date-range";
import { dateRangeOn } from "@/lib/views/date-range";

const ANY = "__any";
const ANY_DATE = "any";

export const ORDERS: readonly { value: Order; label: string }[] = [
    { value: "soonest", label: "Soonest first" },
    { value: "latest", label: "Most recent first" },
];

type DatePickValue = "any" | ForwardPick | "month" | "custom" | "other";

/** What Filters' Dates shows chosen, from the range in the address. */
function datePickValue(dates: DateRange, today: LocalDate): DatePickValue {
    if (!dateRangeOn(dates) && dates.date !== "custom") return ANY_DATE;
    const forward = forwardPickOf(dates, today);
    if (forward) return forward;
    if (dates.date === "month") return "month";
    if (dates.date === "custom") return "custom";
    return "other";
}

/** A date range in words, for its pill. */
export function datesWords(dates: DateRange, today: LocalDate): string | null {
    const v = datePickValue(dates, today);
    if (v === "any") return null;
    if (v === "tomorrow") return "Tomorrow";
    if (v === "next7") return "Next 7 days";
    if (v === "month") return "This month";
    if (v === "custom") {
        const day = (d: string) => formatDay(d, { year: "never" });
        if (dates.from && dates.to) {
            return dates.from === dates.to
                ? day(dates.from)
                : `${day(dates.from)} to ${day(dates.to)}`;
        }
        if (dates.from) return `Since ${day(dates.from)}`;
        if (dates.to) return `Up to ${day(dates.to)}`;
        return "Pick dates";
    }
    const legacy: Record<string, string> = {
        today: "Today",
        yesterday: "Yesterday",
        "7d": "Last 7 days",
    };
    return legacy[dates.date ?? ""] ?? "Dates";
}

/**
 * All bookings' one Filters button (BLHB, variant B): Sort, Whose bookings,
 * Dates, Service and Status, held in one popover at a desk and one sheet
 * from the foot of a phone. Each choice narrows the list at once; Clear
 * puts them all back and "Show 2 bookings" closes it on what is showing.
 *
 * "Today" is not among the Dates: its view does it. The forward picks
 * (Tomorrow, Next 7 days) are custom ranges the API already reads.
 */
export function BookingFilters({
    value,
    onChange,
    order,
    onOrder,
    dates,
    onDates,
    today,
    services,
    staff,
    me,
    showing,
    narrowedBy,
    viewLabel,
    onClear,
    className,
}: {
    value: MoreFilters;
    onChange: (next: MoreFilters) => void;
    order: Order;
    onOrder: (order: Order) => void;
    dates: DateRange;
    onDates: (patch: Partial<DateRange>) => void;
    /** Today in the business's zone, for the forward picks. */
    today: LocalDate;
    services: readonly { value: string; label: string }[];
    staff: readonly { value: string; label: string }[];
    /** The viewer on the diary, for "Just me"; null when they aren't on it. */
    me: { id: string; name: string } | null;
    /** How many bookings show with these filters, for "Show 2 bookings". */
    /** Null while the list is on its way. */
    showing: number | null;
    /** Filters on, for the button's count (a date counts as one). */
    narrowedBy: number;
    /** "Upcoming": the view these narrow, said under the title. */
    viewLabel: string;
    onClear: () => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const ids = { service: useId(), status: useId() };
    const picked = datePickValue(dates, today);
    const others = staff.filter((s) => s.value !== me?.id);

    const toggle = (pick: StatusPick) =>
        onChange({
            ...value,
            statuses: value.statuses.includes(pick)
                ? value.statuses.filter((s) => s !== pick)
                : [...value.statuses, pick],
        });

    const pickDates = (v: DatePickValue) => {
        if (v === "any") onDates({ date: null, from: null, to: null });
        else if (v === "month") {
            onDates({ date: "month", from: null, to: null });
        } else if (v === "custom") {
            onDates({ date: "custom", from: null, to: null });
        } else if (v === "tomorrow" || v === "next7") {
            onDates({ date: "custom", ...forwardRange(v, today) });
        }
    };

    const who = value.staff ?? ANY;
    const total = narrowedBy;

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={setOpen}
            width={360}
            half
            align="end"
            title="Filters"
            subtitle={`Showing: ${viewLabel}. Sort, dates, who, service, status`}
            trigger={
                <button
                    type="button"
                    aria-label={total > 0 ? `Filters, ${total} on` : undefined}
                    data-filters=""
                    className={cn(
                        "inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border bg-card px-3.5 text-[14px] font-semibold text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active max-[759px]:h-11 max-[759px]:rounded-[10px] max-[759px]:text-[14.5px]",
                        total > 0 ? "border-foreground" : "border-border",
                        className,
                    )}
                >
                    <SlidersHorizontal aria-hidden className="size-4" />
                    Filters
                    {total > 0 ? (
                        <span
                            aria-hidden
                            className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground"
                        >
                            {total}
                        </span>
                    ) : null}
                </button>
            }
            footer={
                <div className="flex w-full items-center gap-2 max-[759px]:grid max-[759px]:grid-cols-[1fr_1.6fr]">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={moreCount(value) === 0 && !dateRangeOn(dates)}
                        onClick={onClear}
                    >
                        Clear
                    </Button>
                    <span className="flex-1 max-[759px]:hidden" />
                    <Button type="button" onClick={() => setOpen(false)}>
                        {showing === null
                            ? "Show bookings"
                            : `Show ${showing} ${showing === 1 ? "booking" : "bookings"}`}
                    </Button>
                </div>
            }
        >
            <div className="grid gap-4 pt-2">
                <Group label="Sort by">
                    <ChipGroup
                        label="Sort by"
                        value={order}
                        onChange={onOrder}
                        choices={ORDERS}
                    />
                    <p
                        data-ph-unmask=""
                        className="m-0 text-[12.5px] text-muted-foreground"
                    >
                        for this view
                    </p>
                </Group>
                <Group label="Dates">
                    <ChipGroup<DatePickValue>
                        label="Dates"
                        value={picked}
                        onChange={pickDates}
                        choices={[
                            { value: "any", label: "Any date" },
                            { value: "tomorrow", label: "Tomorrow" },
                            { value: "next7", label: "Next 7 days" },
                            { value: "month", label: "This month" },
                            { value: "custom", label: "Pick dates" },
                            ...(picked === "other"
                                ? [
                                      {
                                          value: "other" as const,
                                          label: datesWords(dates, today) ?? "",
                                      },
                                  ]
                                : []),
                        ]}
                    />
                    {dates.date === "custom" ? (
                        <div className="grid grid-cols-2 gap-2.5">
                            <DateInput
                                aria-label="From"
                                placeholder="From"
                                value={dates.from ?? ""}
                                max={dates.to ?? undefined}
                                onValueChange={(v) =>
                                    onDates({ from: v || null })
                                }
                            />
                            <DateInput
                                aria-label="To"
                                placeholder="To"
                                value={dates.to ?? ""}
                                min={dates.from ?? undefined}
                                onValueChange={(v) =>
                                    onDates({ to: v || null })
                                }
                            />
                        </div>
                    ) : null}
                </Group>
                <Group label="Whose bookings">
                    <ChipGroup
                        label="Whose bookings"
                        value={who}
                        onChange={(v) =>
                            onChange({ ...value, staff: v === ANY ? null : v })
                        }
                        choices={[
                            { value: ANY, label: "Everyone" },
                            ...(me ? [{ value: me.id, label: "Just me" }] : []),
                            ...others.map((s) => ({
                                value: s.value,
                                label:
                                    s.value === UNASSIGNED
                                        ? "Nobody yet"
                                        : s.label,
                            })),
                        ]}
                    />
                </Group>
                <div className="grid gap-1.5">
                    <Label htmlFor={ids.service}>Service</Label>
                    <OptionSelect
                        id={ids.service}
                        value={value.service ?? ANY}
                        onValueChange={(v) =>
                            onChange({
                                ...value,
                                service: v === ANY ? null : v,
                            })
                        }
                        options={[
                            { value: ANY, label: "All services" },
                            ...services,
                        ]}
                    />
                </div>
                <div className="grid gap-1.5">
                    <span
                        data-ph-unmask=""
                        id={ids.status}
                        className="text-[13px] font-semibold"
                    >
                        Status
                    </span>
                    <div
                        role="group"
                        aria-labelledby={ids.status}
                        className="flex flex-wrap gap-1.5"
                    >
                        {STATUS_PICKS.map((s) => (
                            <Chip
                                key={s.value}
                                as="toggle"
                                on={value.statuses.includes(s.value)}
                                onClick={() => toggle(s.value)}
                            >
                                {s.label}
                            </Chip>
                        ))}
                    </div>
                </div>
            </div>
        </HeaderOverlay>
    );
}

function Group({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <span data-ph-unmask="" className="text-[13px] font-semibold">
                {label}
            </span>
            {children}
        </div>
    );
}
