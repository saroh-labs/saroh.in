import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/empty-state";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import type { Contact } from "@/lib/contacts/service";
import { listContacts } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";
import { requireSession } from "@/lib/session";

/**
 * Contacts index for the active organization (S3-005). Lists the org's CRM
 * contacts (newest first); each card links to the contact detail. Mirrors the
 * sites index list-page shell.
 */
export default async function ContactsPage() {
    await requireSession();

    const contacts: Contact[] = await listContacts();

    return (
        <main className="mx-auto max-w-5xl p-8">
            <PageHeader
                title="Contacts"
                description="People and companies in your CRM."
            />

            {contacts.length === 0 ? (
                <EmptyState
                    title="No contacts yet"
                    description="Contacts appear here as enquiries come in, or when you create a lead by hand from a contact."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {contacts.map((contact) => (
                        <Link key={contact.id} href={`/contacts/${contact.id}`}>
                            <Card className="transition-colors hover:bg-muted/40">
                                <CardHeader>
                                    <CardTitle>
                                        {contactName(contact)}
                                    </CardTitle>
                                    <CardDescription>
                                        {contact.email}
                                        {contact.company
                                            ? ` · ${contact.company}`
                                            : ""}
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
