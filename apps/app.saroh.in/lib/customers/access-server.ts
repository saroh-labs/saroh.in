import "server-only";

import { listContacts } from "@/lib/contacts/service";
import { listDataRequests } from "@/lib/customer-workspace/data-requests";
import { openRequestFor } from "@/lib/customer-workspace/data-requests-view";
import { getCustomerDetail } from "@/lib/customer-workspace/detail";
import type { Suggestion } from "@/lib/customer-workspace/service";
import { getSuggestions, getThread } from "@/lib/customer-workspace/service";
import type { ThreadRead } from "@/lib/customer-workspace/view";
import type { Organization } from "@/lib/organizations/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import { allowedQuery, listMay, readListQuery } from "./list";
import { getCustomersPage } from "./list-service";
import type {
    CustomerAsk,
    CustomerRequestsAsk,
    CustomerRequestsView,
    CustomersAsk,
    CustomersListView,
    CustomerView,
} from "./queries";
import {
    customerRead,
    customerRequestsRead,
    customersListRead,
} from "./queries";

/**
 * Who reads Customers (DEC-259), asked by `/api/customers/*`: what the
 * pages ask. Without resolved permissions (an older response) the built-in
 * Owner and Admin roles decide, as the person page does; the API stays the
 * authority on every read.
 */
function mayFor(
    organization: Pick<Organization, "role" | "actions"> | null,
): (action: string) => boolean {
    return (action) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

const mayOnce = async () => mayFor(await activeOrganizationOnce());

/** The list and a customer's page: `contact:read` (a Reviewer has none). */
export async function mayReadCustomers(): Promise<boolean> {
    return (await mayOnce())("contact:read");
}

/** The removal requests: `customer:remove` as well. */
export async function mayReadCustomerRequests(): Promise<boolean> {
    const may = await mayOnce();
    return may("contact:read") && may("customer:remove");
}

/** A page of the list; null (a 404) with no business to list. */
export async function readCustomersList(
    ask: CustomersAsk,
): Promise<CustomersListView | null> {
    const query = allowedQuery(
        readListQuery(ask),
        listMay((await activeOrganizationOnce())?.actions),
    );
    const page = await getCustomersPage(query);
    if (!page) return null;
    // "Open Contacts (N)" only matters to a business with no customers.
    const contacts =
        page.everyone === 0
            ? await listContacts()
                  .then((c) => c.length)
                  .catch(() => null)
            : null;
    return { page, contacts };
}

export async function readCustomerRequests({
    status,
}: CustomerRequestsAsk): Promise<CustomerRequestsView> {
    return { rows: await listDataRequests(status) };
}

/**
 * One customer's page; null (a 404): no such contact in this business. What
 * each part shows is the API's; a part this role isn't shown isn't read.
 */
export async function readCustomerView({
    customerId,
}: CustomerAsk): Promise<CustomerView | null> {
    const may = await mayOnce();
    const [detail, thread, suggestions, open] = await Promise.all([
        getCustomerDetail(customerId),
        // A failed read shows the tab with the failure said, never an
        // empty thread.
        may("message:read")
            ? getThread(customerId).catch((): ThreadRead => "failed")
            : Promise.resolve<ThreadRead>(null),
        // Only whoever may link or merge reads what they'd be offered.
        may("contact:write") || may("customer:merge")
            ? getSuggestions(customerId, { includeContacts: true }).catch(
                  (): Suggestion[] => [],
              )
            : Promise.resolve<Suggestion[]>([]),
        may("customer:remove")
            ? listDataRequests("open")
            : Promise.resolve(null),
    ]);
    if (!detail) return null;
    return {
        detail,
        thread,
        suggestions,
        dataRequest: openRequestFor(open, customerId),
    };
}

export const customersListServer: ServerRead<CustomersAsk, CustomersListView> =
    { read: customersListRead, service: readCustomersList };

export const customerRequestsServer: ServerRead<
    CustomerRequestsAsk,
    CustomerRequestsView
> = { read: customerRequestsRead, service: readCustomerRequests };

export const customerServer: ServerRead<CustomerAsk, CustomerView> = {
    read: customerRead,
    service: readCustomerView,
};
