import { redirect } from "next/navigation";

import { customerHref } from "@/lib/customers/links";

/** Customers are read in Sell now (#375); this address still works. */
export default async function CustomerRedirect({
    params,
}: {
    params: Promise<{ storeId: string; customerId: string }>;
}) {
    const { storeId, customerId } = await params;
    redirect(customerHref(storeId, customerId));
}
