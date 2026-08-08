"use server";

import type { MemberResult, MemberRole } from "./service";
import {
    inviteMember as inviteMemberApi,
    removeMember as removeMemberApi,
    revokeInvitation as revokeInvitationApi,
    updateMemberRole as updateMemberRoleApi,
} from "./service";

/**
 * Server Actions for team management. Thin wrappers that forward the session
 * cookie to api.saroh.in; the api resolves the caller from the session and
 * enforces owner-only management. The UI calls these, never the api directly.
 */

export async function inviteMember(
    storeId: string,
    email: string,
    role: MemberRole,
): Promise<MemberResult> {
    return inviteMemberApi(storeId, email, role);
}

export async function updateMemberRole(
    storeId: string,
    userId: string,
    role: MemberRole,
): Promise<MemberResult> {
    return updateMemberRoleApi(storeId, userId, role);
}

export async function removeMember(
    storeId: string,
    userId: string,
): Promise<MemberResult> {
    return removeMemberApi(storeId, userId);
}

export async function revokeInvitation(
    storeId: string,
    invitationId: string,
): Promise<MemberResult> {
    return revokeInvitationApi(storeId, invitationId);
}
