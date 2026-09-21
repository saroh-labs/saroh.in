import type { CrmResult } from "@/lib/api/http";
import { destroy, getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * The roles a business has and the permissions they can be given.
 *
 * The API is the authority on both lists. The catalogue in particular is read
 * rather than bundled: it is the same list `authorize()` decides with, and a
 * copy compiled into this app would drift from it the first time an action
 * was added — silently, since a permission nobody can tick looks exactly like
 * one nobody needed.
 *
 * Server-only: `orgBase` reads the active-organization cookie.
 */

export interface Role {
    key: string;
    label: string;
    actions: string[];
    ringTone: string;
    /** Built-in: cannot be renamed, re-permissioned or removed. */
    system: boolean;
    members: number;
}

export interface Capability {
    action: string;
    group: string;
    label: string;
    note?: string;
}

export interface RoleCatalogue {
    groups: string[];
    capabilities: Capability[];
}

export interface RoleInput {
    label: string;
    actions: string[];
}

export async function listRoles(): Promise<Role[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Role[]>(`${base}/roles`)) ?? [];
}

export async function getRoleCatalogue(): Promise<RoleCatalogue | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<RoleCatalogue>(`${base}/roles/catalogue`);
}

export async function createRole(input: RoleInput): Promise<CrmResult<Role>> {
    return mutate<Role>("/roles", "POST", input, "Could not create that role.");
}

export async function updateRole(
    key: string,
    input: Partial<RoleInput>,
): Promise<CrmResult<Role>> {
    return mutate<Role>(
        `/roles/${encodeURIComponent(key)}`,
        "PATCH",
        input,
        "Could not save that role.",
    );
}

export async function deleteRole(key: string): Promise<CrmResult<object>> {
    return destroy(
        `/roles/${encodeURIComponent(key)}`,
        "Could not remove that role.",
    );
}
