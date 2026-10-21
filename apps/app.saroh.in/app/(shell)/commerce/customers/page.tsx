import { rememberedPageSize } from "@/lib/paging/remembered";
import { redirect } from "next/navigation";

import { CustomersTabs } from "@/components/customers/data-requests/customers-tabs";
import { OpenRequestsBanner } from "@/components/customers/data-requests/open-requests-banner";
import { RequestsView } from "@/components/customers/data-requests/requests-view";
import { CustomersList } from "@/components/customers/list/customers-list";
import { ListHeading, ListLocked } from "@/components/customers/list/states";
import { PageContainer } from "@/components/shared/page-container";
import { listContacts } from "@/lib/contacts/service";
import { listDataRequests } from "@/lib/customer-workspace/data-requests";
import { readRequestFilter } from "@/lib/customer-workspace/data-requests-view";
import { allowedQuery, listHref, readListQuery } from "@/lib/customers/list";
import { getCustomersPage } from "@/lib/customers/list-service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

/**
 * Sell → Customers (DEC-041, round 2 C4): the business's customers — everyone
 * who has paid or signs in on its website — keyed on the contact and read a
 * page at a time from `GET organizations/:org/customers` (C3).
 *
 * The address says what the list shows (`?q=`, `?chip=`, `?sort=`,
 * `?store=`, `?page=`). The list read failing fails the page (its error
 * boundary, with Try again) — never an empty list. A role without
 * `contact:read` is told so, with who can change it.
 *
 * `?tab=requests` (DEC-172, #1107) is customers' "Ask to remove my data"
 * requests (`?status=open|done|closed|all`), for whoever can run a
 * customer removal (`customer:remove`); they also see the list's banner
 * while any are open. A requests read that fails says so on its tab, and
 * leaves the list as it is.
 */
export const metadata = { title: "Customers" };

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();
    const [params, organization] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
    ]);
    // From what the API resolved this person may do; a response that
    // predates permissions leaves the API to decide.
    const may = (action: string) =>
        organization?.actions ? organization.actions.includes(action) : true;

    if (!may("contact:read")) {
        return (
            <PageContainer width="full">
                <div>
                    <ListLocked />
                </div>
            </PageContainer>
        );
    }

    // Customers' removal requests (DEC-172): only for whoever can act on them.
    const canRemove = may("customer:remove");
    // Read beside the list, not before it.
    const reading = canRemove
        ? listDataRequests("open")
        : Promise.resolve(null);
    const tabsFor = (
        active: "customers" | "requests",
        openCount: number | null,
    ) =>
        canRemove ? (
            <CustomersTabs active={active} openRequests={openCount} />
        ) : null;

    if (canRemove && params.tab === "requests") {
        const filter = readRequestFilter(params.status);
        const [openRequests, others] = await Promise.all([
            reading,
            filter === "open" ? null : listDataRequests(filter),
        ]);
        const rows = filter === "open" ? openRequests : others;
        return (
            <PageContainer width="full">
                <RequestsView
                    heading={<ListHeading count={null} />}
                    tabs={tabsFor(
                        "requests",
                        openRequests ? openRequests.length : null,
                    )}
                    filter={filter}
                    rows={rows}
                    canRemove={canRemove}
                />
            </PageContainer>
        );
    }

    const query = allowedQuery(
        readListQuery(params, await rememberedPageSize("customers")),
        may,
    );
    const [page, stores, openRequests] = await Promise.all([
        getCustomersPage(query),
        // Only for Add customer and Import; without it they are left out.
        listBusinessStores().catch(() => []),
        reading,
    ]);
    const openCount = openRequests ? openRequests.length : null;
    if (!page) {
        // A storefront that isn't this business's is a 404 from the API:
        // no filter, rather than no page.
        if (query.store) redirect(listHref(query, { store: null }));
        throw new Error("No active business to list customers for");
    }
    // "Open Contacts (N)" only matters to a business with no customers.
    const contacts =
        page.everyone === 0
            ? await listContacts()
                  .then((c) => c.length)
                  .catch(() => null)
            : null;

    return (
        <PageContainer width="full">
            <CustomersList
                query={query}
                page={page}
                stores={stores.map((s) => ({ id: s.id, name: s.name }))}
                contacts={contacts}
                canLink={may("contact:write")}
                tabs={tabsFor("customers", openCount)}
                banner={<OpenRequestsBanner count={openCount} />}
            />
        </PageContainer>
    );
}
