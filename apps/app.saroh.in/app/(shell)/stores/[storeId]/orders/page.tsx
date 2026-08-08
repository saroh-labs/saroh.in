import { Button } from "@saroh/ui/button";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrdersTable } from "@/components/stores/orders-table";
import { listOrders } from "@/lib/orders/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import { viewParam } from "@/lib/views/search-params";

/**
 * Orders for one store. The page fetches; `OrdersTable` decides how to render —
 * including the empty state, which is why the local `EmptyState` branch is gone.
 * Two components each owning "there is nothing here" is how they drift.
 */
export default async function OrdersPage({
    params,
    searchParams,
}: {
    params: Promise<{ storeId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [orders, query] = await Promise.all([
        listOrders(storeId),
        searchParams,
    ]);
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

            <OrdersTable
                orders={orders}
                base={base}
                initialView={viewParam(query)}
            />
        </div>
    );
}
