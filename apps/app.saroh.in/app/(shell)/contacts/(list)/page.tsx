import { readBusinessCurrency } from "@/lib/organizations/business-currency";

import { ContactsContainer } from "@/components/contacts/contacts-container";
import { PageContainer } from "@/components/shared/page/page-container";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Contacts index for the active organization (S3-005).
 *
 * `ContactsView` decides how to render: sorting, search, density and the
 * empty state all live in the shared `DataView`.
 *
 * On React Query (DEC-259), loaded in the browser: the gates (the layout's
 * CRM `ModuleGate`, whether this role adds contacts) and the currency are
 * the page's; the contacts (`/api/contacts`) are `ContactsContainer`'s
 * query, read from the browser into the frame drawn at once.
 */
export const metadata = { title: "Contacts" };

export default async function ContactsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [params, organization, currency] = await Promise.all([
        searchParams,
        resolveActiveOrganization(),
        // What open leads are worth is in the business's currency.
        readBusinessCurrency(),
    ]);
    // A Member reads contacts but adds none (DEC-020).
    const canAdd = organization?.actions
        ? organization.actions.includes("contact:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";

    return (
        // A list takes the whole work area, as every list does.
        <PageContainer width="full">
            <ContactsContainer
                canAdd={canAdd}
                // `?new=1` opens New contact: where setup lands someone who
                // chose to keep track of people first.
                openOnArrival={params.new === "1"}
                currency={currency}
                initialView={viewParam(params)}
            />
        </PageContainer>
    );
}
