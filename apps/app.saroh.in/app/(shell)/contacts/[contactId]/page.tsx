import { Badge } from "@saroh/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@saroh/ui/card";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getContact } from "@/lib/contacts/service";
import { contactName, formatValue } from "@/lib/crm/format";
import { requireSession } from "@/lib/session";

/**
 * Contact detail (S3-005): the contact's attributes plus every lead attached to
 * it (newest first, each showing its current stage + status). Resolves via the
 * API (notFound when missing / not permitted). Read-only view — editing lives
 * on the lead detail / a later ticket.
 */
export default async function ContactDetailPage({
    params,
}: {
    params: Promise<{ contactId: string }>;
}) {
    const { contactId } = await params;
    await requireSession();

    const contact = await getContact(contactId);
    if (!contact) notFound();

    return (
        <main className="mx-auto max-w-3xl p-8">
            <PageHeader
                title={contactName(contact)}
                description={contact.email}
            />

            <div className="mb-8">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    {contact.company && (
                        <div>
                            <dt className="text-muted-foreground">Company</dt>
                            <dd>{contact.company}</dd>
                        </div>
                    )}
                    {contact.phone && (
                        <div>
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>{contact.phone}</dd>
                        </div>
                    )}
                    {contact.source && (
                        <div>
                            <dt className="text-muted-foreground">Source</dt>
                            <dd>{contact.source}</dd>
                        </div>
                    )}
                </dl>
            </div>

            <h2 className="mb-3 text-lg font-semibold">
                Leads ({contact.leads.length})
            </h2>
            {contact.leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No leads for this contact yet.
                </p>
            ) : (
                <div className="grid gap-3">
                    {contact.leads.map((lead) => {
                        const amount = formatValue(lead.value);
                        return (
                            <Link key={lead.id} href={`/leads/${lead.id}`}>
                                <Card className="transition-colors hover:bg-muted/40">
                                    <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
                                        <div>
                                            <CardTitle className="text-base">
                                                {lead.title}
                                            </CardTitle>
                                            <CardDescription>
                                                {lead.pipeline?.name ??
                                                    "Pipeline"}
                                                {amount ? ` · ${amount}` : ""}
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {lead.stage && (
                                                <Badge variant="secondary">
                                                    {lead.stage.name}
                                                </Badge>
                                            )}
                                            <Badge
                                                variant={
                                                    lead.status === "WON"
                                                        ? "default"
                                                        : lead.status === "LOST"
                                                          ? "destructive"
                                                          : "outline"
                                                }
                                            >
                                                {lead.status}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                </Card>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}
