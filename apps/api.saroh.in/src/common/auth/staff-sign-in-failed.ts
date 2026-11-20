import { prisma } from "@saroh/database";

import { isSarohStaff } from "../../modules/account-phone/saroh-staff";
import { AdminAuditOutcome } from "../../modules/admin/admin-audit.service";
import { AdminPermission } from "../../modules/admin/admin-permissions";
import { auditOnce } from "../guards/admin-session";

const TEN_MINUTES_MS = 10 * 60 * 1000;

/**
 * A refused sign-in to a Saroh staff account (admin review B4): one DENIED
 * row on the admin ledger per account per ten minutes, with the caller's
 * address and browser, so a guessing run can't flood it. Anyone else's
 * failed sign-in is not the admin ledger's business.
 */
export async function noteFailedStaffSignIn(email: string): Promise<void> {
    const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, email: true },
    });
    if (!user || !(await isSarohStaff(user))) return;
    await auditOnce(
        {
            actorUserId: user.id,
            permission: AdminPermission.PlatformRead,
            action: "staff.sign-in.failed",
            targetType: "user",
            targetId: user.id,
            outcome: AdminAuditOutcome.Denied,
        },
        { actorUserId: user.id, withinMs: TEN_MINUTES_MS },
    );
}
