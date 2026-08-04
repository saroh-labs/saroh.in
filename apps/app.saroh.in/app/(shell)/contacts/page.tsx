import { PageHeader } from "@saroh/ui/page-header";

import { ContactsView } from "@/components/contacts/contacts-view";
import type { Contact } from "@/lib/contacts/service";
import { listContacts } from "@/lib/contacts/service";
import { requireSession } from "@/lib/session";

/**
 * Contacts index for the active organization (S3-005).
 *
 * The page fetches; `ContactsView` decides how to render. Sorting, search,
 * density and the empty state all live in the shared `DataView`, so this file
 * stays a data boundary rather than accumulating a fourth slightly-different
 * implementation of a list.
 */
export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
    await requireSession();

    const contacts: Contact[] = await listContacts();

    return (
        // Wider than the old `max-w-5xl`: this is a table now, and a dashboard
        // that reserves a third of a monitor for margin is wasting the density
        // the merchant came for.
        <main className="mx-auto w-full max-w-7xl p-6 sm:p-8">
            <PageHeader
                title="Contacts"
                description="Everyone who has enquired, booked or bought."
            />
            <div className="mt-6">
                <ContactsView contacts={contacts} />
            </div>
        </main>
    );
}
