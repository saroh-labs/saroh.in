import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { CsvImport } from "@/components/stores/csv-import";
import { requireCan } from "@/lib/access/require-can";
import { importCustomersHref } from "@/lib/customers/links";
import { describeImport } from "@/lib/imports/service";
import { requireSession } from "@/lib/session";
import { pickStorefront } from "@/lib/stores/pick";
import { listBusinessStores } from "@/lib/stores/service";

export const metadata = { title: "Import customers" };

/**
 * Sell → Customers → Import (#175). The mappable fields come from the API, so
 * they cannot drift from the DTOs that validate each row. The write role is
 * enforced by the import itself, and asked here before the form is drawn.
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
                    title="Which location are they customers of?"
                    description="A spreadsheet is brought in at one location."
                    stores={stores}
                    hrefFor={importCustomersHref}
                />
            </PageContainer>
        );
    }

    const descriptor = await describeImport(store.id, "customers");
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
            thing: "Import customers",
            back: {
                href: "/commerce/customers",
                label: "Back to Customers",
                needs: "contact:read",
            },
        });
        if (access.denied) return access.denied;
        notFound();
    }

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
