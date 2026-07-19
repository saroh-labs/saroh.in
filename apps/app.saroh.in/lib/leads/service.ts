import type { CrmResult } from "@/lib/crm/http";
import { apiFetch, mutate, orgBase } from "@/lib/crm/http";

/**
 * CRM Leads data access for app.saroh.in (S3-005). Org-scoped list / detail /
 * create / edit / move, reached only through api.saroh.in (the app never
 * touches the DB). Server-only: the underlying HTTP plumbing imports
 * next/headers.
 */

export type LeadStatus = "OPEN" | "WON" | "LOST";

export interface LeadContact {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    phone: string | null;
}

export interface LeadStage {
    id: string;
    name: string;
    order: number;
}

/** A lead as returned by the list endpoint (its contact + current stage). */
export interface LeadListItem {
    id: string;
    title: string;
    status: LeadStatus;
    value: number | null;
    pipelineId: string;
    stageId: string;
    createdAt: string;
    contact: LeadContact | null;
    stage: LeadStage | null;
}

export interface LeadActivity {
    id: string;
    type: string;
    body: string | null;
    actorUserId: string | null;
    createdAt: string;
}

/** A lead's full detail: contact, pipeline (+ stages), stage, timeline. */
export interface LeadDetail {
    id: string;
    title: string;
    status: LeadStatus;
    value: number | null;
    pipelineId: string;
    stageId: string;
    createdAt: string;
    contact: LeadContact | null;
    stage: LeadStage | null;
    pipeline: { id: string; name: string; stages: LeadStage[] } | null;
    activities: LeadActivity[];
}

export interface CreateLeadInput {
    contactId?: string;
    contact?: {
        email: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        company?: string;
    };
    pipelineId?: string;
    stageId?: string;
    title: string;
    value?: number;
}

export interface UpdateLeadInput {
    title?: string;
    status?: LeadStatus;
    value?: number;
}

/** The org's leads (newest first), optionally filtered. Empty on any failure. */
export async function listLeads(filter?: {
    pipelineId?: string;
    stageId?: string;
}): Promise<LeadListItem[]> {
    const base = await orgBase();
    if (!base) return [];
    const qs = new URLSearchParams();
    if (filter?.pipelineId) qs.set("pipelineId", filter.pipelineId);
    if (filter?.stageId) qs.set("stageId", filter.stageId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await apiFetch(`${base}/leads${suffix}`);
    if (!res.ok) return [];
    return (await res.json()) as LeadListItem[];
}

/** A lead + contact + pipeline stages + activity timeline, or null. */
export async function getLead(leadId: string): Promise<LeadDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/leads/${leadId}`);
    if (!res.ok) return null;
    return (await res.json()) as LeadDetail;
}

/** Hand-create a lead. Returns the new id. */
export function createLead(
    input: CreateLeadInput,
): Promise<CrmResult<{ id: string }>> {
    return mutate<{ id: string }>(
        "/leads",
        "POST",
        input,
        "Could not create the lead",
    );
}

/** Patch a lead's title / status / value. */
export function updateLead(
    leadId: string,
    input: UpdateLeadInput,
): Promise<CrmResult<{ id: string }>> {
    return mutate<{ id: string }>(
        `/leads/${leadId}`,
        "PATCH",
        input,
        "Could not update the lead",
    );
}

/** Move a lead to another stage of its pipeline. */
export function moveLead(
    leadId: string,
    stageId: string,
): Promise<CrmResult<{ id: string; stageId: string }>> {
    return mutate<{ id: string; stageId: string }>(
        `/leads/${leadId}/move`,
        "POST",
        { stageId },
        "Could not move the lead",
    );
}
