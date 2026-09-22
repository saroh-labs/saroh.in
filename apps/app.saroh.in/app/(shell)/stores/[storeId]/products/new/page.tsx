import { redirect } from "next/navigation";

import { newProductHref } from "@/lib/products/links";

/** Products are made in Sell now (#373); this address still works. */
export default async function NewProductRedirect({
    params,
}: {
    params: Promise<{ storeId: string }>;
}) {
    const { storeId } = await params;
    redirect(newProductHref(storeId));
}
