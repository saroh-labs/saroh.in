import { redirect } from "next/navigation";

import { productSettingsHref } from "@/lib/products/links";

/**
 * Categories moved into Product settings (#470); old links land there. They
 * are the business's (#529), so a `?storefront=` in an old link is ignored.
 */
export default function ProductCategoriesPage() {
    redirect(productSettingsHref("categories"));
}
