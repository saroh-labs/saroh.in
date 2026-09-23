import { redirect } from "next/navigation";

import { productSettingsHref } from "@/lib/products/links";

/** Categories moved into Product settings (#470); old links land there. */
export default async function ProductCategoriesPage({
    searchParams,
}: {
    searchParams: Promise<{ storefront?: string }>;
}) {
    const { storefront } = await searchParams;
    redirect(productSettingsHref(storefront, "categories"));
}
