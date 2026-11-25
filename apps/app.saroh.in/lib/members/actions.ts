"use server";

import { forgetGateAfter } from "@/lib/access/gate-memo";
import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { MemberRole } from "./service";
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
 * Each takes the tab's business last (`writeAsOrg`, DEC-259): a location's
 * People tab is on React Query and reads its roster again itself.
 */

export async function inviteMember(
    storeId: string,
    email: string,
    role: MemberRole,
    orgId: string,
) {
    return writeAsOrg(orgId, () => inviteMemberApi(storeId, email, role));
}

export async function updateMemberRole(
    storeId: string,
    userId: string,
    role: MemberRole,
    orgId: string,
) {
    return forgetGateAfter(
        await writeAsOrg(orgId, () =>
            updateMemberRoleApi(storeId, userId, role),
        ),
        orgId,
    );
}

export async function removeMember(
    storeId: string,
    userId: string,
    orgId: string,
) {
    return forgetGateAfter(
        await writeAsOrg(orgId, () => removeMemberApi(storeId, userId)),
        orgId,
    );
}

export async function revokeInvitation(
    storeId: string,
    invitationId: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => revokeInvitationApi(storeId, invitationId));
}
