import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/stores/customer-form";
import { getCustomer } from "@/lib/customers/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function EditCustomerPage({
    params,
}: {
    params: Promise<{ storeId: string; customerId: string }>;
}) {
    const { storeId, customerId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const customer = await getCustomer(storeId, customerId);
    if (!customer) notFound();

    return (
        <div className="space-y-6">
            <PageHeader
                title={
                    [customer.firstName, customer.lastName]
                        .filter(Boolean)
                        .join(" ") || customer.email
                }
                description="Edit this customer's details."
            />
            <CustomerForm storeId={storeId} customer={customer} />
        </div>
    );
}
