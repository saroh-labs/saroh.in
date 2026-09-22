import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { StorefrontChooser } from "@/components/commerce/storefront-chooser";
import { PageContainer } from "@/components/shared/page-container";
import { OrderForm } from "@/components/stores/order-form";
import { listCustomers } from "@/lib/customers/service";
import { newOrderHref } from "@/lib/orders/links";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { listStores } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

export const metadata = { title: "New order" };

/**
 * Sell → Orders → New order: an order taken by hand — on the phone, at the
 * counter — for a customer and products at one storefront.
 */
export default async function NewOrderPage({
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

    if (!store) {
        return (
            <PageContainer width="form">
                <StorefrontChooser
                    section="Orders"
                    sectionHref="/commerce/orders"
                    crumb="New order"
                    title="Which storefront is it for?"
                    description="An order is taken at one storefront, from its products and its customers."
                    stores={stores}
                    hrefFor={newOrderHref}
                />
            </PageContainer>
        );
    }

    const [customers, products, checkout] = await Promise.all([
        listCustomers(store.id),
        listProducts(store.id),
        // The storefront's tax and delivery, as the form's starting figures.
        getStorefront(store.id).catch(() => null),
    ]);

    return (
        <PageContainer width="form">
            <PageHeader
                breadcrumb={[
                    "Sell",
                    <Link
                        key="orders"
                        href="/commerce/orders"
                        className="hover:text-foreground"
                    >
                        Orders
                    </Link>,
                    "New order",
                ]}
                title="New order"
                description={`Taken by hand at ${store.name}, for a customer who ordered in person or on the phone.`}
            />
            <OrderForm
                storeId={store.id}
                customers={customers}
                products={products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                }))}
                checkout={checkout}
            />
        </PageContainer>
    );
}
