"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminFetch, adminWrite, readError } from "./control-plane";
import type {
    ContactKind,
    LeadCard,
    LeadContact,
    LeadDetail,
    LeadManager,
    LeadStage,
} from "./saroh-lead-words";

/**
 * Saroh's own sales leads (DEC-169, admin console U20): the lead sheet's
 * reads and every write. The API decides who may do what and records each
 * write on the ledger; these only forward, with the sheet's idempotency key,
 * and hand back the API's own reason when it refuses.
 */

const lead = (id: string) => `/saroh-leads/${encodeURIComponent(id)}`;

async function read<T>(
    path: string,
    fallback: string,
): Promise<ControlPlaneResult<T>> {
    const res = await adminFetch(path);
    if (!res.ok) {
        return {
            ok: false,
            error: await readError(res, fallback),
            status: res.status,
        };
    }
    return { ok: true, data: (await res.json()) as T };
}

async function write<T>(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    fallback: string,
): Promise<ControlPlaneResult<T>> {
    const result = await adminWrite<T>(path, method, body, fallback);
    if (result.ok) revalidatePath("/leads");
    return result;
}

/** One lead with its calls and visits, for the sheet. */
export async function readLeadAction(id: string) {
    return read<LeadDetail>(lead(id), "Could not open this lead.");
}

/** The businesses signed up with this lead's email, for Won. */
export async function wonCandidatesAction(id: string) {
    return read<{ id: string; name: string }[]>(
        `${lead(id)}/won-candidates`,
        "Could not find the businesses for this lead.",
    );
}

/** Who a lead may be given to. Support and Platform owner. */
export async function leadManagersAction() {
    return read<LeadManager[]>(
        "/saroh-leads/managers",
        "Could not list the account managers.",
    );
}

export interface LeadFields {
    name: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    notes?: string | null;
    followUpOn?: string | null;
}

/** Add a lead. A manager owns what they add. */
export async function addLeadAction(
    input: LeadFields & { idempotencyKey: string },
) {
    return write<LeadCard>(
        "/saroh-leads",
        "POST",
        input,
        "Could not add the lead.",
    );
}

/** Change a lead's details. */
export async function updateLeadAction(
    input: Partial<LeadFields> & {
        id: string;
        signUpEmail?: string | null;
        idempotencyKey: string;
    },
) {
    const { id, ...body } = input;
    return write<LeadCard>(lead(id), "PATCH", body, "Could not save the lead.");
}

/** Move a lead to a stage: Won names the business, Lost says why. */
export async function moveLeadStageAction(input: {
    id: string;
    stage: LeadStage;
    organizationId?: string;
    lostReason?: string;
    idempotencyKey: string;
}) {
    const { id, ...body } = input;
    return write<LeadCard>(
        `${lead(id)}/stage`,
        "POST",
        body,
        "Could not move the lead.",
    );
}

/** Give an unowned lead to an account manager, with a reason. */
export async function assignLeadAction(input: {
    id: string;
    platformAdminId: string;
    reason: string;
    idempotencyKey: string;
}) {
    const { id, ...body } = input;
    return write<LeadCard>(
        `${lead(id)}/assign`,
        "POST",
        body,
        "Could not give the lead out.",
    );
}

/** Log a call, visit or message on a lead. */
export async function logLeadContactAction(input: {
    id: string;
    kind: ContactKind;
    summary: string;
    feedback?: string | null;
    minutes?: number | null;
    followUpOn?: string | null;
    idempotencyKey: string;
}) {
    const { id, ...body } = input;
    return write<LeadContact>(
        `${lead(id)}/log`,
        "POST",
        body,
        "Could not log it.",
    );
}
