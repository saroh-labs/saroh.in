"use client";

import { Badge } from "@saroh/ui/badge";
import { type ColumnDef, DataTable } from "@saroh/ui/data-table";
import { useRouter } from "next/navigation";

import type { OrderSummary } from "@/lib/orders/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    DELIVERED: "default",
    SHIPPED: "default",
    PROCESSING: "secondary",
    PENDING: "secondary",
    CANCELLED: "outline",
};

const columns: ColumnDef<OrderSummary>[] = [
    {
        accessorKey: "orderId",
        header: "Order",
        cell: ({ row }) => (
            <span className="font-medium">{row.original.orderId}</span>
        ),
    },
    {
        id: "customer",
        accessorFn: (row) => row.customer?.email ?? "",
        header: "Customer",
        cell: ({ row }) => (
            <span className="text-muted-foreground">
                {row.original.customer?.email ?? "—"}
            </span>
        ),
    },
    {
        id: "total",
        accessorFn: (row) => Number(row.total) || 0,
        header: "Total",
        cell: ({ row }) => (
            <span className="tabular-nums">
                {row.original.currency} {row.original.total}
            </span>
        ),
    },
    {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
            <Badge variant={STATUS_VARIANT[row.original.status] ?? "secondary"}>
                {row.original.status}
            </Badge>
        ),
    },
    {
        accessorKey: "paymentStatus",
        header: "Payment",
        cell: ({ row }) => (
            <Badge
                variant={
                    row.original.paymentStatus === "PAID"
                        ? "default"
                        : "outline"
                }
            >
                {row.original.paymentStatus}
            </Badge>
        ),
    },
];

/** Sortable, clickable orders table. Rows link through to the order detail. */
export function OrdersTable({
    orders,
    base,
}: {
    orders: OrderSummary[];
    base: string;
}) {
    const router = useRouter();
    return (
        <DataTable
            columns={columns}
            data={orders}
            onRowClick={(order) => router.push(`${base}/${order.id}`)}
        />
    );
}
