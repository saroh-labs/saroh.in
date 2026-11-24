import { rememberedPageSize } from "@/lib/paging/remembered";

import { RequestsContainer } from "@/components/customers/data-requests/requests-container";
import { CustomersContainer } from "@/components/customers/list/customers-container";
import { ListHeading, ListLocked } from "@/components/customers/list/states";
import { PageContainer } from "@/components/shared/page/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { listBusinessStores } from "@/lib/stores/service";

import Loading from "./loading";

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
 *
 * On React Query (DEC-259), loaded in the browser: the gate and the
 * storefronts (Add customer, Import) are the page's; the page of the list
 * as the address asks (`/api/customers`) and the open requests
 * (`/api/customers/requests`) are the containers' queries, read from the
 * browser behind the route's loader, and every later one in place.
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

    if (!organization) {
        throw new Error("No active business to list customers for");
    }

    // Customers' removal requests (DEC-172): only for whoever can act on them.
    const canRemove = may("customer:remove");
    if (canRemove && params.tab === "requests") {
        return (
            <RequestsContainer
                skeleton={<Loading />}
                heading={<ListHeading count={null} />}
                canRemove={canRemove}
            />
        );
    }

    const [defaultSize, stores] = await Promise.all([
        rememberedPageSize("customers"),
        // Only for Add customer and Import; without it they are left out.
        listBusinessStores().catch(() => []),
    ]);

    return (
        <CustomersContainer
            skeleton={<Loading />}
            defaultSize={defaultSize}
            actions={organization.actions ?? null}
            canRemove={canRemove}
            stores={stores.map((s) => ({ id: s.id, name: s.name }))}
            canLink={may("contact:write")}
        />
    );
}
