import type { ReactElement } from "react";
import { createElement } from "react";

import { NotAuthorized } from "@/components/not-authorized";

import type { AdminPermission, StaffIdentity } from "./control-plane";
import { getStaffIdentity } from "./control-plane";
import { requireSession } from "./session";

/**
 * The gate every console screen opens with: signed in, staff per the API, and
 * — when the screen names one — holding the permission it needs.
 *
 * Returns the staff identity or the screen to render instead. The API refuses
 * the underlying reads either way; this only keeps a screen from being drawn
 * around data it was never going to get.
 */
export async function requireStaff(
    permission?: AdminPermission,
): Promise<
    { ok: true; staff: StaffIdentity } | { ok: false; screen: ReactElement }
> {
    const session = await requireSession();
    const staff = await getStaffIdentity();
    if (!staff || (permission && !staff.permissions.includes(permission))) {
        return {
            ok: false,
            screen: createElement(NotAuthorized, { email: session.user.email }),
        };
    }
    return { ok: true, staff };
}

/** Whether this operator holds a permission. For hiding what they cannot do. */
export function can(
    staff: StaffIdentity,
    permission: AdminPermission,
): boolean {
    return staff.permissions.includes(permission);
}
