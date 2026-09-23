import { notFound } from "next/navigation";

import { ProductEditor } from "@/components/commerce/product-editor";
import { PageContainer } from "@/components/shared/page-container";
import { loadEditorContext } from "@/lib/products/editor-data";
import { findProductStore } from "@/lib/products/overview";
import { getProduct } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Edit product" };

/**
 * Sell → Products → one product → Edit. The full editor, one section per
 * part of the product; the product page links here, to the section it names.
 */
export default async function EditProductPage({
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

    const store = await findProductStore(stores, productId, storefront);
    const product = store ? await getProduct(store.id, productId) : null;
    if (!store || !product) notFound();

    const context = await loadEditorContext(store);
    return (
        <PageContainer width="full">
            <ProductEditor
                // A new product or a different one starts from its own saved
                // values rather than the last one's edits.
                key={product.id}
                {...context}
                product={product}
            />
        </PageContainer>
    );
}
