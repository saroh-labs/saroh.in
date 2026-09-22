import { notFound } from "next/navigation";

import { ProductEditor } from "@/components/commerce/product-editor";
import { PageContainer } from "@/components/shared/page-container";
import { loadEditorContext } from "@/lib/products/editor-data";
import type { ProductDetail } from "@/lib/products/service";
import { getProduct } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import type { Store } from "@/lib/stores/service";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Product" };

/**
 * Sell → Products → one product.
 *
 * The storefront comes from the address (`?storefront=`), which every link in
 * the app sets. A link without it — typed, or shared from an older screen — is
 * still honoured: each storefront is asked for the product until one has it.
 */
export default async function ProductPage({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ productId }, { storefront }, stores] = await Promise.all([
        params,
        searchParams,
        listBusinessStores(),
    ]);

    const found = await findProduct(stores, productId, storefront);
    if (!found) notFound();

    const context = await loadEditorContext(found.store);
    return (
        <PageContainer width="full">
            <ProductEditor
                // A new product or a different one starts from its own saved
                // values rather than the last one's edits.
                key={found.product.id}
                {...context}
                product={found.product}
            />
        </PageContainer>
    );
}

async function findProduct(
    stores: Store[],
    productId: string,
    storefront: string | undefined,
): Promise<{ store: Store; product: ProductDetail } | null> {
    const named = stores.find((s) => s.id === storefront);
    if (named) {
        const product = await getProduct(named.id, productId).catch(() => null);
        if (product) return { store: named, product };
    }
    const others = stores.filter((s) => s !== named);
    const hits = await Promise.all(
        others.map((s) => getProduct(s.id, productId).catch(() => null)),
    );
    for (let i = 0; i < hits.length; i++) {
        const product = hits[i];
        if (product) return { store: others[i], product };
    }
    return null;
}
