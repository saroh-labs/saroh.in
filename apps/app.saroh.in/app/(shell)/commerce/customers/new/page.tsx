import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { CustomerForm } from "@/components/stores/customer-form";
import { newCustomerHref } from "@/lib/customers/links";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";

export const metadata = { title: "Add customer" };

/**
 * Sell → Customers → Add customer. Someone who has not ordered yet — met at
 * the counter, or on the phone — added at one storefront.
 */
export default async function NewCustomerPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    await requireSession();
    const [{ storefront }, stores] = await Promise.all([
        searchParams,
        listStores(),
    ]);
    const store =
        stores.find((s) => s.id === storefront) ??
        (stores.length === 1 ? stores[0] : undefined);

    return (
        <PageContainer width="form">
            {store ? (
                <>
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
                            "Add customer",
                        ]}
                        title="Add customer"
                        description={`Added at ${store.name}. An email is enough; the rest is whatever you know.`}
                    />
                    <CustomerForm storeId={store.id} />
                </>
            ) : (
                <StorefrontChooser
                    section="Customers"
                    sectionHref="/commerce/customers"
                    crumb="Add customer"
                    title="Which storefront are they a customer of?"
                    description="A customer is kept per storefront. The same person at another one is linked by their email."
                    stores={stores}
                    hrefFor={newCustomerHref}
                />
            )}
        </PageContainer>
    );
}
