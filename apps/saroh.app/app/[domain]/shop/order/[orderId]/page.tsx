import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderConfirmation } from "@saroh/site-blocks";

import { accountAreaOn } from "@/lib/account-area";
import { getSiteForHost } from "@/lib/publication";
import { getOrderConfirmation } from "@/lib/shop-confirmation";

/**
 * The order confirmation on a merchant's site (round-2 P4), at
 * `/shop/order/<ref>`: where the bag sheet's "Order placed" leads, so the
 * customer stays on the business's own domain after paying (the rule D12
 * set for pay links).
 *
 * A static `order` segment under `/shop`: `/shop/order` alone is still a
 * product slugged "order"; only `/shop/order/<ref>` is this page. Read with
 * the customer's session, so it shows only to whoever placed the order.
 * With the account area on (`SITE_ACCOUNT_AREA`), it links to that order
 * in their Orders.
 */

export const metadata: Metadata = {
    title: "Your order",
    robots: { index: false, follow: false },
};

export default async function ShopOrderPage({
    params,
}: {
    params: Promise<{ domain: string; orderId: string }>;
}) {
    const { domain, orderId } = await params;
    const resolved = await getSiteForHost(domain);
    if (!resolved?.siteId) notFound();

    const lookup = await getOrderConfirmation(resolved.siteId, orderId);
    const ordersHref =
        lookup.ok && accountAreaOn()
            ? `/account/orders?order=${encodeURIComponent(orderId)}`
            : null;

    return (
        <OrderConfirmation
            lookup={lookup}
            businessName={resolved.snapshot.site.name}
            ordersHref={ordersHref}
        />
    );
}
