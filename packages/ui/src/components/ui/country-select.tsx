"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { COUNTRIES, countryName } from "../../lib/countries";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * A country, searched rather than scrolled: 249 of them is a list nobody
 * reads, so the shadcn combobox (Popover + Command) filters as you type.
 * The value is the two-letter code the API validates.
 */
export function CountrySelect({
    value,
    onValueChange,
    id,
    disabled,
    className,
    ...aria
}: {
    value: string;
    onValueChange: (code: string) => void;
    id?: string;
    disabled?: boolean;
    className?: string;
    "aria-describedby"?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    data-ph-unmask=""
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
                        "flex w-full max-w-[380px] justify-between bg-field font-normal",
                        !value && "text-muted-foreground",
                        className,
                    )}
                >
                    {value ? countryName(value) : "Choose a country"}
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
                    <CommandInput placeholder="Search countries" />
                    <CommandList>
                        <CommandEmpty>No country by that name.</CommandEmpty>
                        {COUNTRIES.map((c) => (
                            <CommandItem
                                key={c.code}
                                value={`${c.name} ${c.code}`}
                                onSelect={() => {
                                    onValueChange(c.code);
                                    setOpen(false);
                                }}
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4",
                                        value === c.code
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                {c.name}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
