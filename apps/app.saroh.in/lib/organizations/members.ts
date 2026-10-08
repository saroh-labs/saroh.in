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
    /**
     * Their newest session, anywhere in Saroh — sessions belong to a person,
     * not a business. `null` when they hold none, and for a viewer who may
     * not remove people (the API keeps it to Owner and Admin by default);
     * absent from an older API. The Team row says nothing when it is null.
     */
    lastActiveAt?: string | null;
    /**
     * The storefronts this person works on and their role at each (Admin,
     * Manager, Editor or Viewer; DEC-048), shown under their name. Absent
     * from an older API.
     */
    storefronts?: MemberStorefront[];
    /**
     * What this person holds beyond their role (F17): their extra
     * permissions as action keys, less anything the role already grants.
     * Absent from an older API.
     */
    extraActions?: string[];
    /**
     * They use a team seat (DEC-105): their role or extras can change
     * something, or they take bookings. False for someone who only looks,
     * who counts toward the plan's view-only people. Absent from an older
     * API.
     */
    usesSeat?: boolean;
}

export interface MemberStorefront {
    storeId: string;
    name: string;
    role: string;
}

/** Someone the storefront backfill put on the team (F16), for Team's notice. */
export interface StorefrontTeamNoticePerson {
    userId: string;
    name: string | null;
    email: string;
    storefronts: string[];
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
    /**
     * The role invited to uses a team seat (DEC-105); false for one that
     * only looks. Absent from an older API.
     */
    usesSeat?: boolean;
    /** The person on the diary it gives a login to (#868), if any. */
    staff?: { id: string; name: string } | null;
    /**
     * Already counted as that diary person, who takes bookings with no
     * login and holds a seat (#868): Team doesn't count the invite again.
     */
    countedOnDiary?: boolean;
}

export interface InviteMemberInput {
    email: string;
    /** Any role this business has, built-in or invented. */
    role: string;
    siteIds?: string[];
    /** The person on the diary this gives a login to (#868). */
    staffId?: string;
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
 * The people the storefront backfill put on the team as Storefront team and
 * whose role nobody has changed since (F16, DEC-048), for Team's one-time
 * notice. Empty rather than throwing — for a viewer who may not change
 * roles, an older API, or a failed read — because the notice is an aside on
 * a page that must still render the roster.
 */
export async function getStorefrontTeamNotice(): Promise<
    StorefrontTeamNoticePerson[]
> {
    const base = await orgBase();
    if (!base) return [];
    const res = await apiFetch(`${base}/storefront-team-notice`).catch(
        () => null,
    );
    if (!res?.ok) return [];
    const data = (await res.json().catch(() => null)) as {
        people?: StorefrontTeamNoticePerson[];
    } | null;
    return data?.people ?? [];
}

/** Dismiss that notice for the whole business. */
export async function dismissStorefrontTeamNotice(): Promise<
    CrmResult<{ dismissed: boolean }>
> {
    return mutate(
        "/storefront-team-notice/dismiss",
        "POST",
        {},
        "Could not dismiss that notice.",
    );
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

/**
 * Set a person's extra permissions, the whole list (F17). The API refuses
 * anything beyond the caller's own reach, their own list, and anyone who can
 * do more than they can, in words.
 */
export async function setMemberExtraActions(
    userId: string,
    actions: string[],
): Promise<CrmResult<{ userId: string; extraActions: string[] }>> {
    return mutate(
        `/members/${userId}/extra-actions`,
        "PUT",
        { actions },
        "Could not change those permissions.",
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
