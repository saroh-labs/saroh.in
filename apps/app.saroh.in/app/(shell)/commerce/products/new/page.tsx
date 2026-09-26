import { ProductEditorV2 } from "@/components/commerce/product-editor-v2/editor-shell";
import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { loadEditorContext } from "@/lib/products/editor-data";
import { newProductHref } from "@/lib/products/links";
import { requireSession } from "@/lib/session";
import { pickStorefront } from "@/lib/stores/pick";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "New product" };

/**
 * Sell → Products → New product.
 *
 * A product is made at one storefront — that is where the API keeps it — so
 * with more than one, the first question is which. It is asked here as a
 * short list rather than a field on the form, because the answer decides the
 * currency and the categories the form offers.
 */
export default async function NewProductPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ storefront }, stores] = await Promise.all([
        searchParams,
        listBusinessStores(),
    ]);
    const store = pickStorefront(stores, storefront);

    if (store) {
        const context = await loadEditorContext(store);
        return <ProductEditorV2 {...context} product={null} />;
    }

    return (
        <PageContainer width="form">
            <StorefrontChooser
                section="Products"
                sectionHref="/commerce/products"
                crumb="New product"
                title="Where is it sold?"
                description="A product is made at one storefront, and priced in that storefront's currency."
                stores={stores}
                hrefFor={newProductHref}
            />
        </PageContainer>
    );
}
