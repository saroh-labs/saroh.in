import { redirect } from "next/navigation";

import { newOrderHref } from "@/lib/orders/links";

/** Orders are taken in Sell now (#374); this address still works. */
export default async function NewOrderRedirect({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(newOrderHref(storeId));
}
