import { redirect } from "next/navigation";

import { LateRuleNotice } from "@/components/commerce/orders/late-rule-notice";
import { OrdersScreen } from "@/components/commerce/orders/orders-screen";
import { OrdersLocked } from "@/components/commerce/orders/orders-states";
import { PageContainer } from "@/components/shared/page-container";
import { env } from "@/env";
import { ordersAccess, ordersLockedCopy } from "@/lib/orders/access";
import { listOrderRows } from "@/lib/orders/business-service";
import {
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    readOrdersQuery,
} from "@/lib/orders/list-query";
import { storefrontShareUrl } from "@/lib/orders/share";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listSites } from "@/lib/sites/service";
import { listBusinessStores } from "@/lib/stores/service";

/** Where a merchant's subdomain lives, as the Website screen reads it. */
const ROOT_DOMAIN = env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app";

/**
 * Sell → Orders: every order in the business, a page at a time (plan B, B3).
 *
 * ONE read for the list, unlike Customers next door, which fans out per
 * storefront because customers are stored per storefront. Orders carry their
 * organization, so the API answers across storefronts in a single query and
 * sends the tab counts with the page — which is also what makes the count
 * the rail badges and this list the same fact.
 *
 * The address is the list's state (`list-query.ts`): the tab, the search, the
 * storefront and the page. A link from before B3 (`?view=unfulfilled`) still
 * lands on the tab it meant.
 *
 * Someone holding neither `order:read` nor `order:stage` gets the locked card
 * before anything is read (B7). The list read failing is the page failing
 * (`error.tsx`, "Couldn't load orders") — never an empty list.
 */
export const metadata = { title: "Orders" };

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [params, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    const access = ordersAccess(organization);
    const businessName = organization?.name ?? "the business";
    if (organization && !access.open) {
        return (
            <PageContainer width="full">
                <OrdersLocked
                    {...ordersLockedCopy(organization, businessName)}
                />
            </PageContainer>
        );
    }

    const query = readOrdersQuery(params);
    const storesRead = listBusinessStores();
    const [page, stores, openByStore] = await Promise.all([
        listOrderRows(orderListParams(query)),
        storesRead,
        // Counted beside the page, not after it.
        storesRead.then((all) =>
            all.length > 1 ? openOrdersByStore(all.map((s) => s.id)) : null,
        ),
    ]);
    // A page past the end, or a cursor from a list that has since changed
    // (an order the API can't find answers as an empty page): start again at
    // the first page rather than show an empty one.
    if (query.cursor && page.rows.length === 0) {
        redirect(ordersHref(query, { cursor: null, back: [] }));
    }
    // No orders yet: "Share your storefront" copies the live site's address
    // (B7's first run, built in B8). Only then is the site read, and a read
    // that fails just leaves the button out.
    const shareUrl =
        page.rows.length === 0 &&
        ordersEmptyCopy(query, null).kind === "first-run"
            ? await listSites()
                  .then((sites) => storefrontShareUrl(sites, ROOT_DOMAIN))
                  .catch(() => null)
            : null;

    return (
        <PageContainer width="full">
            {/* B17: storefronts still on the 2-hour Pick-up default. */}
            <LateRuleNotice />
            <OrdersScreen
                query={query}
                page={page}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                openByStore={openByStore}
                businessName={businessName}
                // A Member reaches the list through `order:stage` alone
                // (DEC-024) and gets the kitchen's view of it.
                kitchen={!access.money}
                shareUrl={shareUrl}
            />
        </PageContainer>
    );
}

/**
 * How many orders are open at each storefront, for the storefront menu —
 * the API's Open count under that storefront. Null if any couldn't be
 * counted: the menu then shows no counts rather than a wrong 0.
 */
async function openOrdersByStore(
    storeIds: string[],
): Promise<Record<string, number> | null> {
    const counted = await Promise.allSettled(
        storeIds.map((storeId) => listOrderRows({ storeId, tab: "open" })),
    );
    const out: Record<string, number> = {};
    for (const [i, result] of Array.from(counted.entries())) {
        if (result.status !== "fulfilled") return null;
        out[storeIds[i]] = result.value.counts.open;
    }
    return out;
}
