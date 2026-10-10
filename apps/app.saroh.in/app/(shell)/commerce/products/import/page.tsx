import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { sellCrumbs } from "@/components/commerce/sell-crumbs";
import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { CsvImport } from "@/components/stores/csv-import";
import { requireCan } from "@/lib/access/require-can";
import { planMeter } from "@/lib/billing/meter";
import { describeImport } from "@/lib/imports/service";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { importProductsHref } from "@/lib/stores/links";
import { pickStorefront } from "@/lib/stores/pick";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Import products" };

/**
 * Sell → Products → Import. The mappable fields come from the API, so they
 * cannot drift from the DTOs that validate each row.
 */
export default async function ImportProductsPage({
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

    if (!store) {
        return (
            <PageContainer width="form">
                <StorefrontChooser
                    section="Products"
                    sectionHref="/commerce/products"
                    crumb="Import"
                    title="Which location do they go into?"
                    description="A spreadsheet of products is brought into one location's catalogue."
                    stores={stores}
                    hrefFor={importProductsHref}
                />
            </PageContainer>
        );
    }

    const [descriptor, access] = await Promise.all([
        describeImport(store.id, "products"),
        billingAccessOrNull(),
    ]);
    if (!descriptor) {
        /*
         * The API describes an import only to someone who may write to this
         * location: `store:write`, or a role at the location itself, which
         * only the API knows. So the check can't come first, as it does on
         * the other create pages. A refusal for someone without
         * `store:write` is their role's, and is said as one, not as a
         * missing page.
         */
        const access = await requireCan("store:write", {
            thing: "Import products",
            back: {
                href: "/commerce/products",
                label: "Back to Products",
                needs: "store:read",
            },
        });
        if (access.denied) return access.denied;
        notFound();
    }

    return (
        <PageContainer width="default">
            <PageHeader
                breadcrumb={sellCrumbs(
                    { label: "Products", href: "/commerce/products" },
                    "Import",
                )}
                title="Import products"
                description={`From a spreadsheet, into ${store.name}.`}
            />
            <CsvImport
                storeId={store.id}
                descriptor={descriptor}
                backHref="/commerce/products"
                meter={planMeter(access, "products")}
            />
        </PageContainer>
    );
}
