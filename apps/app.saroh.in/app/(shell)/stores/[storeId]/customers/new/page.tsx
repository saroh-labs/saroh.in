import { redirect } from "next/navigation";

import { newCustomerHref } from "@/lib/customers/links";

/** Customers are added in Sell now (#375); this address still works. */
export default async function NewCustomerRedirect({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(newCustomerHref(storeId));
}
