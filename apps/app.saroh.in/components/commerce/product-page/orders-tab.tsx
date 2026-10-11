import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { ShoppingBag } from "lucide-react";

import { OrderCardFrame } from "@/components/commerce/orders/order-row";
import { ViewerDate } from "@/components/shared/viewer-date";
import { customerHref } from "@/lib/customers/links";
import { orderHref } from "@/lib/orders/links";
import { productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import type { OverviewOrder } from "@/lib/products/overview-rules";
import { ORDER_STATUS_LABEL } from "@/lib/products/overview-rules";

import { FilterChips, listTable } from "@/components/shared/list-toolbar";
import { TextLink } from "@saroh/ui/text-link";
import {
    PanelFailed,
    PanelForbidden,
    StateLink,
    TabState,
} from "./panel-state";

/**
 * The orders this product is in: the open ones first (they hold its stock),
 * or the most recent. Read-only — each order opens in Orders. At the desk a
 * table; on a phone (under 760px) a card per order, the Orders list's own
 * frame, so nothing hides sideways.
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
                reassurance="Stock figures are still right. They come from the product."
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
                <FilterChips
                    label="Which orders"
                    value={filter}
                    chips={[
                        {
                            value: "open",
                            label: "Open",
                            count: data.openCount,
                            href: here,
                        },
                        {
                            value: "recent",
                            label: "Recent",
                            href: `${here}&orders=recent`,
                        },
                    ]}
                />
                <p className="flex-[1_1_200px] text-[12px] text-muted-foreground">
                    {filter === "open"
                        ? heldBy(data.recent, product.name)
                        : `The latest ${rows.length} of ${Math.max(data.recent.length, data.thisMonthCount)} orders this month.`}
                </p>
                <TextLink href="/commerce/orders" className="text-[12.5px]">
                    All orders for it in Orders →
                </TextLink>
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
                <>
                    {/* The one table look: the head band, rows ruled
                        edge to edge. */}
                    <div
                        data-list-table=""
                        className={cn(
                            listTable.frame,
                            "overflow-x-auto max-[759px]:hidden",
                        )}
                    >
                        <table className="w-full min-w-[600px] text-[13px]">
                            <caption className="sr-only">
                                Orders for {product.name}
                            </caption>
                            <thead>
                                <tr
                                    data-list-head=""
                                    className={cn(
                                        grid,
                                        listTable.head,
                                        "rounded-t-[10px] text-left",
                                    )}
                                >
                                    <th scope="col">Order</th>
                                    <th scope="col">Customer</th>
                                    <th scope="col">What</th>
                                    <th scope="col">Location</th>
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
                                            listTable.row,
                                            "items-center",
                                        )}
                                    >
                                        <td>
                                            <TextLink
                                                href={orderHref(storeId, o.id)}
                                                className="font-mono text-[12px]"
                                            >
                                                {o.orderNumber}
                                            </TextLink>
                                        </td>
                                        <td className="truncate">
                                            {o.customerId ? (
                                                <TextLink
                                                    href={customerHref(
                                                        storeId,
                                                        o.customerId,
                                                    )}
                                                >
                                                    {o.customer}
                                                </TextLink>
                                            ) : (
                                                // A walk-in (B13): no record to open.
                                                o.customer
                                            )}
                                        </td>
                                        <td className="text-foreground/75">
                                            {linesText(o, product.name)}
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
                                                    o.open
                                                        ? "warning"
                                                        : "neutral"
                                                }
                                                size="sm"
                                            >
                                                {ORDER_STATUS_LABEL[o.status] ??
                                                    o.status}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ul
                        aria-label={`Orders for ${product.name}`}
                        className="flex flex-col gap-2 min-[760px]:hidden"
                    >
                        {rows.map((o) => (
                            <OrderCardFrame
                                key={o.id}
                                href={orderHref(storeId, o.id)}
                                title={
                                    <>
                                        {o.customer}
                                        <span className="sr-only">
                                            , order {o.orderNumber}
                                        </span>
                                    </>
                                }
                                aside={
                                    <Badge
                                        variant={o.open ? "warning" : "neutral"}
                                        size="sm"
                                        className="flex-none"
                                    >
                                        {ORDER_STATUS_LABEL[o.status] ??
                                            o.status}
                                    </Badge>
                                }
                                meta={
                                    <>
                                        <span className="font-mono">
                                            {o.orderNumber}
                                        </span>
                                        <span aria-hidden>·</span>
                                        <span className="text-foreground/75">
                                            {linesText(o, product.name)}
                                        </span>
                                    </>
                                }
                                footer={
                                    <div className="text-[12px] text-muted-foreground">
                                        <ViewerDate
                                            iso={o.createdAt}
                                            variant="dayMonth"
                                        />
                                        {` · ${overview.storefront.name}`}
                                    </div>
                                }
                            />
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}

/** "800g × 2, 400g × 1": what the order holds of this product. */
function linesText(order: OverviewOrder, productName: string): string {
    return order.lines
        .map((l) => `${l.title || productName} × ${l.quantity}`)
        .join(", ");
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
