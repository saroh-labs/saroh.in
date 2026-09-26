"use server";

import { revalidatePath } from "next/cache";

import type { ControlPlaneResult } from "./control-plane";
import { adminWrite } from "./control-plane";

/**
 * Server Actions for a person's place on the instance (plan U6). Each goes
 * through the business's own rules in the API; these forward and refresh.
 */

interface Reasoned {
    reason: string;
    idempotencyKey: string;
}

function refresh<T>(paths: string[], result: ControlPlaneResult<T>) {
    if (result.ok) for (const path of paths) revalidatePath(path);
    return result;
}

const org = (id: string) => `/organizations/${encodeURIComponent(id)}`;

export async function endSessionsAction(userId: string, input: Reasoned) {
    return refresh(
        [`/people/${userId}`],
        await adminWrite(
            `/people/${encodeURIComponent(userId)}/end-sessions`,
            "POST",
            input,
            "Could not end their sessions.",
        ),
    );
}

export async function changeMemberRoleAction(
    organizationId: string,
    userId: string,
    input: Reasoned & { role: string },
) {
    return refresh(
        [`/businesses/${organizationId}`, `/people/${userId}`],
        await adminWrite(
            `${org(organizationId)}/members/${encodeURIComponent(userId)}/role`,
            "PUT",
            input,
            "Could not change their role.",
        ),
    );
}

export async function removeMemberAction(
    organizationId: string,
    userId: string,
    input: Reasoned,
) {
    return refresh(
        [`/businesses/${organizationId}`, `/people/${userId}`],
        await adminWrite(
            `${org(organizationId)}/members/${encodeURIComponent(userId)}`,
            "DELETE",
            input,
            "Could not remove them.",
        ),
    );
}

export async function resendInvitationAction(
    organizationId: string,
    invitationId: string,
    input: Reasoned,
) {
    return refresh(
        [`/businesses/${organizationId}`],
        await adminWrite(
            `${org(organizationId)}/invitations/${encodeURIComponent(invitationId)}/resend`,
            "POST",
            input,
            "Could not resend the invitation.",
        ),
    );
}

export async function withdrawInvitationAction(
    organizationId: string,
    invitationId: string,
    input: Reasoned,
) {
    return refresh(
        [`/businesses/${organizationId}`],
        await adminWrite(
            `${org(organizationId)}/invitations/${encodeURIComponent(invitationId)}`,
            "DELETE",
            input,
            "Could not withdraw the invitation.",
        ),
    );
}
