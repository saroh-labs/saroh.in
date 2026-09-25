import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { CsvImport } from "@/components/stores/csv-import";
import { importCustomersHref } from "@/lib/customers/links";
import { describeImport } from "@/lib/imports/service";
import { requireSession } from "@/lib/session";
import { pickStorefront } from "@/lib/stores/pick";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Import customers" };

/**
 * Sell → Customers → Import (#175). The mappable fields come from the API, so
 * they cannot drift from the DTOs that validate each row; the write role is
 * enforced by the import itself.
 */
export default async function ImportCustomersPage({
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
                    section="Customers"
                    sectionHref="/commerce/customers"
                    crumb="Import"
                    title="Which storefront are they customers of?"
                    description="A spreadsheet is brought in at one storefront."
                    stores={stores}
                    hrefFor={importCustomersHref}
                />
            </PageContainer>
        );
    }

    const descriptor = await describeImport(store.id, "customers");
    if (!descriptor) notFound();

    return (
        <PageContainer width="default">
            <PageHeader
                breadcrumb={[
                    "Sell",
                    <Link
                        key="customers"
                        href="/commerce/customers"
                        className="hover:text-foreground"
                    >
                        Customers
                    </Link>,
                    "Import",
                ]}
                title="Import customers"
                description={`From a spreadsheet, into ${store.name}.`}
            />
            <CsvImport
                storeId={store.id}
                descriptor={descriptor}
                backHref="/commerce/customers"
            />
        </PageContainer>
    );
}
