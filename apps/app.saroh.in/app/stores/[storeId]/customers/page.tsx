import { Button } from "@saroh/ui/button";
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
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">Customers</h2>
                    <p className="text-sm text-muted-foreground">
                        People who order from this store.
                    </p>
                </div>
                <Button asChild>
                    <Link href={`${base}/new`}>New customer</Link>
                </Button>
            </div>

            {customers.length === 0 ? (
                <div className="rounded-lg border p-8 text-center">
                    <h3 className="font-medium">No customers yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Add a customer, or one is created with their first
                        order.
                    </p>
                </div>
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
