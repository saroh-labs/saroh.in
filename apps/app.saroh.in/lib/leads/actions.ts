"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { CreateLeadInput, UpdateLeadInput } from "./service";
import {
    completeTask as completeTaskApi,
    createLead as createLeadApi,
    createTask as createTaskApi,
    deleteLead as deleteLeadApi,
    logActivity as logActivityApi,
    moveLead as moveLeadApi,
    updateLead as updateLeadApi,
} from "./service";

/**
 * Server Actions for CRM Lead mutations (S3-005). Thin wrappers that forward
 * the session cookie + active-org header to api.saroh.in (via the service); the
 * api resolves the caller from the session and enforces `lead:write`. The move
 * action is what the pipeline board + lead detail call to advance a lead's
 * stage; the api validates the target stage + logs a STAGE_CHANGED activity
 * atomically. Client components call these — never the api or the DB directly.
 *
 * Each takes the tab's business last (DEC-259): refused when another one
 * was opened since (`writeAsOrg`); nothing is revalidated, the screens read
 * their queries again (`useLeadsSave`).
 */

export async function createLead(input: CreateLeadInput, orgId: string) {
    return writeAsOrg(orgId, () => createLeadApi(input));
}

export async function updateLead(
    leadId: string,
    input: UpdateLeadInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => updateLeadApi(leadId, input));
}

export async function deleteLead(leadId: string, orgId: string) {
    return writeAsOrg(orgId, () => deleteLeadApi(leadId));
}

export async function moveLead(leadId: string, stageId: string, orgId: string) {
    return writeAsOrg(orgId, () => moveLeadApi(leadId, stageId));
}

export async function logActivity(leadId: string, body: string, orgId: string) {
    return writeAsOrg(orgId, () => logActivityApi(leadId, body));
}

export async function createTask(
    leadId: string,
    input: { body: string; dueAt: string },
    orgId: string,
) {
    return writeAsOrg(orgId, () => createTaskApi(leadId, input));
}

export async function completeTask(
    leadId: string,
    activityId: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => completeTaskApi(leadId, activityId));
}
