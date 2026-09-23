import type { AdminPermission, AdminRole } from "./control-plane";
import { getJson } from "./control-plane";

/** The operator's own team, as the console reads it (plan U2). Server-only. */

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
}

export interface RoleDefinition {
    role: AdminRole;
    permissions: AdminPermission[];
}

export function listStaff(): Promise<StaffMember[] | null> {
    return getJson<StaffMember[]>("/staff");
}

export function listRoles(): Promise<RoleDefinition[] | null> {
    return getJson<RoleDefinition[]>("/staff/roles");
}
