import { PageContainer } from "@/components/shared/page-container";
import { OrdersScreen } from "@/components/stores/orders-screen";
import { listBusinessOrders } from "@/lib/orders/business-service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

/**
 * Sell → Orders: every order in the business.
 *
 * ONE read, unlike Customers next door, which fans out per storefront because
 * customers are stored per storefront. Orders carry their organization, so the
 * API can answer across storefronts in a single query — and that is also what
 * makes the count the rail badges and this list the same fact rather than two
 * numbers that have to be kept in step.
 *
 * `?view=` is read here rather than in the screen: `useSearchParams` would
 * force the whole screen into a Suspense boundary for a value needed once, on
 * first render.
 */
export const metadata = { title: "Orders" };

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [orders, stores, { view }] = await Promise.all([
        listBusinessOrders(),
        listStores(),
        searchParams,
    ]);

    return (
        <PageContainer width="full">
            <OrdersScreen
                orders={orders}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                initialFilterId={typeof view === "string" ? view : undefined}
            />
        </PageContainer>
    );
}
