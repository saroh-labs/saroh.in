import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { OrderForm } from "@/components/stores/order-form";
import { listCustomers } from "@/lib/customers/service";
import { listProducts } from "@/lib/products/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";
import { getStorefront } from "@/lib/stores/storefronts";

export default async function NewOrderPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const [customers, products, checkout] = await Promise.all([
        listCustomers(storeId),
        listProducts(storeId),
        // The storefront's tax and delivery, as the form's starting figures.
        getStorefront(storeId).catch(() => null),
    ]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="New order"
                description="Create an order for a customer."
            />
            <OrderForm
                storeId={storeId}
                customers={customers}
                products={products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    price: p.price,
                }))}
                checkout={checkout}
            />
        </div>
    );
}
