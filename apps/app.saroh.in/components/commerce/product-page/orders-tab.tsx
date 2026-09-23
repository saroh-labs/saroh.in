import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { ViewerDate } from "@/components/shared/viewer-date";
import { orderHref } from "@/lib/orders/links";
import { productHref } from "@/lib/products/links";
import type { ProductOverview } from "@/lib/products/overview";
import { ORDER_STATUS_LABEL } from "@/lib/products/overview-rules";

import { PanelFailed, PanelForbidden } from "./panel-state";

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
            />
        );
    }
    if (orders.status === "forbidden") return <PanelForbidden what="orders" />;

    const { data } = orders;
    const rows =
        filter === "open" ? data.recent.filter((o) => o.open) : data.recent;

    if (data.recent.length === 0) {
        return (
            <EmptyState
                title="No orders yet"
                description={
                    product.status === "PUBLISHED"
                        ? "Orders for it show here, newest first, as they come in."
                        : "It isn't on the shop, so customers can't order it. Orders show here once it is published."
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
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
                                "rounded-full border px-3 py-1 text-[12.5px] font-medium coarse:min-h-11 coarse:py-2.5",
                                f === filter
                                    ? "border-foreground bg-foreground text-background"
                                    : "border-border text-foreground hover:bg-muted",
                            )}
                        >
                            {f === "open"
                                ? `Open · ${data.openCount}`
                                : "Recent"}
                        </Link>
                    ))}
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                    {filter === "open"
                        ? "These hold the stock promised to orders."
                        : `The latest ${rows.length} of ${data.thisMonthCount} this month and before.`}
                </p>
                <Link
                    href="/commerce/orders"
                    className="ml-auto text-[12.5px] font-medium underline-offset-4 hover:underline"
                >
                    All orders in Orders →
                </Link>
            </div>

            {rows.length === 0 ? (
                <EmptyState
                    outline="solid"
                    title="Nothing open"
                    description="No open order holds this product's stock right now."
                    action={
                        <Button asChild variant="outline">
                            <Link href={`${here}&orders=recent`} scroll={false}>
                                See recent orders
                            </Link>
                        </Button>
                    }
                />
            ) : (
                <Card className="overflow-x-auto bg-card p-0">
                    <table className="w-full min-w-[600px] text-[13px]">
                        <caption className="sr-only">
                            Orders for {product.name}
                        </caption>
                        <thead>
                            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                                <th scope="col" className="px-4 py-2.5">
                                    Order
                                </th>
                                <th scope="col" className="px-3 py-2.5">
                                    Customer
                                </th>
                                <th scope="col" className="px-3 py-2.5">
                                    What
                                </th>
                                <th scope="col" className="px-3 py-2.5">
                                    When
                                </th>
                                <th scope="col" className="px-4 py-2.5">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => (
                                <tr
                                    key={o.id}
                                    className="border-b border-border last:border-0"
                                >
                                    <td className="px-4 py-2.5">
                                        <Link
                                            href={orderHref(storeId, o.id)}
                                            className="font-mono text-[12px] underline-offset-4 hover:underline"
                                        >
                                            {o.orderNumber}
                                        </Link>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {o.customer}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {o.lines
                                            .map(
                                                (l) =>
                                                    `${l.title || "—"} × ${l.quantity}`,
                                            )
                                            .join(", ")}
                                    </td>
                                    <td className="px-3 py-2.5 text-muted-foreground">
                                        <ViewerDate
                                            iso={o.createdAt}
                                            variant="heading"
                                        />
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <Badge
                                            variant={
                                                o.open ? "draft" : "neutral"
                                            }
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
