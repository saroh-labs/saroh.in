"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import { Check, ChevronDown, Store } from "lucide-react";

/**
 * "A filter, not a scope": which storefront's view of a business-wide list to
 * show. Only offered where there is more than one to choose between.
 *
 * The distinction is the whole reason this control has a note at the bottom.
 * The catalogue and the customer list belong to the BUSINESS; a storefront
 * decides what it sells and who has bought there. Picking one narrows what is
 * on screen and nothing else — it does not put the rest of the workspace into
 * that storefront, which is what a scope would do (the workspace design says
 * so in as many words).
 */
export function StorefrontFilter({
    stores,
    countFor,
    total,
    value,
    onChange,
    noun,
    label,
    note,
}: {
    stores: { id: string; name: string }[];
    /** How many rows a storefront holds, for the row's second line. */
    countFor: (storeId: string) => number;
    /** How many rows there are in all, for "All storefronts". */
    total: number;
    value: string | null;
    onChange: (storeId: string | null) => void;
    noun: { one: string; other: string };
    /** The menu's heading, e.g. "Show products sold at". */
    label: string;
    /** Why this is a filter and not a scope, in this list's own words. */
    note: string;
}) {
    const current = stores.find((s) => s.id === value);
    const choices = [
        { id: null, name: "All storefronts", n: total },
        ...stores.map((s) => ({ id: s.id, name: s.name, n: countFor(s.id) })),
    ];
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        "h-[38px] gap-[7px] px-[13px] text-[13px] font-medium text-neutral-600 dark:text-foreground",
                        current && "border-foreground",
                    )}
                    aria-label={`Storefront filter: ${current?.name ?? "all storefronts"}. Change it.`}
                >
                    <Store className="size-4" />
                    {current?.name ?? "All storefronts"}
                    <ChevronDown className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[244px]">
                <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {label}
                </DropdownMenuLabel>
                {choices.map((c) => {
                    const on = c.id === value;
                    return (
                        <DropdownMenuItem
                            key={c.id ?? "all"}
                            onSelect={() => onChange(c.id)}
                            className={cn(on && "bg-foreground/[0.03]")}
                        >
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] font-medium">
                                    {c.name}
                                </span>
                                <span className="block text-[11px] text-muted-foreground">
                                    {c.n === 1
                                        ? `1 ${noun.one}`
                                        : `${c.n} ${noun.other}`}
                                </span>
                            </span>
                            {on ? <Check aria-hidden /> : null}
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuSeparator />
                <p className="px-[9px] pb-1 pt-0.5 text-[11px] leading-[1.45] text-muted-foreground">
                    {note}
                </p>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
