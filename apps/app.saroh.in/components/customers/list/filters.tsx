"use client";

import { ListSearch } from "@saroh/ui/list-search";

import {
    FilterChips,
    ListFilter,
    ListToolbar,
} from "@/components/shared/list-toolbar";
import type {
    CustomerChip,
    CustomerSort,
    CustomersPage,
    ListQuery,
} from "@/lib/customers/list";
import { chipsFor, SORT_LABEL, sortsFor } from "@/lib/customers/list";

const ALL_STORES = "all";

/**
 * The Customers list's controls (Saroh Customers.dc.html), in the one list
 * toolbar's order: search, "Bought at" (only with more than one location,
 * and only for a role that reads orders), the sort on the right, and the
 * chips with their counts under them. Everything goes into the address;
 * the server asks the API for that page again.
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
        <ListToolbar
            className="mb-3.5"
            search={
                <ListSearch
                    placeholder="Search customers by name, phone or email"
                    defaultValue={query.q}
                    searching={searching}
                    onSearch={(q) => {
                        if (q !== query.q) go({ q });
                    }}
                />
            }
            filters={
                storefronts.length > 1 ? (
                    <ListFilter
                        holdsData
                        label="Location"
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
                    />
                ) : null
            }
            end={
                <ListFilter<CustomerSort>
                    label="Sort"
                    value={query.sort ?? page.sort}
                    onValueChange={(sort) => go({ sort })}
                    options={sorts.map((s) => ({
                        value: s,
                        label: SORT_LABEL[s],
                    }))}
                />
            }
            chips={
                <FilterChips<CustomerChip>
                    label="Show"
                    value={page.chip}
                    onValueChange={(chip) => go({ chip })}
                    chips={chips.map((c) => ({
                        value: c.key,
                        label: c.label,
                        count: c.count,
                    }))}
                />
            }
        />
    );
}
