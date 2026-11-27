import "server-only";

import { cache } from "react";

import { businessModeOf } from "@/lib/gst/price-mode";
import { getInvoiceBusiness } from "@/lib/invoices/tax";
import { moduleAccess } from "@/lib/modules/guard";
import { ordersListMoment } from "@/lib/moments/read";
import { permitsFor } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { getOrderPayments } from "@/lib/payments/service";
import { invitationState } from "@/lib/product-reviews/service";
import { listProducts } from "@/lib/products/service";
import type { ServerRead } from "@/lib/query/route";
import { ORDERS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import { readWebAddressLinks } from "@/lib/sites/share-links-read";
import { listBusinessStores } from "@/lib/stores/service";

import { orderPowers, ordersAccess } from "./access";
import { allergyNotesOf } from "./attention";
import { getOrderFilterOptions, listOrderRows } from "./business-service";
import {
    getAttentionAllergies,
    getOrderRead,
    readOrderQuickView,
} from "./kitchen-service";
import {
    defaultOrdersTab,
    foldsOlder,
    orderListParams,
    readOrdersQuery,
} from "./list-query";
import type {
    OrderAsk,
    OrdersAsk,
    OrdersListView,
    OrdersOptions,
    OrdersOptionsAsk,
    OrderView,
    TicketsAsk,
    TicketsView,
} from "./queries";
import {
    orderRead,
    ordersListRead,
    ordersOptionsRead,
    ticketsRead,
} from "./queries";
import type { OrderRead } from "./read";
import { sellablesOf } from "./sellables";
import { readTicketIds, ticketOrder } from "./tickets";

/**
 * Who reads Orders (DEC-259), asked by the pages and by `/api/orders/*`
 * alike, so the two can't differ. Server-only; `access.ts` beside it is
 * pure and also drawn in the browser.
 *
 * The list, an order and its tickets: `order:read`, or `order:stage` alone
 * for the kitchen (DEC-024), while Sell is on, as the section's layout
 * decides; anyone else a 403. What each row shows (money, a location's
 * orders only) is the API's: every read carries the person's session.
 */
export async function mayReadOrders(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    if (!organization || !ordersAccess(organization).open) return false;
    const access = await moduleAccess("COMMERCE");
    return access.state === "available" || access.state === "unknown";
}

/**
 * A page of the list (the API's empty page when there is no business), and
 * what its first run says from it. The business's first, 10th or 100th
 * order (wave G), only on the whole list's first page, where the count is
 * every order. No orders yet: share the online shop while it is live, else
 * the website (B7; DEC-069, L8); a web address that can't be read (or a
 * role it isn't shown to) leaves the button out. Each is read only then.
 */
export async function readOrdersList(ask: OrdersAsk): Promise<OrdersListView> {
    const query = readOrdersQuery(ask);
    const [first, viewer] = await Promise.all([
        listOrderRows(orderListParams(query)),
        activeOrganizationOnce(),
    ]);
    // The fold would hide every open order: list those instead, so the
    // page is never an empty list above one line (DEC-265, 27 Nov 2026).
    const allStale =
        foldsOlder(query) &&
        first.rows.length === 0 &&
        (first.counts.stale ?? 0) > 0;
    const page = allStale
        ? {
              ...(await listOrderRows(
                  orderListParams({ ...query, older: true }),
              )),
              counts: first.counts,
          }
        : first;
    // Nothing narrows it: Open or All with no search, filter or fold open.
    const unnarrowed =
        defaultOrdersTab(query) === "open" &&
        !query.older &&
        (query.tab === "open" || query.tab === "all");
    const [moment, share] = await Promise.all([
        ordersListMoment(
            // The newest order first, whatever order the view sorts by.
            { counts: page.counts, rows: newestFirst(page.rows) },
            {
                plain: unnarrowed && !query.storefront && query.page === 1,
                viewer,
            },
        ),
        page.counts.all === 0 && unnarrowed
            ? readWebAddressLinks().then((links) =>
                  shareLink(links, ORDERS_FIRST_RUN),
              )
            : null,
    ]);
    return allStale
        ? { ...page, moment, share, allStale: true }
        : { ...page, moment, share };
}

function newestFirst<R extends { placedAt: string }>(rows: R[]): R[] {
    return [...rows].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** The filter bar's choices and the storefront menu's open counts. */
export async function readOrdersOptions(
    ask: OrdersOptionsAsk,
): Promise<OrdersOptions> {
    const [filters, openByStore] = await Promise.all([
        getOrderFilterOptions(ask.product),
        listBusinessStores().then((all) =>
            all.length > 1 ? openOrdersByStore(all.map((s) => s.id)) : null,
        ),
    ]);
    return { filters, openByStore };
}

/**
 * How many orders are open at each storefront: the API's Open count under
 * that storefront. Null if any couldn't be counted: the menu then shows no
 * counts rather than a wrong 0.
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

/** One read of an order per render: the tab's title and the page share it. */
export const readOrderOnce = cache((orderId: string) => getOrderRead(orderId));

/**
 * One order as its page draws it. The allergy check reads the order's own
 * Needs attention (B15), else the contact's (an API before B15). Beside it,
 * each read on its own so one failing costs only its panel: the provider's
 * attempts (money roles), the review invitation (`order:read`) and what
 * "Add an item" offers, while items can change, to whoever may change them.
 * Null: missing, or another business's (a 404).
 */
export async function readOrderView({
    orderId,
}: OrderAsk): Promise<OrderView | null> {
    const [order, organization] = await Promise.all([
        readOrderOnce(orderId),
        activeOrganizationOnce(),
    ]);
    if (!order) return null;
    const may = permitsFor(organization);
    const powers = orderPowers(organization);
    const contactId = order.customer?.contactId ?? null;
    const fromOrder = allergyNotesOf(order.attention);
    const [notes, payments, review, addable] = await Promise.all([
        fromOrder !== undefined
            ? Promise.resolve(fromOrder)
            : contactId
              ? getAttentionAllergies(contactId)
              : Promise.resolve([]),
        order.money
            ? getOrderPayments(order.id).catch(() => null)
            : Promise.resolve(null),
        // Unknown on failure: the section is left out rather than guessing.
        may("order:read")
            ? invitationState(order.id).catch(() => null)
            : Promise.resolve(null),
        powers.edit && order.next.editable
            ? readAddable(order.store.id)
            : Promise.resolve(null),
    ]);
    return { order, notes, payments, review, addable };
}

/**
 * "Add an item" (B8), from the order's own storefront (DEC-032), priced as
 * the API will charge it: GST on top where the business, or the product,
 * has "GST is added"; unread charges the typed price.
 */
function readAddable(storefront: string) {
    return Promise.all([
        listProducts({ storefront }),
        getInvoiceBusiness().catch(() => null),
    ])
        .then(([products, business]) =>
            sellablesOf(
                // Set to Not sold (archived): nobody orders it.
                products
                    .filter((p) => p.status !== "ARCHIVED")
                    .map((p) => ({
                        id: p.id,
                        name: p.name,
                        price: p.price,
                        variants: p.variants,
                        soldOut:
                            p.soldOut === true ||
                            (p.inventory !== null && p.inventory.quantity <= 0),
                        gstRate: p.gstRate,
                        gstPriceMode: p.gstPriceMode,
                    })),
                {
                    registered: business?.registered ?? false,
                    mode: businessModeOf(business?.priceMode),
                },
            ),
        )
        .catch(() => "unavailable" as const);
}

/**
 * The tickets of the orders picked on the list, each read as the quick
 * view reads it (`?view=quick`), so a ticket never shows more of the
 * customer than the row did; one that can't be read costs only its ticket.
 */
export async function readTickets({ ids }: TicketsAsk): Promise<TicketsView> {
    const picked = readTicketIds({ ids });
    const reads = await Promise.all(
        picked.map((id) =>
            readOrderQuickView(id).catch(() => ({ ok: false as const })),
        ),
    );
    const found: OrderRead[] = reads.flatMap((r) => (r.ok ? [r.order] : []));
    const orders = ticketOrder(found);
    return {
        orders,
        noTicket: found.length - orders.length,
        failed: picked.length - found.length,
    };
}

export const ordersListServer: ServerRead<OrdersAsk, OrdersListView> = {
    read: ordersListRead,
    service: readOrdersList,
};

export const ordersOptionsServer: ServerRead<OrdersOptionsAsk, OrdersOptions> =
    { read: ordersOptionsRead, service: readOrdersOptions };

export const orderServer: ServerRead<OrderAsk, OrderView> = {
    read: orderRead,
    service: readOrderView,
};

export const ticketsServer: ServerRead<TicketsAsk, TicketsView> = {
    read: ticketsRead,
    service: readTickets,
};
