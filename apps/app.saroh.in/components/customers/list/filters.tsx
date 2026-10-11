"use client";

import { ListSearch } from "@saroh/ui/list-search";

import { ListFilter, ListToolbar } from "@/components/shared/list-toolbar";
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
 * toolbar's one row: search, who to show (each choice with its count),
 * "Bought at" (only with more than one location, and only for a role that
 * reads orders), and the sort on the right. Everything goes into the address;
 * the server asks the API for that page again.
 */
export function Filters({
    query,
    page,
    go,
    count = null,
    searching = false,
}: {
    /** "Showing 1 to 50 of 120", while the list runs past a page. */
    count?: string | null;
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
            count={count}
            onClear={
                query.q || page.chip !== "all" || query.store
                    ? () => go({ q: "", chip: "all", store: null })
                    : undefined
            }
            search={
                <ListSearch
                    placeholder="Search customers"
                    describe="By name, phone or email"
                    defaultValue={query.q}
                    searching={searching}
                    onSearch={(q) => {
                        if (q !== query.q) go({ q });
                    }}
                />
            }
            filters={
                <>
                    <ListFilter<CustomerChip>
                        label="Show"
                        value={page.chip}
                        onValueChange={(chip) => go({ chip })}
                        options={chips.map((c) => ({
                            value: c.key,
                            label: c.key === "all" ? "All customers" : c.label,
                            count: c.count,
                        }))}
                    />
                    {storefronts.length > 1 ? (
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
                    ) : null}
                </>
            }
            end={
                <ListFilter<CustomerSort>
                    // A sort narrows nothing.
                    narrowed={false}
                    label="Sort"
                    value={query.sort ?? page.sort}
                    onValueChange={(sort) => go({ sort })}
                    options={sorts.map((s) => ({
                        value: s,
                        label: SORT_LABEL[s],
                    }))}
                />
            }
        />
    );
}
