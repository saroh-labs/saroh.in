import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { TrackLookup } from "@saroh/site-blocks";
import { ACCOUNT_TAB_HREF, AccountOrders } from "@saroh/site-blocks";

import { getAccount, getOrder, getOrders } from "@/lib/account-area";
import { getSiteForHost } from "@/lib/publication";
import { getCheckoutOptions } from "@/lib/shop-checkout";

/**
 * The account's Orders (round-2 plan A, A7): every order of the customer's,
 * newest first, and — at `?order=‹ref›` — that order's Track, drawn from
 * the steps the API sends. The layout has already checked the switch and
 * the session. A business that doesn't sell has no Orders tab, and this
 * page is a 404 for it.
 */
export const metadata: Metadata = { title: "Orders" };

export default async function AccountOrdersPage({
    params,
    searchParams,
}: {
    params: Promise<{ domain: string }>;
    searchParams: Promise<{ order?: string | string[] }>;
}) {
    const [{ domain }, query, lookup] = await Promise.all([
        params,
        searchParams,
        getAccount(),
    ]);
    if (!lookup.ok) return null; // The layout drew the signed-out state.
    const { account } = lookup;
    if (!account.tabs.some((t) => t.key === "orders")) notFound();

    const ref = typeof query.order === "string" ? query.order.trim() : "";
    const [orders, track, site] = await Promise.all([
        getOrders(),
        ref ? getOrder(ref) : Promise.resolve<TrackLookup | null>(null),
        getSiteForHost(domain),
    ]);
    // "Go to the shop" only while the shop takes orders (G13).
    const options = site?.siteId
        ? await getCheckoutOptions(site.siteId).catch(() => null)
        : null;

    return (
        <AccountOrders
            orders={orders}
            track={track}
            businessName={account.businessName}
            shopHref={options?.canOrder ? "/shop" : null}
            messagesHref={
                account.tabs.some((t) => t.key === "messages")
                    ? ACCOUNT_TAB_HREF.messages
                    : null
            }
        />
    );
}
