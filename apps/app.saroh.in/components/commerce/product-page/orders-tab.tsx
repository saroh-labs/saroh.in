import { Badge } from "@saroh/ui/badge";
import { Card } from "@saroh/ui/card";
import { cn } from "@saroh/ui/lib/utils";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { customerHref } from "@/lib/customers/links";
import { orderHref } from "@/lib/orders/links";
import { productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import type { OverviewOrder } from "@/lib/products/overview-rules";
import { ORDER_STATUS_LABEL } from "@/lib/products/overview-rules";

import {
    PanelFailed,
    PanelForbidden,
    StateLink,
    TabState,
} from "./panel-state";

/**
 * The orders this product is in: the open ones first (they hold its stock),
 * or the most recent. Read-only — each order opens in Orders.
 */
export function ProductOrdersTab({
    overview,
    storeId,
    filter,
}: {
    overview: ProductOverview;
    storeId: string;
    filter: "open" | "recent";
}) {
    const { product, orders } = overview;
    const here = productHref(storeId, product.id, "orders");
    if (orders.status === "failed") {
        return (
            <PanelFailed
                what="orders"
                retryHref={here}
                note="The rest of the product loaded; only the order list did not. Stock figures are still right — they come from the product."
                elsewhere={{ href: "/commerce/orders", label: "Open Orders" }}
            />
        );
    }
    if (orders.status === "forbidden") return <PanelForbidden what="orders" />;

    const { data } = orders;
    const rows =
        filter === "open" ? data.recent.filter((o) => o.open) : data.recent;

    if (data.recent.length === 0) {
        return (
            <TabState
                icon={ShoppingBag}
                title="No orders yet"
                description={
                    product.status === "PUBLISHED"
                        ? "Orders for it show here, newest first, as they come in."
                        : "It isn't on the shop, so customers can't order it. Orders show here once it is published."
                }
            />
        );
    }

    const grid =
        "grid grid-cols-[80px_minmax(0,1fr)_minmax(0,1.3fr)_90px_100px_90px] gap-2.5";

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <div
                    role="group"
                    aria-label="Which orders"
                    className="flex gap-1.5"
                >
                    {(["open", "recent"] as const).map((f) => (
                        <Link
                            key={f}
                            href={f === "open" ? here : `${here}&orders=recent`}
                            scroll={false}
                            aria-current={f === filter ? "true" : undefined}
                            className={cn(
                                "inline-flex h-[30px] items-center rounded-full border px-3 text-[12.5px] coarse:h-11",
                                f === filter
                                    ? "border-foreground bg-foreground font-semibold text-background"
                                    : "border-border bg-card font-medium text-foreground/75 hover:bg-muted",
                            )}
                        >
                            {f === "open"
                                ? `Open · ${data.openCount}`
                                : "Recent"}
                        </Link>
                    ))}
                </div>
                <p className="flex-[1_1_200px] text-[12px] text-muted-foreground">
                    {filter === "open"
                        ? heldBy(data.recent, product.name)
                        : `The latest ${rows.length} of ${Math.max(data.recent.length, data.thisMonthCount)} orders this month.`}
                </p>
                <Link
                    href="/commerce/orders"
                    className="text-[12.5px] text-brand hover:text-foreground"
                >
                    All orders for it in Orders →
                </Link>
            </div>

            {rows.length === 0 ? (
                <TabState
                    icon={ShoppingBag}
                    title="Nothing open"
                    description="No open order holds this product's stock right now."
                >
                    <StateLink href={`${here}&orders=recent`}>
                        See recent orders
                    </StateLink>
                </TabState>
            ) : (
                <Card className="overflow-x-auto rounded-[12px] px-[18px] pb-1.5 pt-0">
                    <table className="w-full min-w-[600px] text-[13px]">
                        <caption className="sr-only">
                            Orders for {product.name}
                        </caption>
                        <thead>
                            <tr
                                className={cn(
                                    grid,
                                    "border-b border-border pb-[7px] pt-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80",
                                )}
                            >
                                <th scope="col">Order</th>
                                <th scope="col">Customer</th>
                                <th scope="col">What</th>
                                <th scope="col">Storefront</th>
                                <th scope="col">When</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => (
                                <tr
                                    key={o.id}
                                    className={cn(
                                        grid,
                                        "items-center border-b border-border py-2.5",
                                    )}
                                >
                                    <td>
                                        <Link
                                            href={orderHref(storeId, o.id)}
                                            className="font-mono text-[12px] text-brand hover:text-foreground"
                                        >
                                            {o.orderNumber}
                                        </Link>
                                    </td>
                                    <td className="truncate">
                                        <Link
                                            href={customerHref(
                                                storeId,
                                                o.customerId,
                                            )}
                                            className="text-brand hover:text-foreground"
                                        >
                                            {o.customer}
                                        </Link>
                                    </td>
                                    <td className="text-foreground/75">
                                        {o.lines
                                            .map(
                                                (l) =>
                                                    `${l.title || product.name} × ${l.quantity}`,
                                            )
                                            .join(", ")}
                                    </td>
                                    <td className="truncate text-muted-foreground">
                                        {overview.storefront.name}
                                    </td>
                                    <td className="text-muted-foreground">
                                        <ViewerDate
                                            iso={o.createdAt}
                                            variant="dayMonth"
                                        />
                                    </td>
                                    <td>
                                        <Badge
                                            variant={
                                                o.open ? "warning" : "neutral"
                                            }
                                            className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-[1.3]"
                                        >
                                            {ORDER_STATUS_LABEL[o.status] ??
                                                o.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}
        </div>
    );
}

/** "These hold the 5 promised: 30 ml 4, 15 ml 1." — what open orders hold. */
function heldBy(orders: OverviewOrder[], productName: string): string {
    const held: Record<string, number> = {};
    for (const o of orders) {
        if (!o.open) continue;
        for (const l of o.lines) {
            const key = l.title || productName;
            held[key] = (held[key] ?? 0) + l.quantity;
        }
    }
    const entries = Object.entries(held);
    if (entries.length === 0) return "No open orders.";
    const total = entries.reduce((sum, [, n]) => sum + n, 0);
    const parts = entries.map(([title, n]) => `${title} ${n}`).join(", ");
    return `These hold the ${total} promised: ${parts}.`;
}
