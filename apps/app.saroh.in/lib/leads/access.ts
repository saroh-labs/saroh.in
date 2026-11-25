import "server-only";

import { canOrUnknown } from "@/lib/access/require-can";
import { mayReadContacts } from "@/lib/contacts/access";
import { listContactConsents, listLeadMessages } from "@/lib/messages/service";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { listPipelines } from "@/lib/pipelines/service";
import type { ServerRead } from "@/lib/query/route";

import { loadAddLead } from "./add-lead-data";
import type {
    AddLead,
    LeadAsk,
    LeadsListView,
    LeadView,
    PipelineView,
} from "./queries";
import { leadRead, leadsListRead, pipelineRead } from "./queries";
import { getLead, listLeads, listOpenTasks } from "./service";

/**
 * Leads' reads on the server (DEC-259): what `/api/leads`, `/api/pipeline`
 * and `/api/leads/[leadId]` answer with. Their gate is the pages': CRM
 * reachable (the layouts' `ModuleGate`) and `lead:read`; the API refuses a
 * role without leads on every call too, a 403 the route passes on.
 */
export async function mayReadLeads(): Promise<boolean> {
    const [crm, organization] = await Promise.all([
        mayReadContacts(),
        activeOrganizationOnce(),
    ]);
    return crm && canOrUnknown(organization, "lead:read");
}

/** `lead:write` adds a lead (`leads.service.ts`): only then is Add a lead read. */
async function mayAdd(): Promise<boolean> {
    return canOrUnknown(await activeOrganizationOnce(), "lead:write");
}

type NoAsk = Parameters<typeof leadsListRead.options>[1];

async function readLeadsList(): Promise<LeadsListView> {
    const [leads, tasks, addLead] = await Promise.all([
        listLeads(),
        // Null: the tab says they couldn't be read, never "none".
        listOpenTasks().catch(() => null),
        mayAdd().then((may): Promise<AddLead> | null =>
            may ? loadAddLead() : null,
        ),
    ]);
    return { leads, tasks, addLead };
}

/** The default pipeline (or the first) drives the board when several exist. */
async function readPipeline(): Promise<PipelineView> {
    const [pipelines, may] = await Promise.all([listPipelines(), mayAdd()]);
    const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines.at(0);
    // Adding a lead makes the pipeline (the API's `ensureDefault`), so the
    // empty board still offers it.
    const [leads, addLead] = await Promise.all([
        pipeline ? listLeads({ pipelineId: pipeline.id }) : [],
        may ? loadAddLead(pipelines) : null,
    ]);
    return { pipeline: pipeline ?? null, leads, addLead };
}

/** One lead; null (a 404): no such lead in this business. */
async function readLead({ leadId }: LeadAsk): Promise<LeadView | null> {
    const lead = await getLead(leadId);
    if (!lead) return null;
    const contactId = lead.contact?.id ?? null;
    const [messages, consents] = await Promise.all([
        listLeadMessages(lead.id),
        contactId ? listContactConsents(contactId) : [],
    ]);
    return {
        lead,
        // Never the provider or its message id: the page shows the state.
        messages: messages.map(({ deliveries, ...m }) => ({
            ...m,
            deliveries: deliveries.map((d) => ({
                status: d.status,
                error: d.error,
                updatedAt: d.updatedAt,
            })),
        })),
        consent: Object.fromEntries(consents.map((c) => [c.channel, c.status])),
    };
}

export const leadsListServer: ServerRead<NoAsk, LeadsListView> = {
    read: leadsListRead,
    service: readLeadsList,
};

export const pipelineServer: ServerRead<NoAsk, PipelineView> = {
    read: pipelineRead,
    service: readPipeline,
};

export const leadServer: ServerRead<LeadAsk, LeadView> = {
    read: leadRead,
    service: readLead,
};
