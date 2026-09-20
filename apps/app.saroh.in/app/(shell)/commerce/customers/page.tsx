import { PageContainer } from "@/components/shared/page-container";
import { CustomersScreen } from "@/components/stores/customers-screen";
import type { CustomerListItem } from "@/lib/customers/service";
import { listCustomers } from "@/lib/customers/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

/**
 * Sell → Customers: everyone who has bought from this business.
 *
 * Customers are stored per storefront, so this reads each storefront's list in
 * parallel and the screen merges them by email — a person who buys at two
 * storefronts is one person. A storefront whose list cannot be read is left
 * out rather than failing the page; the rest of the list is still true.
 */
export const metadata = { title: "Customers" };

export default async function CustomersPage() {
    await requireSession();
    const stores = await listStores();
    const lists = await Promise.all(
        stores.map((s) =>
            listCustomers(s.id).catch((): CustomerListItem[] => []),
        ),
    );
    const customersByStore = Object.fromEntries(
        stores.map((s, i) => [s.id, lists[i] ?? []]),
    );

    return (
        <PageContainer width="full">
            <CustomersScreen
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                customersByStore={customersByStore}
            />
        </PageContainer>
    );
}
