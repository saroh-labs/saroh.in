"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for staff access (plan U2). The API decides who may grant
 * and protects the last owner; these forward and refresh.
 */

function refresh<T>(result: ControlPlaneResult<T>) {
    if (result.ok) revalidatePath("/team", "layout");
    return result;
}

export async function amendStaffAction(
    platformAdminId: string,
    input: {
        roles: string[];
        reason: string;
        expiresAt?: string;
        idempotencyKey: string;
    },
) {
    return refresh(
        await adminWrite(
            `/staff/${encodeURIComponent(platformAdminId)}`,
            "PUT",
            input,
            "Could not change their access.",
        ),
    );
}

export async function revokeStaffAction(
    platformAdminId: string,
    input: { reason: string; idempotencyKey: string },
) {
    return refresh(
        await adminWrite(
            `/staff/${encodeURIComponent(platformAdminId)}`,
            "DELETE",
            input,
            "Could not revoke their access.",
        ),
    );
}

/** What Add a teammate did: access now, or an invite on its way. */
export type AddTeammateOutcome =
    | { kind: "granted"; platformAdminId: string }
    | { kind: "invited"; emailed: boolean; expiresAt: string };

/**
 * Add a teammate (admin console U17, R32): one sheet for both ways in.
 * Someone with a Saroh account gets access at once (the grant, with their
 * job on their profile and, when set, the day their access ends); someone
 * without one gets an invite email with a one-time link valid for 7 days
 * (U24). The grant's "nobody has an account" refusal is what sends the
 * invite. An invite carries no end date: the API's invite has none, so
 * the sheet says to set it with Change once they join.
 */
export async function addTeammateAction(input: {
    name: string;
    email: string;
    worksAs: string;
    roles: string[];
    onCommission: boolean;
    expiresAt?: string;
    reason: string;
    idempotencyKey: string;
}): Promise<ControlPlaneResult<AddTeammateOutcome>> {
    const granted = await adminWrite<{ platformAdminId: string }>(
        "/staff",
        "POST",
        {
            email: input.email,
            roles: input.roles,
            reason: input.reason,
            expiresAt: input.expiresAt,
            worksAs: input.worksAs,
            onCommission: input.onCommission,
            idempotencyKey: input.idempotencyKey,
        },
        "Could not add them to the team.",
    );
    if (granted.ok) {
        revalidatePath("/team", "layout");
        return {
            ok: true,
            data: {
                kind: "granted",
                platformAdminId: granted.data.platformAdminId,
            },
        };
    }
    if (granted.status !== 404) return granted;
    const invited = await adminWrite<{ emailed: boolean; expiresAt: string }>(
        "/staff/invites",
        "POST",
        {
            email: input.email,
            name: input.name,
            worksAs: input.worksAs,
            roles: input.roles,
            onCommission: input.onCommission,
            reason: input.reason,
            idempotencyKey: input.idempotencyKey,
        },
        "Could not send the invite.",
    );
    if (!invited.ok) return invited;
    revalidatePath("/team", "layout");
    return {
        ok: true,
        data: {
            kind: "invited",
            emailed: invited.data.emailed,
            expiresAt: invited.data.expiresAt,
        },
    };
}

/** Send an invite again with a new link; the old link stops working. */
export async function resendInviteAction(
    inviteId: string,
    input: { reason: string; idempotencyKey: string },
) {
    const result = await adminWrite<{ emailed: boolean; expiresAt: string }>(
        `/staff/invites/${encodeURIComponent(inviteId)}/resend`,
        "POST",
        input,
        "Could not send the invite again.",
    );
    if (result.ok) revalidatePath("/team", "layout");
    return result;
}

/** Take an invite back before it is accepted. */
export async function withdrawInviteAction(
    inviteId: string,
    input: { reason: string; idempotencyKey: string },
) {
    const result = await adminWrite(
        `/staff/invites/${encodeURIComponent(inviteId)}`,
        "DELETE",
        input,
        "Could not take the invite back.",
    );
    if (result.ok) revalidatePath("/team", "layout");
    return result;
}

/**
 * Share out evenly (R30, U25's endpoint): every business without a
 * manager, paying ones first, to account managers on commission with the
 * fewest, up to what each can take.
 */
export async function shareOutAction(input: {
    reason: string;
    idempotencyKey: string;
}) {
    const result = await adminWrite<{
        assigned: { organizationId: string; platformAdminId: string }[];
        left: number;
    }>("/team/share-out", "POST", input, "Could not share the businesses out.");
    if (result.ok) revalidatePath("/team", "layout");
    return result;
}

/**
 * Make me Platform owner (admin console redesign U10): the break-glass
 * banner's one action. The API records the grant only while the caller has
 * none on record, and refuses otherwise.
 */
export async function claimPlatformOwnerAction(input: {
    reason: string;
    idempotencyKey: string;
}) {
    const result = await adminWrite(
        "/staff/me/platform-owner",
        "POST",
        input,
        "Couldn't record your access. Try again.",
    );
    // The banner and the shell read who you are on every screen.
    if (result.ok) revalidatePath("/", "layout");
    return result;
}
