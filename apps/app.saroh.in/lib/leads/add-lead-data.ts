import type { LeadContactOption } from "@/components/leads/add-lead-dialog";
import { listContacts } from "@/lib/contacts/service";
import { contactName } from "@/lib/crm/format";
import type { Pipeline } from "@/lib/pipelines/service";
import { listPipelines } from "@/lib/pipelines/service";

/**
 * What "Add a lead" needs: who it could be for, and where it can start. A
 * failed read is an empty list — the dialog then offers "Someone new" only,
 * which still works.
 */
export async function loadAddLead(pipelines?: Pipeline[]): Promise<{
    contacts: LeadContactOption[];
    stages: { id: string; name: string }[];
}> {
    const [contacts, all] = await Promise.all([
        listContacts().catch(() => []),
        pipelines ?? listPipelines().catch(() => []),
    ]);
    const pipeline = all.find((p) => p.isDefault) ?? all.at(0);
    return {
        contacts: contacts.map((c) => ({
            id: c.id,
            name: contactName(c),
            email: c.email,
        })),
        stages: (pipeline?.stages ?? [])
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((s) => ({ id: s.id, name: s.name })),
    };
}
