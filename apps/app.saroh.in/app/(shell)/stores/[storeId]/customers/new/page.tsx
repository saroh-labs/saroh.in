import { redirect } from "next/navigation";

import { newCustomerHref } from "@/lib/customers/links";

/**
 * Customers are added in Sell now (#375), to the business rather than one
 * storefront (DEC-056); this address still works.
 */
export default function NewCustomerRedirect() {
    redirect(newCustomerHref());
}
