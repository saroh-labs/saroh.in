"use server";

import type { InviteMemberInput } from "./members";
import {
    inviteMember as inviteMemberApi,
    removeMember as removeMemberApi,
    revokeInvitation as revokeInvitationApi,
    updateMemberRole as updateMemberRoleApi,
} from "./members";
import type { OrganizationRole } from "./service";

/**
 * Server Actions for the organization roster (#276).
 *
 * Thin wrappers, as everywhere else: the API resolves the caller from the
 * session and decides what their role may do. Nothing here is a permission
 * check — the members screen hides what it can, and the API refuses it.
 */

export async function inviteMember(input: InviteMemberInput) {
    return inviteMemberApi(input);
}

export async function updateMemberRole(
    userId: string,
    input: { role: OrganizationRole; siteIds?: string[] },
) {
    return updateMemberRoleApi(userId, input);
}

export async function removeMember(userId: string) {
    return removeMemberApi(userId);
}

export async function revokeInvitation(invitationId: string) {
    return revokeInvitationApi(invitationId);
}
