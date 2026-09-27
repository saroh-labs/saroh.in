import { redirect } from "next/navigation";

import { CustomersList } from "@/components/customers/list/customers-list";
import { ListLocked } from "@/components/customers/list/states";
import { PageContainer } from "@/components/shared/page-container";
import { listContacts } from "@/lib/contacts/service";
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
                <div className="max-w-[1100px]">
                    <ListLocked />
                </div>
            </PageContainer>
        );
    }

    const query = allowedQuery(readListQuery(params), may);
    const [page, stores] = await Promise.all([
        getCustomersPage(query),
        // Only for Add customer and Import; without it they are left out.
        listBusinessStores().catch(() => []),
    ]);
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
            />
        </PageContainer>
    );
}
