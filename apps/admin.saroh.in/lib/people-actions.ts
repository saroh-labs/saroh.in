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
    if (result.ok)
        for (const path of paths)
            // A business's page is a layout over its tabs (admin plan U2).
            revalidatePath(
                path,
                path.startsWith("/businesses/") ? "layout" : undefined,
            );
    return result;
}

/** A user's page and every tab under it. */
function refreshUser<T>(userId: string, result: ControlPlaneResult<T>) {
    if (result.ok) {
        revalidatePath(`/users/${userId}`, "layout");
        revalidatePath("/users");
    }
    return result;
}

const person = (id: string) => `/people/${encodeURIComponent(id)}`;

const org = (id: string) => `/organizations/${encodeURIComponent(id)}`;

export async function endSessionsAction(userId: string, input: Reasoned) {
    return refreshUser(
        userId,
        await adminWrite(
            `${person(userId)}/end-sessions`,
            "POST",
            input,
            "Could not end their sessions.",
        ),
    );
}

/** Send a sign-in code through the API's Better Auth (U9). */
export async function sendSignInCodeAction(userId: string, input: Reasoned) {
    return refreshUser(
        userId,
        await adminWrite<{ sent: true; to: string }>(
            `${person(userId)}/sign-in-code`,
            "POST",
            input,
            "Couldn't send a sign-in code.",
        ),
    );
}

/** Mark their email verified, as staff's word (U9). */
export async function markVerifiedAction(userId: string, input: Reasoned) {
    return refreshUser(
        userId,
        await adminWrite(
            `${person(userId)}/mark-verified`,
            "POST",
            input,
            "Couldn't mark their email verified.",
        ),
    );
}

/** Change their sign-in email; the new address's code is held (U9). */
export async function changeSignInEmailAction(
    userId: string,
    input: Reasoned & { email: string },
) {
    return refreshUser(
        userId,
        await adminWrite<{ changeId: string; codeHeldUntil: string }>(
            `${person(userId)}/email`,
            "PUT",
            input,
            "Couldn't change their sign-in email.",
        ),
    );
}

/** A second staff member confirms a held change (U9). */
export async function confirmSignInEmailAction(
    userId: string,
    input: Reasoned,
) {
    return refreshUser(
        userId,
        await adminWrite(
            `${person(userId)}/email/confirm`,
            "POST",
            input,
            "Couldn't confirm the change.",
        ),
    );
}

export async function changeMemberRoleAction(
    organizationId: string,
    userId: string,
    input: Reasoned & { role: string },
) {
    return refresh(
        [`/businesses/${organizationId}`, `/users/${userId}`],
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
        [`/businesses/${organizationId}`, `/users/${userId}`],
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
