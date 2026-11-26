"use client";

import { ListSearch } from "@saroh/ui/list-search";

import type { OrdersQuery } from "@/lib/orders/list-query";

/**
 * Search by order number, customer name or a product on the order (and
 * email or phone for a role that reads contacts: the API decides, and the
 * hint says so only to them). It covers every order in the view, not the
 * page on screen, so it goes into the address after a pause in typing.
 */
export function SearchField({
    query,
    go,
    searching = false,
    phone = false,
}: {
    query: OrdersQuery;
    go: (patch: Partial<OrdersQuery>) => void;
    /** The list is being read again. */
    searching?: boolean;
    /** `contact:read`: a phone number finds its orders. */
    phone?: boolean;
}) {
    return (
        <ListSearch
            placeholder="Search orders"
            describe={
                phone
                    ? "By name, phone, product or order number"
                    : "By name, product or order number"
            }
            defaultValue={query.q}
            searching={searching}
            onSearch={(q) => {
                if (q !== query.q) go({ q });
            }}
        />
    );
}
