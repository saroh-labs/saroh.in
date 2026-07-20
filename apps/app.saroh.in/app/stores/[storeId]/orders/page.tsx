import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listOrders } from "@/lib/orders/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
    DELIVERED: "default",
    SHIPPED: "default",
    PROCESSING: "secondary",
    PENDING: "secondary",
    CANCELLED: "outline",
};

export default async function OrdersPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const orders = await listOrders(storeId);
    const base = `/stores/${storeId}/orders`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Orders"
                description="Orders and fulfilment for this store."
                actions={
                    <Button variant="brand" asChild>
                        <Link href={`${base}/new`}>New order</Link>
                    </Button>
                }
            />

            {orders.length === 0 ? (
                <EmptyState
                    title="No orders yet"
                    description="Create an order for a customer to get started."
                    action={
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New order</Link>
                        </Button>
                    }
                />
            ) : (
                <ul className="divide-y rounded-lg border">
                    {orders.map((o) => (
                        <li key={o.id}>
                            <Link
                                href={`${base}/${o.id}`}
                                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {o.orderId}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {o.customer?.email ?? "—"}
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm tabular-nums">
                                        {o.currency} {o.total}
                                    </span>
                                    <Badge
                                        variant={
                                            STATUS_VARIANT[o.status] ??
                                            "secondary"
                                        }
                                    >
                                        {o.status}
                                    </Badge>
                                    <Badge
                                        variant={
                                            o.paymentStatus === "PAID"
                                                ? "default"
                                                : "outline"
                                        }
                                    >
                                        {o.paymentStatus}
                                    </Badge>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
