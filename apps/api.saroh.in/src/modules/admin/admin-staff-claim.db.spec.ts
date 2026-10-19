/**
 * Make me Platform owner (admin console redesign U10, R16) against a real
 * Postgres: someone in through the break-glass `ADMIN_ALLOWLIST`, with no
 * recorded grant, records a Platform owner grant for themselves, on the
 * ledger; anyone with a recorded grant is refused, so the banner's action
 * can't be used twice. The route's permission (`staff:grant`) is pinned in
 * `admin.controller.permissions.spec.ts`. Integration project
 * (TEST_DATABASE_URL), plain and `TEST_RLS=on`, where the role CHECK
 * applies.
 */
import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAuditService } from "./admin-audit.service";
import { AdminRole, permissionsFor } from "./admin-permissions";
import { AdminStaffService } from "./admin-staff.service";

const tag = `${process.pid}-${Date.now()}`;
const service = new AdminStaffService(new AdminAuditService());

let userId = "";

const breakGlass = (): PlatformAdminInfo => ({
    userId,
    platformAdminId: null,
    roles: [AdminRole.PlatformOwner],
    permissions: permissionsFor([AdminRole.PlatformOwner]),
    viaBootstrap: true,
});

beforeAll(async () => {
    userId = (
        await prisma.user.create({
            data: { email: `break-glass-${tag}@example.com`, name: "Owner" },
        })
    ).id;
});

describe("Make me Platform owner (DB, U10)", () => {
    it("records a Platform owner grant for the break-glass person, with a ledger row", async () => {
        const result = await service.claimPlatformOwner({
            staff: breakGlass(),
            reason: "Recording my own access",
        });

        expect(result.added).toEqual([AdminRole.PlatformOwner]);
        const admin = await prisma.platformAdmin.findUnique({
            where: { userId },
            include: { roleAssignments: true },
        });
        expect(admin?.revokedAt).toBeNull();
        expect(admin?.roleAssignments.map((r) => r.role)).toEqual([
            AdminRole.PlatformOwner,
        ]);

        const audit = await prisma.adminAuditEvent.findFirst({
            where: { action: "staff.granted", targetId: admin?.id },
        });
        expect(audit).toMatchObject({
            actorUserId: userId,
            permission: "staff:grant",
            reason: "Recording my own access",
            outcome: "SUCCESS",
        });
        expect(audit?.metadata).toMatchObject({
            userId,
            roles: [AdminRole.PlatformOwner],
        });
    });

    it("refuses someone who already has a recorded grant", async () => {
        const admin = await prisma.platformAdmin.findUniqueOrThrow({
            where: { userId },
        });
        await expect(
            service.claimPlatformOwner({
                staff: {
                    ...breakGlass(),
                    platformAdminId: admin.id,
                    viaBootstrap: false,
                },
                reason: "Again",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
            await prisma.platformAdminRoleAssignment.count({
                where: { platformAdminId: admin.id },
            }),
        ).toBe(1);
    });
});
