import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CustomersTable } from "@/components/stores/customers-table";
import { listCustomers } from "@/lib/customers/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

export default async function CustomersPage({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    await requireSession();
    const store = await getStore(storeId);
    if (!store) notFound();

    const customers = await listCustomers(storeId);
    const base = `/stores/${storeId}/customers`;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Customers"
                description="People who order from this store."
                actions={
                    <Button variant="brand" asChild>
                        <Link href={`${base}/new`}>New customer</Link>
                    </Button>
                }
            />

            {customers.length === 0 ? (
                <EmptyState
                    title="No customers yet"
                    description="Add a customer, or one is created with their first order."
                    action={
                        <Button variant="brand" asChild>
                            <Link href={`${base}/new`}>New customer</Link>
                        </Button>
                    }
                />
            ) : (
                <CustomersTable customers={customers} base={base} />
            )}
        </div>
    );
}
