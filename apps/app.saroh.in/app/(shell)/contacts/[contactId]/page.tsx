import { Badge } from "@saroh/ui/badge";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { DeleteContactMenu } from "@/components/contacts/delete-contact-menu";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import { PageContainer } from "@/components/shared/page-container";
import { getContact } from "@/lib/contacts/service";
import { contactName, formatValue, LEAD_STATUS } from "@/lib/crm/format";
import { formatStatus } from "@/lib/format/status";
import { loadAddLead } from "@/lib/leads/add-lead-data";
import type { LeadStatus } from "@/lib/leads/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Contact" };

/**
 * One person the business knows: who they are, and every lead that is theirs.
 * Edit changes what is known about them; "Add a lead" starts another
 * conversation with them without typing them in again.
 */
export default async function ContactDetailPage({
    params,
}: {
    params: Promise<{ contactId: string }>;
}) {
    const { contactId } = await params;
    await requireSession();

    const [contact, addLead] = await Promise.all([
        getContact(contactId),
        loadAddLead(),
    ]);
    if (!contact) notFound();
    const name = contactName(contact);

    const facts: [string, ReactNode][] = [
        ["Email", contact.email],
        // An empty string is a field someone cleared: shown as not given.
        ["Phone", contact.phone?.trim() ? contact.phone : null],
        ["Company", contact.company?.trim() ? contact.company : null],
        ["Came from", contact.source ? formatStatus(contact.source) : null],
    ];

    return (
        <PageContainer>
            <div className="flex flex-col gap-6">
                <PageHeader
                    className="mb-0"
                    breadcrumb={[
                        <Link
                            key="contacts"
                            href="/contacts"
                            className="hover:text-foreground"
                        >
                            Contacts
                        </Link>,
                        name,
                    ]}
                    title={name}
                    description={
                        contact.company?.trim()
                            ? contact.company
                            : contact.email
                    }
                    actions={
                        <>
                            <EditContactDialog
                                contactId={contact.id}
                                initial={{
                                    firstName: contact.firstName ?? "",
                                    lastName: contact.lastName ?? "",
                                    phone: contact.phone ?? "",
                                    company: contact.company ?? "",
                                }}
                            />
                            <AddLeadDialog
                                // Only this person: the lead is theirs.
                                contacts={[
                                    {
                                        id: contact.id,
                                        name,
                                        email: contact.email,
                                    },
                                ]}
                                stages={addLead.stages}
                            />
                            <DeleteContactMenu
                                contactId={contact.id}
                                name={name}
                                leadCount={contact.leads.length}
                            />
                        </>
                    }
                />

                <section className="overflow-hidden rounded-[12px] border border-border bg-card">
                    <h2 className="border-b border-muted px-4 py-[13px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Details
                    </h2>
                    <dl className="grid gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
                        {facts.map(([label, value]) => (
                            <div key={label} className="min-w-0">
                                <dt className="text-[11.5px] text-muted-foreground">
                                    {label}
                                </dt>
                                <dd className="truncate">
                                    {value ?? (
                                        <span className="text-muted-foreground">
                                            Not given
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <section className="overflow-hidden rounded-[12px] border border-border bg-card">
                    <h2 className="border-b border-muted px-4 py-[13px] text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Leads · {contact.leads.length}
                    </h2>
                    {contact.leads.length === 0 ? (
                        <p className="text-pretty px-4 py-3.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                            No leads for {name} yet. An enquiry from them lands
                            here, or add one above.
                        </p>
                    ) : (
                        <ul>
                            {contact.leads.map((lead) => {
                                const amount = formatValue(lead.value);
                                const status =
                                    lead.status in LEAD_STATUS
                                        ? LEAD_STATUS[lead.status as LeadStatus]
                                        : LEAD_STATUS.OPEN;
                                return (
                                    <li
                                        key={lead.id}
                                        className="border-b border-foreground/10 last:border-b-0"
                                    >
                                        <Link
                                            href={`/leads/${lead.id}`}
                                            className="flex items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13.5px] font-medium">
                                                    {lead.title}
                                                </span>
                                                <span className="block text-[11.5px] text-muted-foreground">
                                                    {lead.pipeline?.name ??
                                                        "Pipeline"}
                                                    {amount
                                                        ? ` · worth ${amount}`
                                                        : ""}
                                                </span>
                                            </span>
                                            {lead.stage ? (
                                                <Badge variant="neutral">
                                                    {lead.stage.name}
                                                </Badge>
                                            ) : null}
                                            <Badge variant={status.variant}>
                                                {status.label}
                                            </Badge>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>
        </PageContainer>
    );
}
