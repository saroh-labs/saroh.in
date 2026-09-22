import { redirect } from "next/navigation";

import { importCustomersHref } from "@/lib/customers/links";

/** Customers are imported from Sell now (#375); this address still works. */
export default async function ImportCustomersRedirect({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(importCustomersHref(storeId));
}
