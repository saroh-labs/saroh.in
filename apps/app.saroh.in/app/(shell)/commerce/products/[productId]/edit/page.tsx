import { notFound } from "next/navigation";

import { ProductEditorV2 } from "@/components/commerce/product-editor-v2/editor-shell";
import { NoProductAccess } from "@/components/commerce/product-editor-v2/no-access";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { loadEditorContext } from "@/lib/products/editor-data";
import { getProductAt } from "@/lib/products/overview";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Edit product" };

/**
 * Sell → Products → one product → Edit. The full editor (#468, #469): every
 * part of the product, each saved on its own. The product page links here,
 * to the section it names. The product is the business's (#531); the
 * storefront in the address is whose shelf the Stock section counts.
 */
export default async function EditProductPage({
    params,
    searchParams,
}: {
    params: Promise<{ productId: string }>;
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ productId }, { storefront }, stores, organization] =
        await Promise.all([
            params,
            searchParams,
            listBusinessStores(),
            resolveActiveOrganization(),
        ]);

    // A role that can't see products is told so and who can change it, not
    // shown a "not found" that reads like a broken link (#525).
    if (organization?.actions && !organization.actions.includes("store:read")) {
        return <NoProductAccess organization={organization} />;
    }

    const product = await getProductAt(storefront, productId);
    const store = stores.find((s) => s.id === product?.storeId);
    if (!product || !store) notFound();

    const context = await loadEditorContext(store, product, stores);
    return (
        <ProductEditorV2
            // A different product starts from its own saved values rather
            // than the last one's edits.
            key={product.id}
            {...context}
            product={product}
        />
    );
}
