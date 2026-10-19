"use client";

import { Button } from "@saroh/ui/button";
import { Chip } from "@saroh/ui/chip";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { SlidersHorizontal } from "lucide-react";
import { useId, useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import type { MoreFilters, StatusPick } from "@/lib/services/all-bookings";
import { moreCount, NO_MORE, STATUS_PICKS } from "@/lib/services/all-bookings";

const ANY = "__any";

/**
 * All bookings' More filters (BKDAllBookings): Service, With and Status,
 * behind one chip at the end of the views. A popover under it at a desk,
 * a sheet from the foot of a phone. Each choice narrows the list at once;
 * Clear puts all three back and "Show 18" closes it on what is showing.
 */
export function MoreBookingFilters({
    value,
    onChange,
    services,
    staff,
    showing,
    className,
}: {
    value: MoreFilters;
    onChange: (next: MoreFilters) => void;
    services: readonly { value: string; label: string }[];
    staff: readonly { value: string; label: string }[];
    /** How many bookings show with these filters, for "Show 18". */
    showing: number;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const ids = { service: useId(), staff: useId(), status: useId() };
    const on = moreCount(value);

    const toggle = (pick: StatusPick) =>
        onChange({
            ...value,
            statuses: value.statuses.includes(pick)
                ? value.statuses.filter((s) => s !== pick)
                : [...value.statuses, pick],
        });

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={setOpen}
            width={320}
            title="More filters"
            trigger={
                <button
                    type="button"
                    aria-label={on > 0 ? `More filters, ${on} on` : undefined}
                    data-more-filters=""
                    className={cn(
                        "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-3 text-[13px] font-medium text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active max-[759px]:h-11 max-[759px]:px-3.5 max-[759px]:text-[13.5px]",
                        on > 0 ? "border-foreground" : "border-border",
                        className,
                    )}
                >
                    <SlidersHorizontal aria-hidden className="size-4" />
                    More filters
                    {on > 0 ? (
                        <span aria-hidden className="tabular-nums opacity-70">
                            {on}
                        </span>
                    ) : null}
                </button>
            }
            footer={
                <div className="flex w-full items-center gap-2 max-[759px]:grid max-[759px]:grid-cols-2">
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={on === 0}
                        onClick={() => onChange(NO_MORE)}
                    >
                        Clear
                    </Button>
                    <span className="flex-1 max-[759px]:hidden" />
                    <Button type="button" onClick={() => setOpen(false)}>
                        Show {showing}
                    </Button>
                </div>
            }
        >
            <div className="grid gap-3 pt-2">
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
                    <Label htmlFor={ids.staff}>With</Label>
                    <OptionSelect
                        id={ids.staff}
                        value={value.staff ?? ANY}
                        onValueChange={(v) =>
                            onChange({ ...value, staff: v === ANY ? null : v })
                        }
                        options={[{ value: ANY, label: "Anyone" }, ...staff]}
                    />
                </div>
                <div className="grid gap-1.5">
                    <span id={ids.status} className="text-[13px] font-semibold">
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
