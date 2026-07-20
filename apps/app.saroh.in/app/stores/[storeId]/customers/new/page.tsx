import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { CustomerForm } from "@/components/stores/customer-form";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function NewCustomerPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    return (
        <div className="space-y-6">
            <PageHeader
                title="New customer"
                description="Add a customer to this store."
            />
            <CustomerForm storeId={storeId} />
        </div>
    );
}
