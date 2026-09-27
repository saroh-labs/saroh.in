import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import type { OrderListPage } from "@/lib/orders/business-service";
import type { OrdersQuery } from "@/lib/orders/list-query";
import { ORDERS_TABS, ordersHref } from "@/lib/orders/list-query";

/**
 * All · Open · Refunded, each with its count from the API (counted under
 * every filter but the tab, so the three agree with the list whichever is
 * picked). A tab is a link: it changes the address, and the server reads the
 * first page of it. Open's count is tinted while there is work in it.
 *
 * A tab filters the page; it is not a page. So it says `aria-current="true"`,
 * and `"page"` stays the rail's.
 */
export function OrderTabs({
    query,
    counts,
}: {
    query: OrdersQuery;
    counts: OrderListPage["counts"];
}) {
    return (
        <nav
            aria-label="Orders"
            className="flex flex-wrap gap-0.5 border-b border-border"
        >
            {ORDERS_TABS.map((tab) => {
                const on = tab.id === query.tab;
                const n = counts[tab.id];
                const urgent = tab.id === "open" && n > 0;
                return (
                    <Link
                        key={tab.id}
                        href={ordersHref(query, { tab: tab.id })}
                        scroll={false}
                        aria-current={on ? "true" : undefined}
                        className={cn(
                            "flex items-center gap-[7px] rounded-t-md px-[13px] py-[9px] text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11",
                            on
                                ? "font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--foreground))]"
                                : "font-medium text-muted-foreground hover:text-foreground",
                        )}
                    >
                        <span>{tab.label}</span>
                        <span
                            className={cn(
                                "rounded-full px-[7px] py-0.5 text-[11px] font-semibold tabular-nums",
                                urgent
                                    ? "bg-brand-subtle text-brand-subtle-foreground"
                                    : on
                                      ? "bg-muted text-foreground"
                                      : "bg-muted text-muted-foreground",
                            )}
                        >
                            {n}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
