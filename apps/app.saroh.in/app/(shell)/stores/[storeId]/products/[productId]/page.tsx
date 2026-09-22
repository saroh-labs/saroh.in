import { redirect } from "next/navigation";

import { productHref } from "@/lib/products/links";

/** Products are edited in Sell now (#373); this address still works. */
export default async function ProductRedirect({
    params,
}: {
    params: Promise<{ storeId: string; productId: string }>;
}) {
    const { storeId, productId } = await params;
    redirect(productHref(storeId, productId));
}
