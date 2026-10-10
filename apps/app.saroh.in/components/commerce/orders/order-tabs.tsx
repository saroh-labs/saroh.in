import { TabStrip } from "@saroh/ui/tabs";

import type { OrderListPage } from "@/lib/orders/business-service";
import type { OrdersQuery } from "@/lib/orders/list-query";
import { ORDERS_TABS, ordersHref } from "@/lib/orders/list-query";

/**
 * All · Open · Refunded, each with its count from the API (counted under
 * every filter but the tab, so the three agree with the list whichever is
 * picked). A tab is a link: it changes the address, and the server reads the
 * first page of it. Open's count is in Ink while there is work in it.
 */
export function OrderTabs({
    query,
    counts,
}: {
    query: OrdersQuery;
    counts: OrderListPage["counts"];
}) {
    return (
        <TabStrip
            label="Orders"
            value={query.tab}
            tabs={ORDERS_TABS.map((tab) => ({
                value: tab.id,
                label: tab.label,
                href: ordersHref(query, { tab: tab.id }),
                count: counts[tab.id],
                countTone:
                    tab.id === "open" && counts[tab.id] > 0
                        ? "strong"
                        : "neutral",
            }))}
        />
    );
}
