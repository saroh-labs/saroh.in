import { rememberedPageSize } from "@/lib/paging/remembered";

import { PlanLimitNotice } from "@/components/billing/plan-limit-notice";
import { LateRuleNotice } from "@/components/commerce/orders/late-rule-notice";
import { OrdersContainer } from "@/components/commerce/orders/orders-container";
import { OrdersLocked } from "@/components/commerce/orders/orders-states";
import { PageContainer } from "@/components/shared/page/page-container";
import { createBlock, takesOnlinePayment } from "@/lib/billing/access";
import { arrivalContactId } from "@/lib/customers/prefill";
import { readCustomerPick } from "@/lib/customers/prefill-read";
import { hasPaymentProvider } from "@/lib/invoices/tax";
import {
    orderPowers,
    ordersAccess,
    ordersLockedCopy,
} from "@/lib/orders/access";
import { sellsProducts } from "@/lib/orders/sells-products";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { isLocationScopedRole } from "@/lib/organizations/storefront-team";
import { billingAccessOrNull } from "@/lib/saroh-billing/service";
import { requireSession } from "@/lib/session";
import { readOrderPlaces } from "@/lib/stores/location-reads";
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
 * storefront, the filters (B4) and the page. A link from before B3
 * (`?view=unfulfilled`) still lands on the tab it meant.
 *
 * Someone holding neither `order:read` nor `order:stage` gets the locked card
 * before anything is read (B7). The list read failing is the page failing
 * (`error.tsx`, "Couldn't load orders") — never an empty list.
 *
 * On React Query (DEC-259), loaded in the browser: the gates and what New
 * order offers are decided here; the page of the list and what its filter
 * bar offers are `OrdersContainer`'s queries (`lib/orders/access-server.ts`),
 * read from the browser into the screen's frame, drawn at once with its
 * rows as skeletons, and every later one in place. No order is in the
 * page's HTML.
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

    const remembered = await rememberedPageSize("orders");
    const storesRead = listBusinessStores();
    // What a row's menu and quick view may offer (B5), as Order Detail
    // asks it. A payment link needs a provider that opens the checkout window
    // (DEC-054), asked only of someone who may make one.
    const may = permitsFor(organization);
    // What this person may do to orders, each the power its endpoint asks
    // (B16): what they can't do isn't drawn.
    const powers = orderPowers(organization);
    // On a plan without online payments no payment link is offered at all —
    // not on a row, not in New order (R33); "Paid in cash" and the counter
    // ways stay. The API refuses one anyway.
    const billing = await billingAccessOrNull();
    const online = takesOnlinePayment(billing);
    const linkable = powers.payLink && online;
    const payOnline =
        linkable && access.money
            ? hasPaymentProvider().catch(() => false)
            : Promise.resolve(false);
    // New order (B13) is for someone who may take orders (`order:create`),
    // in a business that sells things: one whose catalogue is only
    // appointments books them in Bookings. A read that fails keeps the
    // button.
    // Someone the business role gives no order to take may still take
    // them at a location they were invited to (a location Admin, Manager
    // or Editor): each of their locations says so in its own read.
    // A location's team (DEC-074) takes orders only where it works, with no
    // payment: its locations' reads say where, as for a location role.
    const placesRead =
        powers.create && !isLocationScopedRole(organization?.roleKey)
            ? Promise.resolve(undefined)
            : storesRead.then((all) => readOrderPlaces(all.map((s) => s.id)));
    const sells = placesRead.then((places) =>
        powers.create || places?.length ? sellsProducts() : false,
    );
    // Opened from a person's page (#247): New order arrives with them
    // chosen, read only for someone who may take the order and search.
    const forContact = arrivalContactId(params);
    const pick =
        forContact && powers.create && may("contact:read")
            ? readCustomerPick(forContact)
            : Promise.resolve(null);
    const [stores, canPayOnline, sellsSomething, initialPick, places] =
        await Promise.all([storesRead, payOnline, sells, pick, placesRead]);

    // A page past the end, the first-run moment and share are the
    // container's, from its first read (`readOrdersList`).
    return (
        <OrdersContainer
            defaultSize={remembered}
            // Under the page's header, never above its title.
            notices={
                <>
                    {/* B17: storefronts still on the 2-hour Pick-up
                            default, in one notice, for whoever can change
                            it (finding 9). */}
                    <LateRuleNotice />
                    <PlanLimitNotice moduleId="orders" className="mb-4" />
                </>
            }
            // Oldest first, as `listBusinessStores` reads them, so New
            // order starts at the business's first storefront (the shop
            // the design's counter sheet opens on), not the one made last.
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            businessName={businessName}
            // A Member reaches the list through `order:stage` alone
            // (DEC-024) and gets the kitchen's view of it.
            kitchen={!access.money}
            searchContacts={may("contact:read")}
            newOrder={
                sellsSomething
                    ? {
                          // The old New order page and the calendar's
                          // "New order" land here with ?new=1.
                          openOnArrival: params.new === "1",
                          canSearch: may("contact:read"),
                          online,
                          // The month's orders used up: said before the
                          // sheet is filled, not after (UX-036).
                          blocked: createBlock(billing, "orders"),
                          // From a person's page (#247): them, chosen.
                          initialPick,
                          places,
                      }
                    : null
            }
            can={{
                // Without resolved actions a Member still stages (DEC-024).
                stage: powers.stage,
                create: powers.create,
                payLink: linkable,
                refund: powers.refund,
                export: powers.export,
                payOnline: canPayOnline,
            }}
        />
    );
}
