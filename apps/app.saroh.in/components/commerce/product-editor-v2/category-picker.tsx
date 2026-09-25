"use client";

import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { createCategory } from "@/lib/products/actions";

export interface CategoryChoice {
    id: string;
    name: string;
}

/**
 * The product's one category, searched rather than scrolled, with a way to
 * make a new one without leaving the product. Uncategorized is a real choice:
 * it clears the category rather than leaving it alone.
 */
export function CategoryPicker({
    storeId,
    value,
    onChange,
    categories,
    onCreated,
    manageHref,
    disabled,
    id,
}: {
    storeId: string;
    value: string;
    onChange: (id: string) => void;
    categories: CategoryChoice[];
    onCreated: (category: CategoryChoice) => void;
    manageHref: string;
    disabled?: boolean;
    id?: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [pending, start] = useTransition();
    const chosen = categories.find((c) => c.id === value);
    const q = query.trim();
    const canCreate =
        q !== "" &&
        !categories.some((c) => c.name.toLowerCase() === q.toLowerCase());

    function create() {
        start(async () => {
            const res = await createCategory(storeId, { name: q });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            const made = { id: res.data.id, name: q };
            onCreated(made);
            onChange(made.id);
            setQuery("");
            setOpen(false);
            showSuccess(`Category ${q} created and chosen.`);
        });
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={`Category: ${chosen?.name ?? "Uncategorized"}. Change it.`}
                    disabled={disabled}
                    className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-border bg-card px-2.5 text-left text-[13px] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground coarse:h-11"
                >
                    <span className="min-w-0 flex-1 truncate">
                        {chosen?.name ?? "Uncategorized"}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className="size-[13px] text-muted-foreground"
                        strokeWidth={2}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-[--radix-popover-trigger-width] min-w-[196px] rounded-[10px] p-1.5"
            >
                <Command>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder="Search or create a category"
                        className="h-8 text-[12.5px]"
                    />
                    <CommandList>
                        <CommandEmpty className="px-2 py-2 text-[12.5px] text-muted-foreground">
                            No category by that name.
                        </CommandEmpty>
                        {[{ id: "", name: "Uncategorized" }, ...categories].map(
                            (c) => (
                                <CommandItem
                                    key={c.id || "none"}
                                    value={c.name}
                                    onSelect={() => {
                                        onChange(c.id);
                                        setOpen(false);
                                    }}
                                    className={cn(
                                        "rounded-[7px] px-[9px] py-2 text-[12.5px] font-medium",
                                        c.id === value && "bg-muted/60",
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">
                                        {c.name}
                                    </span>
                                    {c.id === value ? (
                                        <Check
                                            aria-hidden
                                            className="size-3.5"
                                            strokeWidth={2.4}
                                        />
                                    ) : null}
                                </CommandItem>
                            ),
                        )}
                        {canCreate ? (
                            <CommandItem
                                value={`create ${q}`}
                                disabled={pending}
                                onSelect={create}
                                className="mt-[3px] rounded-[7px] border-t border-border/70 px-[9px] py-2 text-[12.5px] font-semibold text-brand"
                            >
                                + Create “{q}”
                            </CommandItem>
                        ) : null}
                    </CommandList>
                </Command>
                <Link
                    href={manageHref}
                    className="block px-[9px] pb-[3px] pt-[7px] text-[11.5px] text-brand hover:text-foreground"
                >
                    Manage categories
                </Link>
            </PopoverContent>
        </Popover>
    );
}
