import { PageContainer } from "@/components/shared/page-container";
import { CustomersScreen } from "@/components/stores/customers-screen";
import type { CustomerListItem } from "@/lib/customers/service";
import { listCustomers } from "@/lib/customers/service";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

/**
 * Sell → Customers: everyone who has bought from this business.
 *
 * Customers are stored per storefront, so this reads each storefront's list in
 * parallel and the screen merges them by email — a person who buys at two
 * storefronts is one person. A storefront whose list cannot be read is left
 * out rather than failing the page — and the screen is told WHICH, so it says
 * so instead of presenting a subset as everyone.
 */
export const metadata = { title: "Customers" };

export default async function CustomersPage() {
    await requireSession();
    const stores = await listBusinessStores();
    const lists = await Promise.all(
        stores.map((s) =>
            listCustomers(s.id).catch((): CustomerListItem[] | null => null),
        ),
    );
    const customersByStore = Object.fromEntries(
        stores.map((s, i) => [s.id, lists[i] ?? []]),
    );
    const missing = stores
        .filter((_, i) => lists[i] === null)
        .map((s) => ({ id: s.id, name: s.name }));

    return (
        <PageContainer width="full">
            <CustomersScreen
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                customersByStore={customersByStore}
                missing={missing}
            />
        </PageContainer>
    );
}
