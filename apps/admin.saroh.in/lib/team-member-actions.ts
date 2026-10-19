"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";
import type { ContactKind, LeadContact } from "./saroh-lead-words";
import type { StaffEngagement } from "./team-member-words";
import type { StaffJob } from "./team-words";

/**
 * The writes on a teammate's page (DEC-169, admin console U22). The API
 * decides who may do each and records it; these forward, with the dialog's
 * or the sheet's idempotency key, and hand back the API's own reason.
 */

const member = (id: string) => `/team/${encodeURIComponent(id)}`;

export interface ProfileSave {
    worksAs: StaffJob;
    workEmail: string | null;
    phone: string | null;
    city: string | null;
    languages: string[];
    joinedOn: string | null;
    reportsToPlatformAdminId: string | null;
    engagement: StaffEngagement | null;
    capacity: number | null;
    onCommission: boolean;
    emergencyContact: string | null;
    /** Left out: the tax id on file stays. Needs `team:pay`. */
    taxId?: string;
}

/**
 * Save a teammate's details (`team:write`, with a reason). Every field is
 * sent, so one left empty is cleared; the tax id only when typed.
 */
export async function saveMemberProfileAction(input: {
    platformAdminId: string;
    profile: ProfileSave;
    reason: string;
    idempotencyKey: string;
}) {
    const result = await adminWrite(
        `/staff/${encodeURIComponent(input.platformAdminId)}/profile`,
        "PUT",
        {
            ...input.profile,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
        },
        "Could not save their details. Nothing changed.",
    );
    if (result.ok) revalidatePath(member(input.platformAdminId), "layout");
    return result;
}

/** Log a call, visit or message with one of their businesses. */
export async function logBusinessContactAction(input: {
    organizationId: string;
    platformAdminId: string;
    kind: ContactKind;
    summary: string;
    feedback?: string | null;
    minutes?: number | null;
    idempotencyKey: string;
}) {
    const { organizationId, platformAdminId, ...body } = input;
    const result = await adminWrite<LeadContact>(
        `/organizations/${encodeURIComponent(organizationId)}/contact-log`,
        "POST",
        body,
        "Could not log it.",
    );
    if (result.ok) revalidatePath(member(platformAdminId), "layout");
    return result;
}
