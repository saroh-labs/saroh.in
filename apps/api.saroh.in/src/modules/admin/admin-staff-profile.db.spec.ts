/**
 * A teammate's profile against a real Postgres (DEC-169, admin console U18):
 * the round trip, the tax id shown only as set or its last 4 characters,
 * the ledger rows, the generated manager code, and who is refused.
 *
 * Route permissions are pinned by `admin.controller.permissions.spec.ts`;
 * here the real guard runs over the controller's own metadata.
 * Runs in the integration project (TEST_DATABASE_URL), and under
 * `TEST_RLS=on`, where the migrations' CHECKs apply.
 */
// The controller is loaded for its route metadata only; its class guards
// pull in Better Auth, which these specs never call.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { randomBytes } from "node:crypto";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import { isRlsTestMode } from "../../../test/rls-mode";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { env } from "../../env";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminStaffController } from "./admin-staff.controller";
import { AdminStaffService } from "./admin-staff.service";
import { MANAGER_CODE_PATTERN } from "./staff-profile";

const tag = `${process.pid}-${Date.now()}`;
const service = new AdminStaffService(new AdminAuditService());
const mutableEnv = env as { STAFF_PII_ENC_KEY?: string };
const keyBefore = mutableEnv.STAFF_PII_ENC_KEY;

let ownerUserId: string;
let billingUserId: string;
let memberAdminId: string;
let leadAdminId: string;
let otherAdminId: string;

const as = (userId: string, roles: AdminRole[]): PlatformAdminInfo => ({
    userId,
    platformAdminId: "pa_actor",
    roles,
    permissions: permissionsFor(roles),
    viaBootstrap: false,
});

const owner = () => as(ownerUserId, [Roles.PlatformOwner]);
const billing = () => as(billingUserId, [Roles.Billing]);
const support = () => as(billingUserId, [Roles.Support]);

const base = {
    worksAs: "ACCOUNT_MANAGER_JOB" as const,
    workEmail: "Asha.Rao@Example.com",
    phone: "+91 98000 00000",
    city: "Pune",
    languages: ["English", "Marathi", "English"],
    joinedOn: "2026-10-01",
    engagement: "FULL_TIME" as const,
    capacity: 40,
    onCommission: true,
    emergencyContact: "Ravi Rao, brother",
};

async function staffMember(label: string) {
    const user = await prisma.user.create({
        data: { email: `${label}-${tag}@example.com`, name: label },
    });
    const admin = await prisma.platformAdmin.create({
        data: { userId: user.id },
    });
    return { userId: user.id, platformAdminId: admin.id };
}

describe("staff profile (DB, U18)", () => {
    beforeAll(async () => {
        // A throwaway key for this run only, never a value in the repo.
        mutableEnv.STAFF_PII_ENC_KEY = randomBytes(32).toString("base64");
        ownerUserId = (await staffMember("owner")).userId;
        billingUserId = (await staffMember("billing")).userId;
        memberAdminId = (await staffMember("asha")).platformAdminId;
        leadAdminId = (await staffMember("lead")).platformAdminId;
        otherAdminId = (await staffMember("other")).platformAdminId;
    });

    afterAll(() => {
        mutableEnv.STAFF_PII_ENC_KEY = keyBefore;
    });

    it("reads an empty profile before the first save", async () => {
        await expect(
            service.getProfile({
                staff: support(),
                platformAdminId: memberAdminId,
            }),
        ).resolves.toMatchObject({
            exists: false,
            managerCode: null,
            taxIdSet: false,
        });
    });

    it("refuses an unknown teammate", async () => {
        await expect(
            service.getProfile({ staff: support(), platformAdminId: "nobody" }),
        ).rejects.toThrow("Staff member not found");
    });

    it("creates the profile on the first save, with a generated manager code", async () => {
        const saved = await service.saveProfile({
            staff: owner(),
            platformAdminId: memberAdminId,
            profile: {
                ...base,
                reportsToPlatformAdminId: leadAdminId,
                taxId: "abcde 1234 f",
            },
            reason: "Asha joins as account manager",
        });

        expect(saved).toMatchObject({
            created: true,
            exists: true,
            worksAs: "ACCOUNT_MANAGER_JOB",
            workEmail: "asha.rao@example.com",
            languages: ["English", "Marathi"],
            joinedOn: "2026-10-01",
            reportsToPlatformAdminId: leadAdminId,
            engagement: "FULL_TIME",
            capacity: 40,
            onCommission: true,
            taxIdSet: true,
        });
        expect(saved).not.toHaveProperty("taxIdLast4");
        expect(saved.managerCode).toMatch(MANAGER_CODE_PATTERN);

        // Stored sealed: nothing on the row reads as the tax id.
        const row = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: memberAdminId },
        });
        expect(JSON.stringify(row)).not.toContain("ABCDE1234F");
        expect(
            row.taxIdCiphertext && row.taxIdIv && row.taxIdAuthTag,
        ).toBeTruthy();

        const ledger = await prisma.adminAuditEvent.findMany({
            where: { targetId: memberAdminId },
            orderBy: { createdAt: "asc" },
        });
        expect(ledger.map((e) => e.action).sort()).toEqual(
            ["staff.profile.created", "staff.tax-id.set"].sort(),
        );
        const created = ledger.find(
            (e) => e.action === "staff.profile.created",
        );
        expect(created).toMatchObject({
            actorUserId: ownerUserId,
            permission: "team:write",
            targetType: "platform_admin",
            reason: "Asha joins as account manager",
            outcome: "SUCCESS",
        });
        expect(JSON.stringify(ledger)).not.toContain("ABCDE1234F");
    });

    it("shows only whether a tax id is set without team:pay, and writes no read row", async () => {
        const before = await prisma.adminAuditEvent.count({
            where: { targetId: memberAdminId, action: "staff.tax-id.read" },
        });
        const view = await service.getProfile({
            staff: support(),
            platformAdminId: memberAdminId,
        });
        expect(view.taxIdSet).toBe(true);
        expect(view).not.toHaveProperty("taxIdLast4");
        expect(JSON.stringify(view)).not.toContain("1234F");
        expect(
            await prisma.adminAuditEvent.count({
                where: { targetId: memberAdminId, action: "staff.tax-id.read" },
            }),
        ).toBe(before);
    });

    it("shows the last 4 characters with team:pay, and each read is on the ledger", async () => {
        for (let i = 0; i < 2; i++) {
            const view = await service.getProfile({
                staff: billing(),
                platformAdminId: memberAdminId,
            });
            expect(view.taxIdLast4).toBe("234F");
            expect(JSON.stringify(view)).not.toContain("ABCDE1234F");
        }
        const reads = await prisma.adminAuditEvent.findMany({
            where: { targetId: memberAdminId, action: "staff.tax-id.read" },
        });
        expect(reads).toHaveLength(2);
        expect(reads[0]).toMatchObject({
            actorUserId: billingUserId,
            permission: "team:pay",
            outcome: "SUCCESS",
        });
    });

    it("leaves the tax id and manager code as they are when a save leaves the tax id out", async () => {
        const first = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: memberAdminId },
        });
        const saved = await service.saveProfile({
            staff: owner(),
            platformAdminId: memberAdminId,
            profile: { ...base, city: "Nashik", capacity: null },
            reason: "Moved to the Nashik office",
        });
        expect(saved).toMatchObject({
            created: false,
            city: "Nashik",
            capacity: null,
            reportsToPlatformAdminId: null,
            managerCode: first.managerCode,
            taxIdSet: true,
        });
        const after = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: memberAdminId },
        });
        expect(after.taxIdCiphertext).toBe(first.taxIdCiphertext);

        const updated = await prisma.adminAuditEvent.findFirstOrThrow({
            where: { targetId: memberAdminId, action: "staff.profile.updated" },
        });
        expect(updated.metadata).toEqual({
            changed: ["city", "reportsToPlatformAdminId", "capacity"],
            taxIdReplaced: false,
        });
        expect(
            await prisma.adminAuditEvent.count({
                where: {
                    targetId: memberAdminId,
                    action: {
                        in: ["staff.tax-id.set", "staff.tax-id.replaced"],
                    },
                },
            }),
        ).toBe(1);
    });

    it("replaces the tax id when one is sent, on the ledger", async () => {
        await service.saveProfile({
            staff: owner(),
            platformAdminId: memberAdminId,
            profile: { ...base, taxId: "PQRSX9876Z" },
            reason: "New PAN card",
        });
        const view = await service.getProfile({
            staff: owner(),
            platformAdminId: memberAdminId,
        });
        expect(view.taxIdLast4).toBe("876Z");
        await expect(
            prisma.adminAuditEvent.findFirst({
                where: {
                    targetId: memberAdminId,
                    action: "staff.tax-id.replaced",
                },
            }),
        ).resolves.toMatchObject({
            permission: "team:pay",
            reason: "New PAN card",
        });
    });

    it("refuses a tax id from a profile writer without team:pay", async () => {
        const writerOnly: PlatformAdminInfo = {
            ...owner(),
            permissions: owner().permissions.filter((p) => p !== "team:pay"),
        };
        await expect(
            service.saveProfile({
                staff: writerOnly,
                platformAdminId: memberAdminId,
                profile: { ...base, taxId: "ZZZZZ0000Z" },
                reason: "Trying to change it",
            }),
        ).rejects.toThrow(ForbiddenException);
    });

    it("refuses a save without a reason, or reporting to themselves", async () => {
        await expect(
            service.saveProfile({
                staff: owner(),
                platformAdminId: memberAdminId,
                profile: base,
                reason: " ",
            }),
        ).rejects.toThrow("Give a reason");
        await expect(
            service.saveProfile({
                staff: owner(),
                platformAdminId: memberAdminId,
                profile: { ...base, reportsToPlatformAdminId: memberAdminId },
                reason: "Reports to self",
            }),
        ).rejects.toThrow("Nobody reports to themselves.");
    });

    it("gives every teammate their own manager code", async () => {
        const other = await service.saveProfile({
            staff: owner(),
            platformAdminId: otherAdminId,
            profile: { worksAs: "OTHER" },
            reason: "Support teammate's record",
        });
        const mine = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: memberAdminId },
        });
        expect(other.managerCode).toMatch(MANAGER_CODE_PATTERN);
        expect(other.managerCode).not.toBe(mine.managerCode);
        expect(other.taxIdSet).toBe(false);

        // The code is the database's to keep unique, whoever writes it.
        await expect(
            prisma.staffProfile.update({
                where: { platformAdminId: otherAdminId },
                data: { managerCode: mine.managerCode },
            }),
        ).rejects.toMatchObject({ code: "P2002" });
    });
});

describe("the database's own rules (U18)", () => {
    // `db push` builds no CHECKs; only `TEST_RLS=on` replays the migrations.
    const checked = isRlsTestMode() ? it : it.skip;

    it("records an Account manager role assignment", async () => {
        await expect(
            prisma.platformAdminRoleAssignment.create({
                data: {
                    platformAdminId: memberAdminId,
                    role: Roles.AccountManager,
                    reason: "Looks after Pune businesses",
                },
            }),
        ).resolves.toMatchObject({ role: "ACCOUNT_MANAGER" });
    });

    checked("refuses a role the registry doesn't have", async () => {
        await expect(
            prisma.platformAdminRoleAssignment.create({
                data: {
                    platformAdminId: memberAdminId,
                    role: "ACCOUNT_MANAGER_JOB",
                    reason: "A job is not a console role",
                },
            }),
        ).rejects.toThrow(/PlatformAdminRoleAssignment_role_check/);
    });

    checked(
        "refuses a typed manager code, an unknown job and half a tax id",
        async () => {
            const make = (data: Record<string, unknown>) =>
                prisma.staffProfile.create({
                    data: {
                        platformAdminId: leadAdminId,
                        worksAs: "OTHER",
                        managerCode: "ABCDEFGH",
                        ...data,
                    },
                });
            await expect(make({ managerCode: "abc-0001" })).rejects.toThrow(
                /StaffProfile_managerCode_check/,
            );
            await expect(make({ worksAs: "SALES" })).rejects.toThrow(
                /StaffProfile_worksAs_check/,
            );
            await expect(make({ taxIdCiphertext: "x" })).rejects.toThrow(
                /StaffProfile_taxId_sealed_check/,
            );
        },
    );
});

describe("staff profile routes refuse without the permission (U18)", () => {
    const guard = new PlatformPermissionGuard(new Reflector());
    const proto = AdminStaffController.prototype as unknown as Record<
        string,
        () => unknown
    >;
    const context = (handler: string, roles: AdminRole[]) =>
        ({
            getHandler: () => proto[handler],
            getClass: () => AdminStaffController,
            switchToHttp: () => ({
                getRequest: () => ({ platformAdmin: as("u", roles) }),
            }),
        }) as unknown as ExecutionContext;

    it.each([
        ["profile", Roles.AccountManager],
        ["profile", Roles.Operations],
        ["profile", Roles.ReleaseManager],
        ["saveProfile", Roles.AccountManager],
        ["saveProfile", Roles.Support],
        ["saveProfile", Roles.Billing],
        ["saveProfile", Roles.Auditor],
    ] as const)("refuses %s to %s with 403", (handler, role) => {
        expect(() => guard.canActivate(context(handler, [role]))).toThrow(
            ForbiddenException,
        );
    });

    it.each([
        ["profile", Roles.Support],
        ["profile", Roles.Billing],
        ["profile", Roles.Auditor],
        ["saveProfile", Roles.PlatformOwner],
    ] as const)("lets %s through for %s", (handler, role) => {
        expect(guard.canActivate(context(handler, [role]))).toBe(true);
    });
});
