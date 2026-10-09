import { Badge } from "@saroh/ui/badge";
import Link from "next/link";

import { AddLeadDialog } from "@/components/leads/add-lead-dialog";
import type { ContactDetail } from "@/lib/contacts/service";
import { formatValue, LEAD_STATUS } from "@/lib/crm/format";
import type { LeadStatus } from "@/lib/leads/service";

import { ContactPanelSection } from "./contact-panel";

/**
 * Every lead that is theirs, on the person page's Leads tab (#869): the
 * pipeline and stage, what it is worth and where it stands; each opens the
 * lead. "Add a lead" starts another conversation with them without typing
 * them in again — for whoever may change contacts, and never for someone
 * whose details were removed.
 */
export function LeadsPanel({
    person,
    leads,
    stages,
}: {
    person: { id: string; name: string; email: string };
    /** Null when they could not be read. */
    leads: ContactDetail["leads"] | null;
    /** Stages for "Add a lead"; null when this viewer may not add one. */
    stages: { id: string; name: string }[] | null;
}) {
    return (
        <ContactPanelSection
            title="Leads"
            count={leads ? leads.length : null}
            failed="Their leads"
            empty={`No leads for ${person.name} yet. An enquiry from them lands here${stages ? ", or add one" : ""}.`}
            action={
                stages ? (
                    <AddLeadDialog
                        // Only this person: the lead is theirs.
                        contacts={[person]}
                        stages={stages}
                        variant="outline"
                        size="sm"
                    />
                ) : null
            }
        >
            <ul>
                {(leads ?? []).map((lead) => {
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
                                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring coarse:min-h-11"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[13.5px] font-medium">
                                        {lead.title}
                                    </span>
                                    <span className="block text-[11.5px] text-muted-foreground">
                                        {lead.pipeline?.name ?? "Pipeline"}
                                        {amount ? ` · worth ${amount}` : ""}
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
        </ContactPanelSection>
    );
}
