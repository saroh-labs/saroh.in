import { PageHeader } from "@saroh/ui/page-header";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { CategoriesManager } from "@/components/stores/categories-manager";
import { listCategories } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { productCategoriesHref } from "@/lib/stores/links";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Categories" };

/** Sell → Products → Categories, for one storefront's catalogue. */
export default async function ProductCategoriesPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ storefront }, stores] = await Promise.all([
        searchParams,
        listBusinessStores(),
    ]);
    const store =
        stores.find((s) => s.id === storefront) ??
        (stores.length === 1 ? stores[0] : undefined);

    if (!store) {
        return (
            <PageContainer width="form">
                <StorefrontChooser
                    section="Products"
                    sectionHref="/commerce/products"
                    crumb="Categories"
                    title="Whose categories?"
                    description="Each storefront keeps its own categories for its own catalogue."
                    stores={stores}
                    hrefFor={productCategoriesHref}
                />
            </PageContainer>
        );
    }

    const categories = await listCategories(store.id);
    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Products", href: "/commerce/products" },
                    "Categories",
                )}
                title="Categories"
                description={`How ${store.name}'s catalogue is grouped. A category can sit inside another.`}
            />
            <CategoriesManager storeId={store.id} categories={categories} />
        </PageContainer>
    );
}
