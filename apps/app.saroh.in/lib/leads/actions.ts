"use server";

import type { UpdateLeadInput } from "./service";
import {
    completeTask as completeTaskApi,
    createTask as createTaskApi,
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
 */

export async function updateLead(leadId: string, input: UpdateLeadInput) {
    return updateLeadApi(leadId, input);
}

export async function moveLead(leadId: string, stageId: string) {
    return moveLeadApi(leadId, stageId);
}

export async function logActivity(leadId: string, body: string) {
    return logActivityApi(leadId, body);
}

export async function createTask(
    leadId: string,
    input: { body: string; dueAt: string },
) {
    return createTaskApi(leadId, input);
}

export async function completeTask(leadId: string, activityId: string) {
    return completeTaskApi(leadId, activityId);
}
