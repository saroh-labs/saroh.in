import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, getList, mutate, orgBase } from "@/lib/api/http";

import type { OrganizationRole } from "./service";

/**
 * The organization's roster and its invitations (#276).
 *
 * Server-only, like every `lib/<domain>/service.ts`: it imports the HTTP
 * plumbing that reads `next/headers`, so a client component cannot reach it.
 * Client components call the actions in `member-actions.ts`.
 */

export interface OrganizationMember {
    userId: string;
    name: string | null;
    email: string;
    /** The built-in this maps to; MEMBER for a role the business invented. */
    role: OrganizationRole;
    /** The role as stored — a built-in name, or an invented role's key. */
    roleKey?: string;
    /** Sites this person may review. Empty for every role but REVIEWER. */
    siteIds: string[];
    isSelf: boolean;
}

export interface OrganizationInvitation {
    id: string;
    email: string;
    role: OrganizationRole;
    /** The role as stored — a built-in name, or an invented role's key. */
    roleKey?: string;
    siteIds: string[];
    status: string;
    expiresAt: string;
    createdAt: string;
}

export interface InviteMemberInput {
    email: string;
    /** Any role this business has, built-in or invented. */
    role: string;
    siteIds?: string[];
}

/** Everyone in the active organization. */
export async function listMembers(): Promise<OrganizationMember[]> {
    const base = await orgBase();
    if (!base) return [];
    return getList<OrganizationMember>(`${base}/members`);
}

/**
 * Invitations sent and not yet answered. Empty rather than throwing when the
 * caller may not see them: this sits beside the roster on one page, and a
 * MEMBER viewing that page should see the roster, not an error screen.
 */
export async function listInvitations(): Promise<OrganizationInvitation[]> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/invitations`);
    if (!res.ok) return [];
    return (await res.json()) as OrganizationInvitation[];
}

/**
 * Invite someone — or, for an address already invited, send it again: the API
 * refreshes that invitation in place with a new link and a fresh week.
 *
 * Keeps the refusal's `field`, so "already in this workspace" can sit on the
 * email field rather than in a toast.
 */
export async function inviteMember(
    input: InviteMemberInput,
): Promise<ApiResult<OrganizationInvitation>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/invitations`, {
        method: "POST",
        body: JSON.stringify(input),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: data as OrganizationInvitation };
    return toFailure(data, "Could not send that invitation.");
}

export async function updateMemberRole(
    userId: string,
    input: { role: string; siteIds?: string[] },
): Promise<CrmResult<{ userId: string; role: string }>> {
    return mutate(
        `/members/${userId}`,
        "PATCH",
        input,
        "Could not change that role.",
    );
}

export async function removeMember(
    userId: string,
): Promise<CrmResult<{ removed: boolean; revokedLinks: number }>> {
    return destroy(`/members/${userId}`, "Could not remove that person.");
}

export async function revokeInvitation(
    invitationId: string,
): Promise<CrmResult<{ revoked: boolean }>> {
    return destroy(
        `/invitations/${invitationId}`,
        "Could not withdraw that invitation.",
    );
}

export interface AcceptedInvitation {
    organizationId: string;
    organization: { name: string; slug: string };
    role: OrganizationRole;
    /** The site they were invited to review, when they were invited to one. */
    siteId: string | null;
}

/**
 * Accept an invitation.
 *
 * Not org-scoped — the caller is not a member yet, so there is no active
 * organization to send. It posts to the API root with the session alone.
 */
export async function acceptInvitation(
    token: string,
): Promise<CrmResult<AcceptedInvitation>> {
    const res = await apiFetch(
        `/organization-invitations/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
    );
    const data = (await res
        .json()
        .catch(() => null)) as AcceptedInvitation | null;
    if (res.ok && data) return { ok: true, data };
    return {
        ok: false,
        error: toFailure(data, "That invitation could not be accepted.").error,
    };
}
