"use client";

import { ListSearch } from "@saroh/ui/list-search";

import type { OrdersQuery } from "@/lib/orders/list-query";

/**
 * Search by order number or customer name (and email or phone for a role
 * that reads contacts: the API decides). It covers every order, not the
 * page on screen, so it goes into the address after a pause in typing.
 */
export function SearchField({
    query,
    go,
    searching = false,
}: {
    query: OrdersQuery;
    go: (patch: Partial<OrdersQuery>) => void;
    /** The list is being read again. */
    searching?: boolean;
}) {
    return (
        <ListSearch
            placeholder="Search orders"
            defaultValue={query.q}
            searching={searching}
            onSearch={(q) => {
                if (q !== query.q) go({ q });
            }}
        />
    );
}
