import { z } from "zod";

import type { LeadContactOption } from "@/components/leads/add-lead-dialog";
import type { ConsentStatus, MessageChannel } from "@/lib/messages/constants";
import type { LeadMessage, MessageDelivery } from "@/lib/messages/service";
import type { Pipeline } from "@/lib/pipelines/service";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { LeadDetail, LeadListItem, OpenTask } from "./service";

/**
 * Leads' reads (DEC-259): the list with its follow-ups, the Pipeline board
 * and one lead's page. One domain: a lead's change shows on all three.
 * Client-safe: the keys and the routes; the services are paired in
 * `access.ts`.
 */

/** Every Leads read of a business: what a lead or stage change reads again. */
export const leadsKeys = (orgId: string): DomainKey =>
    domainKey("leads", orgId);

/** What "Add a lead" offers; null for whoever may not add one (`lead:write`). */
export interface AddLead {
    contacts: LeadContactOption[];
    stages: { id: string; name: string }[];
    currency: string;
}

/** `/leads`: the leads, the open follow-ups (null: unread) and Add a lead. */
export interface LeadsListView {
    leads: LeadListItem[];
    tasks: OpenTask[] | null;
    addLead: AddLead | null;
}

export const leadsListRead = defineRead<LeadsListView>()({
    key: (orgId) => domainKey("leads", orgId, "list"),
    route: { path: "/api/leads", params: {} },
    tier: "records",
});

/** `/pipeline`: the default (or first) pipeline, its leads and Add a lead. */
export interface PipelineView {
    /** Null: the business has no pipeline yet. */
    pipeline: Pipeline | null;
    leads: LeadListItem[];
    addLead: AddLead | null;
}

export const pipelineRead = defineRead<PipelineView>()({
    key: (orgId) => domainKey("leads", orgId, "pipeline"),
    route: { path: "/api/pipeline", params: {} },
    tier: "records",
});

/** A message as the lead's page shows it: no provider or its message id. */
export type ShownMessage = Omit<LeadMessage, "deliveries"> & {
    deliveries: Pick<MessageDelivery, "status" | "error" | "updatedAt">[];
};

/** One lead's page: the lead, its messages and its contact's consent per channel. */
export interface LeadView {
    lead: LeadDetail;
    messages: ShownMessage[];
    consent: Partial<Record<MessageChannel, ConsentStatus>>;
}

export const leadRead = defineRead<LeadView>()({
    key: (orgId, { leadId }) => domainKey("leads", orgId, "lead", leadId),
    route: {
        path: "/api/leads/[leadId]",
        params: { leadId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "records",
});

export type LeadAsk = Parameters<typeof leadRead.options>[1];
