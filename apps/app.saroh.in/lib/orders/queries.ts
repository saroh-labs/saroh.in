import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { OrderPaymentsSummary } from "@/lib/payments/service";
import type { InvitationState } from "@/lib/product-reviews/service";
import type { OrderFilterOptions, OrderListPage } from "./business-service";
import type { OrdersQuery } from "./list-query";
import { ordersHref } from "./list-query";
import type { AllergyNote, OrderRead } from "./read";
import type { Sellable } from "./sellables";

/**
 * Orders' reads (DEC-259): the list, what its filter bar offers, one order
 * and the tickets to print. Client-safe: the keys and the routes; the
 * services are paired in `access-server.ts`.
 */

/** Every Orders read of a business. */
export const ordersKeys = (orgId: string): DomainKey =>
    domainKey("orders", orgId);

/** Every cached page of the list, whatever its view. */
export const ordersListKeys = (orgId: string): DomainKey =>
    domainKey("orders", orgId, "list");

/** Every cached order page. */
export const orderKeys = (orgId: string): DomainKey =>
    domainKey("orders", orgId, "order");

// What the address can say; `readOrdersQuery` on the server decides what
// each means, as the page always has.
const word = z.string().max(100).optional();

/** One page of the list, as the address narrows it (`ordersAsk`). */
export const ordersListRead = defineRead<OrderListPage>()({
    key: (orgId, ask) => domainKey("orders", orgId, "list", ask),
    route: {
        path: "/api/orders",
        params: {
            tab: word,
            q: word,
            storefront: word,
            since: word,
            date: word,
            from: word,
            to: word,
            step: word,
            fulfilment: word,
            payment: word,
            product: word,
            attention: word,
            late: word,
            page: word,
            size: word,
        },
    },
});

export type OrdersAsk = Parameters<typeof ordersListRead.options>[1];

/**
 * The list's read, from the address as the screen reads it: the canonical
 * address's params, so two ways of writing one view share a key.
 */
export function ordersAsk(query: OrdersQuery): OrdersAsk {
    const search = ordersHref(query).split("?")[1] ?? "";
    return Object.fromEntries(new URLSearchParams(search));
}

/** What the filter bar offers, and the storefront menu's open counts. */
export interface OrdersOptions {
    /** Null: unread, and the bar leaves out the menus it would fill. */
    filters: OrderFilterOptions | null;
    /** Null: one storefront, or a count couldn't be read. */
    openByStore: Record<string, number> | null;
}

/** Keyed on the product filter alone: a tab or page change reads nothing. */
export const ordersOptionsRead = defineRead<OrdersOptions>()({
    key: (orgId, ask) => domainKey("orders", orgId, "options", ask),
    route: { path: "/api/orders/options", params: { product: word } },
});

export type OrdersOptionsAsk = Parameters<typeof ordersOptionsRead.options>[1];

/** One order as its page draws it. */
export interface OrderView {
    order: OrderRead;
    /** Their allergies (Needs attention); null when not read. */
    notes: AllergyNote[] | null;
    /** The provider's attempts; null for a role without money, or unread. */
    payments: OrderPaymentsSummary | null;
    /** The review invitation; null when not this role's, or unread. */
    review: InvitationState | null;
    /** "Add an item" (B8) while items can change; null when not offered. */
    addable: Sellable[] | "unavailable" | null;
}

const ID = z.string().regex(/^[\w-]{1,64}$/);

export const orderRead = defineRead<OrderView>()({
    key: (orgId, { orderId }) => domainKey("orders", orgId, "order", orderId),
    route: { path: "/api/orders/[orderId]", params: { orderId: ID } },
});

export type OrderAsk = Parameters<typeof orderRead.options>[1];

/** Print tickets (B6): the orders picked on the list. */
export interface TicketsView {
    orders: OrderRead[];
    /** Read, but with nothing to make. */
    noTicket: number;
    /** Couldn't be read. */
    failed: number;
}

export const ticketsRead = defineRead<TicketsView>()({
    key: (orgId, ask) => domainKey("orders", orgId, "tickets", ask),
    route: {
        path: "/api/orders/tickets",
        // 50 ids (TICKETS_MAX), comma-separated.
        params: { ids: z.string().max(1700) },
    },
});

export type TicketsAsk = Parameters<typeof ticketsRead.options>[1];
