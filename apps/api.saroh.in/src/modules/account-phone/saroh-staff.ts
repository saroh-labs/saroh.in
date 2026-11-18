import { prisma } from "@saroh/database";

import { isBootstrapAdmin } from "../../common/guards/platform-admin.guard";

/**
 * Saroh staff (DEC-198): a `PlatformAdmin` grant not revoked, or the
 * break-glass `ADMIN_ALLOWLIST`, as `PlatformAdminGuard` decides. Stricter
 * than the guard: a grant with no live role still counts.
 */
export async function isSarohStaff(user: {
    id: string;
    email: string;
}): Promise<boolean> {
    if (isBootstrapAdmin(user.email)) return true;
    const grant = await prisma.platformAdmin.findUnique({
        where: { userId: user.id },
        select: { revokedAt: true },
    });
    return grant !== null && grant.revokedAt === null;
}
