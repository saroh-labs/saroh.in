import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
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
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">Orders</h2>
                    <p className="text-sm text-muted-foreground">
                        Orders and fulfilment for this store.
                    </p>
                </div>
                <Button asChild>
                    <Link href={`${base}/new`}>New order</Link>
                </Button>
            </div>

            {orders.length === 0 ? (
                <div className="rounded-lg border p-8 text-center">
                    <h3 className="font-medium">No orders yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Create an order for a customer to get started.
                    </p>
                </div>
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
