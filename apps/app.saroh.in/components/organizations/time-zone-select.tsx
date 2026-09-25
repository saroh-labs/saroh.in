"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
    currentZoneName,
    timeZoneOptions,
    zoneLabel,
} from "@/lib/organizations/time-zones";

/**
 * A time zone, searched rather than scrolled, as `CountrySelect` is: some
 * four hundred zones, each read as "Kolkata — India Standard Time
 * (GMT+5:30)" and found by city, name, offset or IANA name. The value is the
 * IANA name the API stores.
 */
export function TimeZoneSelect({
    value,
    onValueChange,
    id,
    disabled,
    className,
    ...aria
}: {
    value: string;
    onValueChange: (zone: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
    "aria-describedby"?: string;
}) {
    const [open, setOpen] = useState(false);
    // Made when first opened: the list reads the browser's tz data, and
    // today's offsets.
    const options = useMemo(() => (open ? timeZoneOptions() : []), [open]);
    const selected = value ? currentZoneName(value) : "";
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-describedby={aria["aria-describedby"]}
                    disabled={disabled}
                    className={cn(
                        // `flex`, not the button's inline-flex: in a form row it sits
                        // under its label like every other field.
                        "flex w-full max-w-[420px] justify-between bg-field font-normal",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    <span className="min-w-0 truncate">
                        {value ? zoneLabel(value) : "Choose a time zone"}
                    </span>
                    <ChevronsUpDown
                        aria-hidden
                        className="size-4 shrink-0 opacity-50"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] min-w-[min(320px,calc(100vw-32px))] p-0"
                align="start"
            >
                <Command>
                    <CommandInput placeholder="Search by city or zone name" />
                    <CommandList>
                        <CommandEmpty>No time zone by that name.</CommandEmpty>
                        {options.map((o) => (
                            <CommandItem
                                key={o.zone}
                                value={`${o.label} ${o.zone}`}
                                onSelect={() => {
                                    onValueChange(o.zone);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4 shrink-0",
                                        selected === o.zone
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                <span className="min-w-0 flex-1">
                                    {o.city}
                                    {o.name ? (
                                        <span className="text-muted-foreground">
                                            {" "}
                                            — {o.name}
                                        </span>
                                    ) : null}
                                </span>
                                <span className="ml-2 shrink-0 font-mono text-[12px] text-muted-foreground">
                                    {o.offset}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
