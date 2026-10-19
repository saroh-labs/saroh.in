"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import { shortName } from "@/lib/calendar/days-off";
import type { LayerStyle, Off } from "@/lib/calendar/layers";
import type { TeamOption } from "@/lib/calendar/team";
import type { CalendarMonth, LayerKey } from "@/lib/calendar/types";
import { filterLabel, showLabel } from "@/lib/calendar/what-to-show";

import { TONE_FILL } from "./tones";

const ROW =
    "flex w-full items-center gap-3 text-left text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The Calendar month's one filter button (bookings U13): "Everyone ·
 * bookings, classes and invoices", which opens What to show — Whose (the
 * team filter, E24) and On the calendar (a switch per layer with this
 * month's total). A sheet from the foot of a phone (BKMOverviewMonth), a
 * popover under the button on the desk (BKDCalMonth). Each choice takes
 * effect as it is made; Show closes it. A layer that couldn't be read is
 * named and can't be switched.
 */
export function WhatToShow({
    people,
    person,
    onPerson,
    layers,
    off,
    totals,
    failed,
    onToggle,
}: {
    people: TeamOption[];
    person: string | null;
    onPerson: (id: string | null) => void;
    layers: LayerStyle[];
    off: Off;
    totals: CalendarMonth["totals"];
    failed: Set<string>;
    onToggle: (key: LayerKey) => void;
}) {
    const phone = usePhone();
    const [open, setOpen] = useState(false);
    const label = filterLabel({ layers, off, people, person });
    const whose = [
        { id: null, name: "Everyone" },
        ...people.map((p) => ({ id: p.id, name: p.name })),
    ];

    const trigger = (
        <button
            type="button"
            aria-label={`What to show: ${label}`}
            className={cn(
                "inline-flex h-[38px] min-w-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active coarse:h-11",
                "max-[759px]:h-11 max-[759px]:flex-1 max-[759px]:rounded-[10px] max-[759px]:text-[13.5px]",
            )}
        >
            <ListFilter aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{label}</span>
            <ChevronDown
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground max-[759px]:hidden"
            />
        </button>
    );

    return (
        <HeaderOverlay
            open={open}
            onOpenChange={setOpen}
            trigger={trigger}
            title="What to show"
            width={360}
            align="end"
            footer={
                <Button
                    data-ph-mask=""
                    className="w-full max-[759px]:h-12 max-[759px]:text-[15px]"
                    onClick={() => setOpen(false)}
                >
                    {showLabel(layers, off, phone)}
                </Button>
            }
        >
            {people.length > 0 ? (
                <>
                    <div className="label mb-1.5">Whose</div>
                    <div
                        role="radiogroup"
                        aria-label="Whose"
                        className="grid gap-1 max-[759px]:-mx-5 max-[759px]:flex max-[759px]:gap-1.5 max-[759px]:overflow-x-auto max-[759px]:px-5 max-[759px]:[scrollbar-width:none]"
                    >
                        {whose.map((p) => {
                            const on = p.id === person;
                            return (
                                <button
                                    key={p.id ?? "everyone"}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => onPerson(p.id)}
                                    className={cn(
                                        ROW,
                                        "min-h-12 cursor-pointer rounded-[10px] border border-border bg-card px-3 py-1.5 transition-colors duration-fast hover:border-foreground",
                                        on &&
                                            "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]",
                                        "max-[759px]:h-11 max-[759px]:min-h-0 max-[759px]:w-auto max-[759px]:flex-none max-[759px]:whitespace-nowrap max-[759px]:rounded-full max-[759px]:px-3.5 max-[759px]:text-[13.5px] max-[759px]:font-medium max-[759px]:shadow-none",
                                        on &&
                                            "max-[759px]:bg-primary max-[759px]:text-primary-foreground",
                                    )}
                                >
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "size-[18px] shrink-0 rounded-full border-[1.5px] border-border-strong max-[759px]:hidden",
                                            on &&
                                                "border-[5.5px] border-foreground",
                                        )}
                                    />
                                    <span className="text-[13.5px] font-semibold max-[759px]:font-medium">
                                        {phone && p.id
                                            ? shortName(p.name)
                                            : p.name}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </>
            ) : null}

            <div
                className={cn(
                    "label mb-1.5",
                    people.length > 0 && "mt-3.5 max-[759px]:mt-4",
                )}
                id="what-to-show-layers"
            >
                On the calendar
            </div>
            <div
                role="group"
                aria-labelledby="what-to-show-layers"
                className="grid gap-1 max-[759px]:gap-0"
            >
                {layers.map((layer) => {
                    const on = !off[layer.key];
                    const broken = failed.has(layer.key);
                    const sub = broken
                        ? "Couldn't load"
                        : `${totals[layer.key] ?? 0} this month`;
                    const swatch = (
                        <span
                            aria-hidden
                            className={cn(
                                "shrink-0 rounded-[4px]",
                                TONE_FILL[layer.tone],
                                "h-3.5 w-[22px] max-[759px]:size-3.5 max-[759px]:rounded-[3px]",
                                broken && "opacity-40",
                            )}
                        />
                    );
                    const words = (
                        <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold max-[759px]:text-[14.5px]">
                                {layer.label}
                            </span>
                            <span className="mt-0.5 block text-[12px] text-muted-foreground max-[759px]:text-[12.5px]">
                                {sub}
                            </span>
                        </span>
                    );
                    if (phone) {
                        return (
                            <div
                                key={layer.key}
                                className="flex min-h-14 items-center gap-3 border-b border-border/70 last:border-b-0"
                            >
                                {swatch}
                                {words}
                                <Switch
                                    checked={on && !broken}
                                    disabled={broken}
                                    onCheckedChange={() => onToggle(layer.key)}
                                    aria-label={`Show ${layer.label}`}
                                />
                            </div>
                        );
                    }
                    return (
                        <button
                            key={layer.key}
                            type="button"
                            role="checkbox"
                            aria-checked={on && !broken}
                            disabled={broken}
                            onClick={() => onToggle(layer.key)}
                            className={cn(
                                ROW,
                                "min-h-12 cursor-pointer rounded-[10px] border border-border bg-card px-3 py-1.5 transition-colors duration-fast hover:border-foreground disabled:cursor-not-allowed disabled:border-dashed disabled:hover:border-border",
                                on &&
                                    !broken &&
                                    "border-foreground shadow-[inset_0_0_0_1px_hsl(var(--foreground))]",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-border-strong text-primary-foreground",
                                    on &&
                                        !broken &&
                                        "border-primary bg-primary",
                                )}
                            >
                                {on && !broken ? (
                                    <Check className="size-3" strokeWidth={3} />
                                ) : null}
                            </span>
                            {swatch}
                            {words}
                        </button>
                    );
                })}
            </div>
        </HeaderOverlay>
    );
}
