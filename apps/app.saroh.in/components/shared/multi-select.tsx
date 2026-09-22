"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

export interface MultiOption {
    id: string;
    label: string;
    /** A heading to group by — the storefront a product lives in, say. */
    group?: string;
}

/**
 * Several things picked from a searchable list — shadcn's combobox with
 * checkmarks, the picks shown as removable chips under it. For lists a
 * merchant names from rather than scrolls: storefronts, collections, products.
 */
export function MultiSelect({
    options,
    value,
    onValueChange,
    placeholder,
    searchPlaceholder = "Search",
    emptyText = "Nothing by that name.",
    id,
    disabled,
    "aria-describedby": describedBy,
}: {
    options: MultiOption[];
    value: string[];
    onValueChange: (ids: string[]) => void;
    placeholder: string;
    searchPlaceholder?: string;
    emptyText?: string;
    id?: string;
    disabled?: boolean;
    "aria-describedby"?: string;
}) {
    const [open, setOpen] = useState(false);
    const picked = options.filter((o) => value.includes(o.id));
    const groups = Array.from(new Set(options.map((o) => o.group ?? "")));
    const toggle = (optionId: string) => {
        onValueChange(
            value.includes(optionId)
                ? value.filter((v) => v !== optionId)
                : [...value, optionId],
        );
    };

    return (
        <div className="grid max-w-[480px] gap-2">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id={id}
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-describedby={describedBy}
                        disabled={disabled}
                        className={cn(
                            "flex w-full justify-between bg-field font-normal",
                            picked.length === 0 && "text-muted-foreground",
                        )}
                    >
                        {picked.length === 0
                            ? placeholder
                            : `${picked.length} chosen`}
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
                        <CommandInput placeholder={searchPlaceholder} />
                        <CommandList>
                            <CommandEmpty>{emptyText}</CommandEmpty>
                            {groups.map((group) => (
                                <CommandGroup
                                    key={group || "all"}
                                    heading={group || undefined}
                                >
                                    {options
                                        .filter(
                                            (o) => (o.group ?? "") === group,
                                        )
                                        .map((o) => (
                                            <CommandItem
                                                key={o.id}
                                                value={`${o.label} ${o.group ?? ""} ${o.id}`}
                                                onSelect={() => toggle(o.id)}
                                            >
                                                <Check
                                                    aria-hidden
                                                    className={cn(
                                                        "mr-2 size-4",
                                                        value.includes(o.id)
                                                            ? "opacity-100"
                                                            : "opacity-0",
                                                    )}
                                                />
                                                {o.label}
                                            </CommandItem>
                                        ))}
                                </CommandGroup>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            {picked.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Chosen">
                    {picked.map((o) => (
                        <li key={o.id}>
                            <Badge variant="neutral" className="gap-1 pr-1">
                                {o.label}
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => toggle(o.id)}
                                    aria-label={`Remove ${o.label}`}
                                    className="rounded-full p-0.5 hover:bg-foreground/10"
                                >
                                    <X aria-hidden className="size-3" />
                                </button>
                            </Badge>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
