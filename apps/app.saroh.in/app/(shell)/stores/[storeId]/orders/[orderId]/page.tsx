import { redirect } from "next/navigation";

import { orderHref } from "@/lib/orders/links";

/** Orders are read in Sell now (#374); this address — and every link the API
 * built to it — still works. */
export default async function OrderRedirect({
    params,
}: {
    params: Promise<{ storeId: string; orderId: string }>;
}) {
    const { storeId, orderId } = await params;
    redirect(orderHref(storeId, orderId));
}
