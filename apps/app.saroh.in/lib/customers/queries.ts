import { z } from "zod";

import type { DataRequestRow } from "@/lib/customer-workspace/data-requests-view";
import { REQUEST_FILTERS } from "@/lib/customer-workspace/data-requests-view";
import type { CustomerDetail } from "@/lib/customer-workspace/detail";
import type { MergedRedirect } from "@/lib/customer-workspace/merge";
import type { Suggestion } from "@/lib/customer-workspace/service";
import type { ThreadRead } from "@/lib/customer-workspace/view";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { CustomersPage, ListQuery } from "./list";

/**
 * Customers' reads (DEC-259): the list, the removal requests and one
 * customer's page. Client-safe: the keys and the routes; the services are
 * paired in `access-server.ts`.
 */

/** Every Customers read of a business. */
export const customersKeys = (orgId: string): DomainKey =>
    domainKey("customers", orgId);

const word = z.string().max(100).optional();

/** A page of the list, as its address asks (`readListQuery`). */
export const customersListRead = defineRead<CustomersListView>()({
    key: (orgId, ask) => domainKey("customers", orgId, "list", ask),
    route: {
        path: "/api/customers",
        params: {
            q: word,
            chip: word,
            sort: word,
            store: word,
            page: z
                .string()
                .regex(/^\d{1,6}$/)
                .optional(),
            size: z.string().regex(/^\d{1,3}$/),
        },
    },
    tier: "records",
});

export type CustomersAsk = Parameters<typeof customersListRead.options>[1];

export interface CustomersListView {
    page: CustomersPage;
    /** How many contacts, for the first-run state; null unless nobody is a customer. */
    contacts: number | null;
}

/** The list's read from its (allowed) query: only what says something, so the key and the address agree. */
export function customersAsk(query: ListQuery): CustomersAsk {
    const ask: CustomersAsk = { size: String(query.size) };
    if (query.q) ask.q = query.q;
    if (query.chip !== "all") ask.chip = query.chip;
    if (query.sort) ask.sort = query.sort;
    if (query.store) ask.store = query.store;
    if (query.page > 1) ask.page = String(query.page);
    return ask;
}

/** Customers' "Ask to remove my data" requests with one status (DEC-172). */
export const customerRequestsRead = defineRead<CustomerRequestsView>()({
    key: (orgId, ask) => domainKey("customers", orgId, "requests", ask),
    route: {
        path: "/api/customers/requests",
        params: { status: z.enum(REQUEST_FILTERS) },
    },
    tier: "records",
});

export type CustomerRequestsAsk = Parameters<
    typeof customerRequestsRead.options
>[1];

export interface CustomerRequestsView {
    /** Null: they couldn't be read; the tab says so. */
    rows: DataRequestRow[] | null;
}

const ID = z.string().regex(/^[\w-]{1,64}$/);

/**
 * One customer's page (`/contacts/<id>`): the detail, their messages, what
 * they'd be offered to link or merge, and their open removal request, each
 * only for a role the page shows it to. A note, a reply or an edit reads
 * it again.
 */
export const customerRead = defineRead<CustomerView>()({
    key: (orgId, { customerId }) =>
        domainKey("customers", orgId, "customer", customerId),
    route: {
        path: "/api/customers/[customerId]",
        params: { customerId: ID },
    },
    tier: "records",
});

export type CustomerAsk = Parameters<typeof customerRead.options>[1];

export interface CustomerView {
    /** `{ mergedInto }`: merged into another record (C9), whose page it is now. */
    detail: CustomerDetail | MergedRedirect;
    /** `message:read` only; null without it. */
    thread: ThreadRead;
    /** `contact:write` or `customer:merge` only; empty without. */
    suggestions: Suggestion[];
    /** `customer:remove` only: their open removal request. */
    dataRequest: DataRequestRow | null;
}
