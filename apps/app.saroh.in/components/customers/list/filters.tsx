"use client";

import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import type {
    CustomerChip,
    CustomerSort,
    CustomersPage,
    ListQuery,
} from "@/lib/customers/list";
import { chipsFor, SORT_LABEL, sortsFor } from "@/lib/customers/list";

const ALL_STORES = "all";

/**
 * The Customers list's controls (Saroh Customers.dc.html): search, "Bought
 * at" (only with more than one storefront, and only for a role that reads
 * orders), the sort, and the chips with their counts. Everything goes into
 * the address; the server asks the API for that page again.
 */
export function Filters({
    query,
    page,
    go,
}: {
    query: ListQuery;
    page: CustomersPage;
    /** Replace the address with `patch` applied. */
    go: (patch: Partial<ListQuery>) => void;
}) {
    const [text, setText] = useState(query.q);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const field = useRef<HTMLInputElement | null>(null);
    // The address changed elsewhere (Clear search and filters, Back): say
    // so — but never over what someone is still typing.
    useEffect(() => {
        if (document.activeElement !== field.current) setText(query.q);
    }, [query.q]);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    function search(next: string) {
        setText(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => go({ q: next.trim() }), 300);
    }

    const storefronts = page.storefronts ?? [];
    const sorts = sortsFor(page);
    const chips = chipsFor(page);

    return (
        <>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-[1_1_260px] sm:max-w-[420px]">
                    <Search
                        aria-hidden
                        className="pointer-events-none absolute left-[11px] top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        ref={field}
                        type="search"
                        value={text}
                        onChange={(e) => search(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Escape" && text) {
                                e.preventDefault();
                                search("");
                            }
                        }}
                        placeholder="Search by name, phone or email"
                        aria-label="Search by name, phone or email"
                        className="h-[34px] rounded-[9px] pl-8 text-[13px] coarse:h-11"
                    />
                </div>
                {storefronts.length > 1 ? (
                    <OptionSelect
                        aria-label="Location"
                        value={query.store ?? ALL_STORES}
                        onValueChange={(v) =>
                            go({ store: v === ALL_STORES ? null : v })
                        }
                        options={[
                            { value: ALL_STORES, label: "All locations" },
                            ...storefronts.map((s) => ({
                                value: s.id,
                                label: `Bought at ${s.name}`,
                            })),
                        ]}
                        className="h-[34px] w-auto min-w-[150px] max-w-full rounded-[9px] text-[13px] coarse:h-11"
                    />
                ) : null}
                <OptionSelect<CustomerSort>
                    aria-label="Sort"
                    value={query.sort ?? page.sort}
                    onValueChange={(sort) => go({ sort })}
                    options={sorts.map((s) => ({
                        value: s,
                        label: SORT_LABEL[s],
                    }))}
                    className="h-[34px] w-auto min-w-[150px] rounded-[9px] text-[13px] coarse:h-11"
                />
            </div>
            <div
                role="group"
                aria-label="Show"
                // Phones: one row that scrolls sideways, so the list starts
                // where the thumb is; wider, the chips wrap as drawn.
                className="-mx-4 mb-3.5 flex gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            >
                {chips.map((c) => (
                    <ChipButton
                        key={c.key}
                        chip={c.key}
                        label={c.label}
                        count={c.count}
                        on={c.key === page.chip}
                        onPick={(chip) => go({ chip })}
                    />
                ))}
            </div>
        </>
    );
}

function ChipButton({
    chip,
    label,
    count,
    on,
    onPick,
}: {
    chip: CustomerChip;
    label: string;
    count: number;
    on: boolean;
    onPick: (chip: CustomerChip) => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={() => onPick(chip)}
            className={cn(
                "h-[30px] shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11",
                on
                    ? "border-primary bg-primary font-semibold text-primary-foreground"
                    : "border-border bg-card font-medium text-foreground/75 hover:bg-muted",
            )}
        >
            {label}
            <span className="ml-1.5 tabular-nums opacity-70">
                {count.toLocaleString("en-GB")}
            </span>
        </button>
    );
}
