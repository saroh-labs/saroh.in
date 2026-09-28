"use client";

import { Button } from "@saroh/ui/button";
import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
} from "@saroh/ui/command";
import { cn } from "@saroh/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@saroh/ui/popover";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { OrderProductOption } from "@/lib/orders/business-service";
import { findOrderProducts } from "@/lib/orders/list-actions";

/**
 * The Orders list's Product filter (plan B, B4): a search picker rather
 * than the design's plain menu, since a catalogue runs to hundreds of
 * products. It searches the business's products that are on its orders —
 * the API's, not the page's — a beat after typing stops, and the last
 * answer wins. "Any product" clears it.
 */
export function ProductFilter({
    value,
    name,
    onChange,
    className,
}: {
    /** The product id the list is filtered on; null for any. */
    value: string | null;
    /** Its name, from the filter options; null when unknown. */
    name: string | null;
    onChange: (productId: string | null) => void;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [found, setFound] = useState<OrderProductOption[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const asked = useRef(0);

    useEffect(() => {
        if (!open) return;
        const ticket = ++asked.current;
        const timer = setTimeout(() => {
            setSearching(true);
            void findOrderProducts(q).then((res) => {
                if (ticket !== asked.current) return;
                setSearching(false);
                if (res.ok) {
                    setFound(res.data);
                    setError(null);
                } else {
                    setError(res.error);
                }
            });
        }, 250);
        return () => clearTimeout(timer);
    }, [open, q]);

    function pick(productId: string | null) {
        setOpen(false);
        setQ("");
        if (productId !== value) onChange(productId);
    }

    const label = value ? (name ?? "One product") : "Any product";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    aria-label={`Product: ${value ? label : "any product"}. Change it.`}
                    className={cn(
                        "h-[34px] max-w-[220px] gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-normal coarse:h-11",
                        value && "border-foreground",
                        className,
                    )}
                >
                    <span className="min-w-0 truncate">{label}</span>
                    <ChevronDown
                        aria-hidden
                        className="size-3.5 shrink-0 text-muted-foreground"
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[260px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        value={q}
                        onValueChange={setQ}
                        placeholder="Search products"
                        aria-label="Search products"
                    />
                    <CommandList>
                        {error ? (
                            <p
                                role="alert"
                                className="px-3 py-2.5 text-[12.5px] text-destructive"
                            >
                                {error}
                            </p>
                        ) : null}
                        {!error && found?.length === 0 && !searching ? (
                            <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                                {q.trim()
                                    ? `No ordered product matches “${q.trim()}”.`
                                    : "No products have been ordered yet."}
                            </p>
                        ) : null}
                        {!found && !error ? (
                            <p className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                                Searching…
                            </p>
                        ) : null}
                        {value ? (
                            <CommandItem
                                value="__any__"
                                onSelect={() => pick(null)}
                                className="min-h-10 coarse:min-h-11"
                            >
                                <span className="ml-6">Any product</span>
                            </CommandItem>
                        ) : null}
                        {(found ?? []).map((p) => (
                            <CommandItem
                                key={p.id}
                                value={p.id}
                                onSelect={() => pick(p.id)}
                                className="min-h-10 coarse:min-h-11"
                            >
                                <Check
                                    aria-hidden
                                    className={cn(
                                        "mr-2 size-4 shrink-0",
                                        p.id === value
                                            ? "opacity-100"
                                            : "opacity-0",
                                    )}
                                />
                                <span className="min-w-0 truncate">
                                    {p.name}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
