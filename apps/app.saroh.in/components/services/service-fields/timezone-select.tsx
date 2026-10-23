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

/** "Asia/Kolkata" → "Kolkata · Asia", the way a person looks one up. */
export function timezoneLabel(zone: string): string {
    const parts = zone.split("/");
    const city = (parts.at(-1) ?? zone).replace(/_/g, " ");
    return parts.length > 1 ? `${city} · ${parts[0]}` : city;
}

/**
 * A timezone, searched rather than typed. The API takes an IANA name and
 * rejects anything else, so a free-text field was a way to be told "invalid
 * timezone" after filling in the rest of the form. Searched by city or region,
 * the way the country picker beside it works.
 */
export function TimezoneSelect({
    value,
    onValueChange,
    id,
    disabled,
    className,
}: {
    value: string;
    onValueChange: (zone: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    // Built only once the list is opened: some 400 names are not needed to
    // draw the button, and the runtime's own list is the one the API checks.
    const zones = useMemo(() => {
        if (!open) return [];
        const all = Intl.supportedValuesOf("timeZone");
        // A zone saved before this list existed is still offered as itself.
        return value && !all.includes(value) ? [value, ...all] : all;
    }, [open, value]);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        "flex w-full justify-between bg-field font-normal",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    {value ? timezoneLabel(value) : "Choose a timezone"}
                    <ChevronsUpDown
                        aria-hidden
                        className="size-4 shrink-0 opacity-50"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
            >
                <Command>
                    <CommandInput placeholder="Search a city or region" />
                    <CommandList>
                        <CommandEmpty>No timezone by that name.</CommandEmpty>
                        {zones.map((zone) => (
                            <CommandItem
                                key={zone}
                                value={`${zone} ${timezoneLabel(zone)}`}
                                onSelect={() => {
                                    onValueChange(zone);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4",
                                        value === zone
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                    {timezoneLabel(zone)}
                                </span>
                                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                                    {zone}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
