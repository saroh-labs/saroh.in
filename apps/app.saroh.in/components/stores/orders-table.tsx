"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";

import { DataView } from "@/components/shared/data-view/data-view";
import type {
    DataColumn,
    DataFilter,
} from "@/components/shared/data-view/types";
import { formatWaiting } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import type { OrderSummary } from "@/lib/orders/service";

/**
 * Orders as the fulfilment queue they are.
 *
 * Two changes beyond the density toggle, both about meaning rather than looks:
 *
 * 1. **Age.** A row now says "6 days waiting" instead of nothing at all. Age is
 *    the fact that decides which unfulfilled order to touch first, and it was
 *    exactly what Home's "Fulfil 5 open orders" could not tell anyone.
 * 2. **Status colour maps to tokens, not badge variants.** `variant="default"`
 *    resolves to `--primary`, which in the Panel and Instrument skins is the
 *    LUMINOUS ACTION colour — so UNPAID and PENDING were drawn in the same
 *    register as DELIVERED. Money owed is amber; money received is brand.
 */

/** Statuses that mean someone outside the business is still waiting. */
const OPEN_STATUSES = ["PENDING", "PROCESSING"];

const Missing = () => <span className="text-muted-foreground/60">—</span>;

const STATUS_CLASS: Record<string, string> = {
    DELIVERED: "border border-brand/30 bg-brand/15 text-brand",
    SHIPPED: "border border-brand/30 bg-brand/15 text-brand",
    PROCESSING:
        "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
    PENDING:
        "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
    CANCELLED: "border border-border bg-transparent text-muted-foreground",
};

const FILTERS: DataFilter<OrderSummary>[] = [
    { id: "all", label: "All" },
    {
        id: "open",
        label: "Needs fulfilling",
        predicate: (o) => OPEN_STATUSES.includes(o.status),
    },
    {
        id: "unpaid",
        label: "Unpaid",
        predicate: (o) => o.paymentStatus !== "PAID",
    },
];

function customerLabel(order: OrderSummary): string | null {
    const c = order.customer;
    if (!c) return null;
    const full = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    return full || c.email;
}

export function OrdersTable({
    orders,
    base,
    initialView,
}: {
    orders: OrderSummary[];
    base: string;
    initialView?: string;
}) {
    const now = new Date();

    const columns: DataColumn<OrderSummary>[] = [
        {
            id: "orderId",
            header: "Order",
            priority: "primary",
            sortValue: (o) => o.orderId,
            cell: (o) => (
                <Link
                    href={`${base}/${o.id}`}
                    className="font-medium underline-offset-4 hover:text-brand hover:underline"
                >
                    {o.orderId}
                </Link>
            ),
        },
        {
            id: "customer",
            header: "Customer",
            priority: "secondary",
            sortValue: (o) => (customerLabel(o) ?? "").toLowerCase(),
            cell: (o) => (
                <span className="text-muted-foreground">
                    {customerLabel(o) ?? <Missing />}
                </span>
            ),
        },
        {
            id: "total",
            header: "Total",
            priority: "secondary",
            numeric: true,
            sortValue: (o) => Number(o.total) || 0,
            cell: (o) => formatMoneyMajor(o.total, o.currency) ?? <Missing />,
        },
        {
            id: "status",
            header: "Status",
            priority: "secondary",
            sortValue: (o) => o.status,
            cell: (o) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        STATUS_CLASS[o.status] ??
                            "border border-border bg-transparent text-muted-foreground",
                    )}
                >
                    {o.status}
                </Badge>
            ),
        },
        {
            id: "payment",
            header: "Payment",
            priority: "secondary",
            sortValue: (o) => o.paymentStatus,
            cell: (o) => (
                <Badge
                    className={cn(
                        "text-[0.625rem] font-medium uppercase tracking-wider",
                        o.paymentStatus === "PAID"
                            ? "border border-brand/30 bg-brand/15 text-brand"
                            : o.paymentStatus === "REFUNDED"
                              ? "border border-border bg-transparent text-muted-foreground"
                              : "border border-warning/40 bg-warning-subtle text-warning-subtle-foreground",
                    )}
                >
                    {o.paymentStatus}
                </Badge>
            ),
        },
        {
            id: "age",
            header: "Placed",
            priority: "detail",
            numeric: true,
            sortValue: (o) => new Date(o.createdAt).getTime(),
            cell: (o) => (
                <span
                    className={cn(
                        "whitespace-nowrap",
                        OPEN_STATUSES.includes(o.status)
                            ? "text-foreground"
                            : "text-muted-foreground",
                    )}
                >
                    {formatWaiting(o.createdAt, now) ?? <Missing />}
                </span>
            ),
        },
    ];

    return (
        <DataView
            viewId="orders"
            rows={orders}
            columns={columns}
            rowKey={(o) => o.id}
            rowHref={(o) => `${base}/${o.id}`}
            modes={["table", "list"]}
            defaultMode="table"
            filters={FILTERS}
            initialFilterId={initialView}
            searchableColumnIds={["orderId", "customer", "status"]}
            empty="Create an order for a customer to get started."
        />
    );
}
