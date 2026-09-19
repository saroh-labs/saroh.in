import { PageContainer } from "@/components/shared/page-container";
import { CatalogueScreen } from "@/components/stores/catalogue-screen";
import type { ProductListItem } from "@/lib/products/service";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";
import { viewParam } from "@/lib/views/search-params";

/**
 * Sell → Products: the business's catalogue, across every storefront.
 *
 * Products are stored per storefront, so this reads each storefront's list in
 * parallel and the screen merges them by SKU. A storefront whose list cannot
 * be read is left out rather than failing the page — the rest of the
 * catalogue is still true.
 */
export const metadata = { title: "Products" };

export default async function CataloguePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [stores, query] = await Promise.all([listStores(), searchParams]);
    const lists = await Promise.all(
        stores.map((s) =>
            listProducts(s.id).catch((): ProductListItem[] => []),
        ),
    );
    const productsByStore = Object.fromEntries(
        stores.map((s, i) => [s.id, lists[i] ?? []]),
    );

    return (
        <PageContainer>
            <CatalogueScreen
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                productsByStore={productsByStore}
                initialView={viewParam(query)}
            />
        </PageContainer>
    );
}
