import Link from "next/link";
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
            <Link
                href={`/stores/${storeId}/customers`}
                className="text-sm text-muted-foreground hover:underline"
            >
                ← Back to customers
            </Link>
            <h2 className="text-lg font-medium">New customer</h2>
            <CustomerForm storeId={storeId} />
        </div>
    );
}
