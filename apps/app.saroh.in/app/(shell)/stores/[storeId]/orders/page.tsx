import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrdersTable } from "@/components/stores/orders-table";
import { listOrders } from "@/lib/orders/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

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
                <OrdersTable orders={orders} base={base} />
            )}
        </div>
    );
}
