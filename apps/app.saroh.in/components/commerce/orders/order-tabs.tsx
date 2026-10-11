"use client";

import { ListFilter } from "@/components/shared/list-toolbar";
import type { OrderListPage } from "@/lib/orders/business-service";
import type { OrdersQuery, OrdersTab } from "@/lib/orders/list-query";
import { ORDERS_TABS } from "@/lib/orders/list-query";

/**
 * All orders · Open · Refunded, each with its count from the API (counted
 * under every filter but this one, so the three agree with the list
 * whichever is picked). They narrow the one list of orders by status, so
 * they are one of the toolbar's dropdowns, not tabs and not a row of chips.
 * A choice goes into the address as `?tab=`, as it always has, and the
 * server reads the first page of it.
 */
export function OrderStatusFilter({
    query,
    counts,
    go,
}: {
    query: OrdersQuery;
    counts: OrderListPage["counts"];
    go: (patch: Partial<OrdersQuery>) => void;
}) {
    return (
        <ListFilter<OrdersTab>
            label="Order status"
            value={query.tab}
            onValueChange={(tab) => go({ tab })}
            options={ORDERS_TABS.map((tab) => ({
                value: tab.id,
                label: tab.id === "all" ? "All orders" : tab.label,
                count: counts[tab.id],
            }))}
        />
    );
}
