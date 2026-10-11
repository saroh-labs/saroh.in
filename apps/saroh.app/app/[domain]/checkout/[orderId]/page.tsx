import { redirect } from "next/navigation";

import { orderConfirmationHref } from "@saroh/site-blocks";

/**
 * `/checkout/<order>` was the first buyer checkout (S5-004). The bag's
 * sheet pays for an order now, and its page is `/shop/order/<order>`, so an
 * old link lands there: the order, shown to whoever placed it once they
 * are signed in. Nothing links here any more.
 *
 * `/checkout` stays a reserved page path (the API's `RESERVED_PAGE_PATHS`)
 * and a private one (`lib/private-paths.ts`): never indexed, never kept by
 * the page cache.
 */
export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ domain: string; orderId: string }>;
}) {
    const { orderId } = await params;
    redirect(orderConfirmationHref(orderId));
}
