import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listCustomers } from "@/lib/customers/service";
import { requireSession } from "@/lib/session";
import { getStore } from "@/lib/stores/service";

function name(c: { firstName: string | null; lastName: string | null }) {
    return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

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
                <ul className="divide-y rounded-lg border">
                    {customers.map((c) => (
                        <li key={c.id}>
                            <Link
                                href={`${base}/${c.id}`}
                                className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                        {name(c) || c.email}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {c.email}
                                    </p>
                                </div>
                                {c.city && (
                                    <span className="text-xs text-muted-foreground">
                                        {c.city}
                                    </span>
                                )}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
