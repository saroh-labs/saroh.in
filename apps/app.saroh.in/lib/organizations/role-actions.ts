"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import type { RoleInput } from "./roles";
import {
    createRole as createRoleApi,
    deleteRole as deleteRoleApi,
    updateRole as updateRoleApi,
} from "./roles";

/**
 * Server Actions for the roles a business invents.
 *
 * Thin wrappers, like the roster's: the API decides whether the caller may
 * change roles and refuses otherwise. Each revalidates Team, and the whole
 * layout — a role's permissions decide what the RAIL shows its holders, so a
 * save that left the rail stale would show the owner one thing and their
 * staff another until someone reloaded. Team on React Query passes the
 * tab's business last (`writeAsOrg`, nothing revalidated): the screen
 * reads its own queries again (`useSettingsSave`).
 */

export async function createRole(input: RoleInput, orgId?: string) {
    if (orgId) return writeAsOrg(orgId, () => createRoleApi(input));
    const res = await createRoleApi(input);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function updateRole(
    key: string,
    input: Partial<RoleInput>,
    orgId?: string,
) {
    if (orgId) return writeAsOrg(orgId, () => updateRoleApi(key, input));
    const res = await updateRoleApi(key, input);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function deleteRole(key: string, orgId?: string) {
    if (orgId) return writeAsOrg(orgId, () => deleteRoleApi(key));
    const res = await deleteRoleApi(key);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}
