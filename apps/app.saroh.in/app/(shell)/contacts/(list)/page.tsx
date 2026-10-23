import { readBusinessCurrency } from "@/lib/organizations/business-currency";
import { countLabel, PageHeader } from "@saroh/ui/page-header";

import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ContactsView } from "@/components/contacts/contacts-view";
import { PageContainer } from "@/components/shared/page/page-container";
import { listContacts } from "@/lib/contacts/service";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import { viewParam } from "@/lib/views/search-params";

/**
 * Contacts index for the active organization (S3-005).
 *
 * The page fetches; `ContactsView` decides how to render. Sorting, search,
 * density and the empty state all live in the shared `DataView`, so this file
 * stays a data boundary rather than accumulating a fourth slightly-different
 * implementation of a list.
 */
export const metadata = { title: "Contacts" };

export default async function ContactsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireSession();

    const [contacts, params, organization, currency] = await Promise.all([
        listContacts(),
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
            <PageHeader
                breadcrumb={["Contacts"]}
                title="Contacts"
                count={countLabel(contacts.length, {
                    one: "contact",
                    other: "contacts",
                })}
                description="Everyone who has enquired, booked or bought, and anyone you add."
                actions={
                    canAdd ? (
                        // `?new=1` opens it: where setup lands someone who
                        // chose to keep track of people first.
                        <AddContactDialog openOnArrival={params.new === "1"} />
                    ) : undefined
                }
            />
            <div className="mt-6">
                <ContactsView
                    contacts={contacts}
                    currency={currency}
                    initialView={viewParam(params)}
                />
            </div>
        </PageContainer>
    );
}
