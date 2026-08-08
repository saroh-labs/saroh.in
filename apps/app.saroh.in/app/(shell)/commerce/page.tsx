import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { StoreCard } from "@/components/stores/store-card";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

/**
 * Commerce operations hub (#122, Task 7). The unified entry for selling —
 * Stores are sales channels/configuration, not the primary shell. Lists the
 * Organization's stores as channels; catalog and orders live inside each.
 * (An Organization-wide operational rollup — orders requiring action, payment
 * exceptions, low stock across channels — needs order/product API rollups and
 * is a follow-up; today this consolidates the channel entry points.)
 */
export const metadata = { title: "Commerce" };

export default async function CommercePage() {
    await requireSession();
    const stores = await listStores();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Commerce"
                description="Your sales channels — catalog, orders, and fulfilment live inside each store."
                actions={
                    stores.length > 0 ? (
                        <Button asChild variant="brand">
                            <Link href="/stores/new">New store</Link>
                        </Button>
                    ) : undefined
                }
            />

            {stores.length === 0 ? (
                <EmptyState
                    title="No sales channels yet"
                    description="Create a store to start selling — a catalog, orders, and fulfilment all live inside it."
                    action={
                        <Button asChild variant="brand">
                            <Link href="/stores/new">Create a store</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {stores.map((store) => (
                        <StoreCard key={store.id} store={store} />
                    ))}
                </div>
            )}
        </main>
    );
}
