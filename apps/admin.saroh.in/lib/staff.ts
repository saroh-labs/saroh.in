import type { AdminPermission, AdminRole } from "./control-plane";
import { getJson } from "./control-plane";
import type { StaffJob } from "./team-words";

/**
 * The operator's own team, as the console reads it (plan U2; the Team
 * screen, admin console U17). Server-only: client components take the
 * types, never these functions.
 */

export interface StaffMember {
    platformAdminId: string;
    userId: string;
    email: string;
    name: string | null;
    grantedAt: string;
    revokedAt: string | null;
    note: string | null;
    roles: {
        assignmentId: string;
        role: AdminRole;
        expiresAt: string | null;
        assignedAt: string;
        reason: string;
    }[];
    permissions: AdminPermission[];
    /**
     * Their job, capacity and commission flag (DEC-169). Null until their
     * profile is first saved. Older API builds leave it out.
     */
    profile?: {
        worksAs: StaffJob;
        capacity: number | null;
        onCommission: boolean;
    } | null;
    /** Businesses they look after now. Older API builds leave it out. */
    businesses?: number;
}

export interface RoleDefinition {
    role: AdminRole;
    permissions: AdminPermission[];
}

/** An invite not yet accepted (admin console U24). Never its token. */
export interface StaffInvite {
    id: string;
    email: string;
    name: string;
    roles: AdminRole[];
    worksAs: StaffJob;
    onCommission: boolean;
    state: "waiting" | "expired" | "accepted" | "withdrawn";
    expiresAt: string;
    sentAt: string;
    sendCount: number;
    invitedBy: { userId: string; name: string | null };
    createdAt: string;
}

/** A business with no account manager (U17), paying ones first. */
export interface UnassignedBusiness {
    organizationId: string;
    name: string;
    slug: string;
    paying: boolean;
    createdAt: string;
}

export interface UnassignedList {
    businesses: UnassignedBusiness[];
    /** How many there are in all; the list shows the first of them. */
    total: number;
}

/** `staff:read`: the old list, kept for its callers. */
export function listStaff(): Promise<StaffMember[] | null> {
    return getJson<StaffMember[]>("/staff");
}

/** `staff:read`: what each role may do. */
export function listRoles(): Promise<RoleDefinition[] | null> {
    return getJson<RoleDefinition[]>("/staff/roles");
}

/** `team:read`: the Team screen's people, with job and businesses. */
export function listTeam(): Promise<StaffMember[] | null> {
    return getJson<StaffMember[]>("/team");
}

/** `team:read`: what each role may do, for Console roles. */
export function listTeamRoles(): Promise<RoleDefinition[] | null> {
    return getJson<RoleDefinition[]>("/team/roles");
}

/** `staff:read`: invites waiting or expired. */
export function listInvites(): Promise<StaffInvite[] | null> {
    return getJson<StaffInvite[]>("/staff/invites");
}

/** `accounts:read` for every business: businesses without a manager. */
export function listUnassigned(): Promise<UnassignedList | null> {
    return getJson<UnassignedList>("/team/unassigned");
}
