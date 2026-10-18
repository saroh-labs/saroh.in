import { ForbiddenException } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminPermission, AdminRole } from "./admin-permissions";
import { OWN_SCOPED_ROLES, permissionsFor } from "./admin-permissions";

/**
 * What a staff member may see under one permission (DEC-169, plan
 * 2026-10-18-002 "Staff scoping").
 *
 * - `all`: no filter. Every role but the Account manager.
 * - `own`: only rows this teammate owns: the businesses linked to them as
 *   manager, and the Saroh leads they own. The Account manager.
 */
export type StaffScope =
    { kind: "all" } | { kind: "own"; platformAdminId: string };

type ScopedStaff = Pick<
    PlatformAdminInfo,
    "platformAdminId" | "roles" | "viaBootstrap"
>;

const OWN_SCOPED = new Set<AdminRole>(OWN_SCOPED_ROLES);

/**
 * The one place a read of leads, contact logs, a team view's businesses, the
 * overview, module state, search or a member page decides what this staff
 * member may see. Every such read calls it and applies the result; nothing
 * filters by role on its own.
 *
 * Scope is per permission, not per person: someone who is an Account manager
 * and also an Auditor sees every business under `accounts:read` (the Auditor
 * grants it to all), but only their own Saroh leads, since only the Account
 * manager role grants `saroh-leads:read`. Asking for a permission none of
 * their roles grants is refused (403), the way the route guard would.
 */
export function scopeForStaff(
    staff: ScopedStaff,
    permission: AdminPermission,
): StaffScope {
    const granting = staff.roles.filter((role) =>
        permissionsFor([role]).includes(permission),
    );
    if (granting.length === 0) {
        throw new ForbiddenException(
            "Platform administrator permission required",
        );
    }
    if (granting.some((role) => !OWN_SCOPED.has(role))) {
        return { kind: "all" };
    }
    // Own-scoped needs a recorded grant to own anything by. Break-glass
    // staff (ADMIN_ALLOWLIST) are Platform owners and never reach here.
    if (!staff.platformAdminId) {
        throw new ForbiddenException(
            "Your access has no team record to scope it to.",
        );
    }
    return { kind: "own", platformAdminId: staff.platformAdminId };
}

/**
 * May this scope see a row owned by `ownerPlatformAdminId` (a Saroh lead's
 * owner, a contact log's author)? A row with no owner is seen only by
 * all-scope staff: unowned leads are assigned by Support or Platform owner.
 */
export function mayOwnerSee(
    scope: StaffScope,
    ownerPlatformAdminId: string | null,
): boolean {
    if (scope.kind === "all") return true;
    return ownerPlatformAdminId === scope.platformAdminId;
}

/**
 * A Prisma `where` fragment for a table whose owner column is `field`:
 * nothing for all-scope, the owner for own-scope. Spread it into the
 * query's `where`.
 */
export function ownerWhere<K extends string>(
    scope: StaffScope,
    field: K,
): Partial<Record<K, string>> {
    if (scope.kind === "all") return {};
    return { [field]: scope.platformAdminId } as Partial<Record<K, string>>;
}

/**
 * May this scope see organization `organizationId`?
 *
 * All-scope: yes. Own-scope: only while the business's open account-manager
 * link names this teammate.
 *
 * TODO(U19/U25): the link table (`AccountManagerLink`) does not exist yet,
 * so own-scope answers no for every business. That is the safe default: an
 * Account manager sees no business until the link lands and this reads it
 * (one open link where `platformAdminId` = theirs and `endedAt` is null).
 */
export function maySeeOrganization(
    scope: StaffScope,
    organizationId: string,
): Promise<boolean> {
    if (scope.kind === "all") return Promise.resolve(true);
    void organizationId;
    return Promise.resolve(false);
}

/** {@link maySeeOrganization}, refusing with 403 when the answer is no. */
export async function assertMaySeeOrganization(
    scope: StaffScope,
    organizationId: string,
): Promise<void> {
    if (!(await maySeeOrganization(scope, organizationId))) {
        throw new ForbiddenException("That business isn't one of yours.");
    }
}
