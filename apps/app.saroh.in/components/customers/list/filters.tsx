"use client";

import { ListSearch } from "@saroh/ui/list-search";

import { chipClass } from "@/components/shared/chip";
import type {
    CustomerChip,
    CustomerSort,
    CustomersPage,
    ListQuery,
} from "@/lib/customers/list";
import { chipsFor, SORT_LABEL, sortsFor } from "@/lib/customers/list";
import { NUMBER_LOCALE } from "@/lib/format/locale";
import { OptionSelect } from "@saroh/ui/option-select";

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
    searching = false,
}: {
    /** The list is being read again. */
    searching?: boolean;
    query: ListQuery;
    page: CustomersPage;
    /** Replace the address with `patch` applied. */
    go: (patch: Partial<ListQuery>) => void;
}) {
    const storefronts = page.storefronts ?? [];
    const sorts = sortsFor(page);
    const chips = chipsFor(page);

    return (
        <>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <ListSearch
                    placeholder="Search customers by name, phone or email"
                    defaultValue={query.q}
                    searching={searching}
                    onSearch={(q) => {
                        if (q !== query.q) go({ q });
                    }}
                    className="sm:max-w-[420px]"
                />
                {storefronts.length > 1 ? (
                    <OptionSelect
                        size="sm"
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
                        className="w-auto min-w-[150px] max-w-full"
                    />
                ) : null}
                <OptionSelect<CustomerSort>
                    size="sm"
                    aria-label="Sort"
                    value={query.sort ?? page.sort}
                    onValueChange={(sort) => go({ sort })}
                    options={sorts.map((s) => ({
                        value: s,
                        label: SORT_LABEL[s],
                    }))}
                    className="w-auto min-w-[150px]"
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
            className={chipClass(on)}
        >
            {label}
            <span className="ml-1.5 tabular-nums opacity-70">
                {count.toLocaleString(NUMBER_LOCALE)}
            </span>
        </button>
    );
}
