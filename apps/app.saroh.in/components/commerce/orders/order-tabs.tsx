"use client";

import { FilterChips } from "@/components/shared/list-toolbar";
import type { OrderListPage } from "@/lib/orders/business-service";
import type { OrdersQuery, OrdersTab } from "@/lib/orders/list-query";
import { ORDERS_TABS } from "@/lib/orders/list-query";

/**
 * All · Open · Refunded, each with its count from the API (counted under
 * every filter but this one, so the three agree with the list whichever is
 * picked). They narrow the one list of orders by status, so they are the
 * list's chip row, not tabs: a choice goes into the address as `?tab=`, as
 * it always has, and the server reads the first page of it. `children` are
 * the on/off filters that follow them in the row.
 */
export function OrderStatusChips({
    query,
    counts,
    go,
    children,
}: {
    query: OrdersQuery;
    counts: OrderListPage["counts"];
    go: (patch: Partial<OrdersQuery>) => void;
    children?: React.ReactNode;
}) {
    return (
        <FilterChips<OrdersTab>
            label="Order status"
            value={query.tab}
            onValueChange={(tab) => go({ tab })}
            chips={ORDERS_TABS.map((tab) => ({
                value: tab.id,
                label: tab.label,
                count: counts[tab.id],
            }))}
        >
            {children}
        </FilterChips>
    );
}
