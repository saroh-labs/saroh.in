import { redirect } from "next/navigation";

import { LateRuleNotice } from "@/components/commerce/orders/late-rule-notice";
import { OrdersScreen } from "@/components/commerce/orders/orders-screen";
import { PageContainer } from "@/components/shared/page-container";
import { listOrderRows } from "@/lib/orders/business-service";
import {
    orderListParams,
    ordersHref,
    readOrdersQuery,
} from "@/lib/orders/list-query";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

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
 */
export const metadata = { title: "Orders" };

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const query = readOrdersQuery(await searchParams);
    const storesRead = listBusinessStores();
    const [page, stores, organization, openByStore] = await Promise.all([
        listOrderRows(orderListParams(query)),
        storesRead,
        resolveActiveOrganization(),
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
    // A Member reaches the list through `order:stage` alone (DEC-024) and
    // gets the kitchen's view of it.
    const fullRead = organization?.actions
        ? organization.actions.includes("order:read")
        : organization?.role !== "MEMBER";

    return (
        <PageContainer width="full">
            {/* B17: storefronts still on the 2-hour Pick-up default. */}
            <LateRuleNotice />
            <OrdersScreen
                query={query}
                page={page}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                openByStore={openByStore}
                businessName={organization?.name ?? "the business"}
                kitchen={!fullRead}
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
