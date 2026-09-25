import { redirect } from "next/navigation";

import { productCategoriesHref } from "@/lib/stores/links";

/**
 * Retired in favour of Sell (#376); this address still works. Categories are
 * the business's (#529), so it lands on them whichever storefront it named.
 */
export default function Retired() {
    redirect(productCategoriesHref());
}
