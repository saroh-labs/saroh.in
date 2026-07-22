import { PageHeader } from "@saroh/ui/page-header";
import { notFound } from "next/navigation";

import { CustomerTimeline } from "@/components/customers/customer-timeline";
import { IdentityLinkDialog } from "@/components/customers/identity-link-dialog";
import { getContact } from "@/lib/contacts/service";
import { getSuggestions, getTimeline } from "@/lib/customer-workspace/service";
import { requireSession } from "@/lib/session";

/**
 * Unified customer workspace (#120). One place to understand a person: their
 * CRM identity plus a chronological, module-gated history (leads, bookings,
 * orders, messages), and the explicit link that connects their commerce record.
 */
export const metadata = { title: "Customer" };

export default async function CustomerWorkspacePage({
    params,
}: {
    params: Promise<{ contactId: string }>;
}) {
    await requireSession();
    const { contactId } = await params;

    const [contact, events, suggestions] = await Promise.all([
        getContact(contactId),
        getTimeline(contactId),
        getSuggestions(contactId),
    ]);
    if (!contact) notFound();

    const name =
        [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
        contact.email;

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title={name}
                description={contact.email}
                actions={
                    <IdentityLinkDialog
                        contactId={contactId}
                        suggestions={suggestions}
                    />
                }
            />
            <CustomerTimeline events={events} />
        </main>
    );
}
