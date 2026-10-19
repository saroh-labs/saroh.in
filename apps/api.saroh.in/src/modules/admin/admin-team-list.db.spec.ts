/**
 * The Team screen's reads and Add a teammate (DEC-169, admin console U17)
 * against a real Postgres:
 *
 * - The list (`GET team`, `GET staff`) carries each teammate's job,
 *   capacity and commission flag, and how many businesses they look after
 *   now (open links only), never contact details or a tax id.
 * - A grant that names a job keeps it on the profile: a first profile gets
 *   a manager code; one on file changes only the job and the commission
 *   flag. Naming a job needs `team:write`.
 * - Businesses without a manager come paying first, then the oldest, with
 *   the total; one with an open link isn't there; an Account manager is
 *   refused.
 *
 * Integration project (TEST_DATABASE_URL), plain and `TEST_RLS=on`.
 */
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { AdminAccountManagersService } from "./admin-account-managers.service";
import { AdminAuditService } from "./admin-audit.service";
import type { AdminRole } from "./admin-permissions";
import { AdminRole as Roles, permissionsFor } from "./admin-permissions";
import { AdminStaffService } from "./admin-staff.service";
import { generateManagerCode } from "./staff-profile";

const DAY_MS = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const next = () => (seq += 1);

const audit = new AdminAuditService();
const staffService = new AdminStaffService(audit);
const managers = new AdminAccountManagersService(audit);

interface Staff {
    userId: string;
    platformAdminId: string;
    roles: AdminRole[];
}

async function teammate(
    name: string,
    roles: AdminRole[],
    profile?: { capacity?: number | null; onCommission?: boolean },
): Promise<Staff> {
    const user = await prisma.user.create({
        data: { email: `team-${next()}-${tag}@example.com`, name },
    });
    const admin = await prisma.platformAdmin.create({
        data: {
            userId: user.id,
            roleAssignments: {
                create: roles.map((role) => ({ role, reason: "test grant" })),
            },
        },
    });
    if (profile) {
        await prisma.staffProfile.create({
            data: {
                platformAdminId: admin.id,
                worksAs: "ACCOUNT_MANAGER_JOB",
                managerCode: generateManagerCode(),
                capacity: profile.capacity ?? null,
                onCommission: profile.onCommission ?? false,
                phone: "+91 90000 00000",
            },
        });
    }
    return { userId: user.id, platformAdminId: admin.id, roles };
}

const as = (staff: Staff): PlatformAdminInfo => ({
    userId: staff.userId,
    platformAdminId: staff.platformAdminId,
    roles: staff.roles,
    permissions: permissionsFor(staff.roles),
    viaBootstrap: false,
});

async function business(input: {
    paying?: boolean;
    createdAt: Date;
}): Promise<string> {
    const n = next();
    const org = await prisma.organization.create({
        data: {
            name: `Team list shop ${n}`,
            slug: `adm-team-${n}-${tag}`,
            lifecycleStatus: "ACTIVE",
            createdAt: input.createdAt,
        },
    });
    if (input.paying) {
        const plan = await prisma.plan.create({
            data: {
                key: `team-plan-${n}-${tag}`,
                name: "Grow",
                version: 1,
                interval: "month",
                priceCents: 1,
                entitlements: {},
            },
        });
        await prisma.subscription.create({
            data: {
                organizationId: org.id,
                planId: plan.id,
                status: "ACTIVE",
                provider: "RAZORPAY",
            },
        });
    }
    return org.id;
}

let owner: Staff;
let support: Staff;
let asha: Staff;

beforeAll(async () => {
    owner = await teammate("Meera Owner", [Roles.PlatformOwner]);
    support = await teammate("Sana Support", [Roles.Support]);
    asha = await teammate("Asha Manager", [Roles.AccountManager], {
        capacity: 4,
        onCommission: true,
    });
});

describe("The Team list (DB, U17)", () => {
    it("carries each teammate's job, capacity, commission flag and open businesses", async () => {
        const looked = await business({ createdAt: new Date() });
        const left = await business({ createdAt: new Date() });
        await prisma.accountManagerLink.create({
            data: {
                organizationId: looked,
                platformAdminId: asha.platformAdminId,
                source: "ASSIGNED",
                kind: "ASSIGNED",
                evidence: { source: "ASSIGNED" },
                startedAt: new Date(Date.now() - 2 * DAY_MS),
            },
        });
        await prisma.accountManagerLink.create({
            data: {
                organizationId: left,
                platformAdminId: asha.platformAdminId,
                source: "ASSIGNED",
                kind: "ASSIGNED",
                evidence: { source: "ASSIGNED" },
                startedAt: new Date(Date.now() - 3 * DAY_MS),
                endedAt: new Date(Date.now() - DAY_MS),
                endedReason: "Moved on",
            },
        });

        const list = await staffService.list();
        const row = list.find(
            (m) => m.platformAdminId === asha.platformAdminId,
        );
        expect(row?.profile).toEqual({
            worksAs: "ACCOUNT_MANAGER_JOB",
            capacity: 4,
            onCommission: true,
        });
        expect(row?.businesses).toBe(1);
        // Contact details and the tax id stay on the profile read.
        expect(JSON.stringify(row)).not.toContain("90000");

        const plain = list.find(
            (m) => m.platformAdminId === support.platformAdminId,
        );
        expect(plain?.profile).toBeNull();
        expect(plain?.businesses).toBe(0);
    });
});

describe("Add a teammate: the grant keeps their job (DB, U17)", () => {
    it("creates a first profile with a manager code and the job", async () => {
        const user = await prisma.user.create({
            data: { email: `new-am-${tag}@example.com`, name: "Kiran Rao" },
        });
        const { platformAdminId } = await staffService.grant({
            staff: as(owner),
            email: user.email,
            roles: [Roles.AccountManager],
            reason: "Joining as an account manager",
            worksAs: "FINDS_BUSINESSES",
            onCommission: true,
        });

        const profile = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId },
        });
        expect(profile.worksAs).toBe("FINDS_BUSINESSES");
        expect(profile.onCommission).toBe(true);
        expect(profile.managerCode).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
        // Never their sign-in email: the team sets a work email by hand.
        expect(profile.workEmail).toBeNull();

        const row = await prisma.adminAuditEvent.findFirst({
            where: { action: "staff.granted", targetId: platformAdminId },
        });
        expect(row?.metadata).toMatchObject({
            worksAs: "FINDS_BUSINESSES",
            onCommission: true,
        });
    });

    it("changes only the job and commission flag on a profile already on file", async () => {
        const back = await teammate("Ravi Back", [Roles.Support], {
            capacity: 7,
            onCommission: false,
        });
        const before = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: back.platformAdminId },
        });
        const email = (
            await prisma.user.findUniqueOrThrow({ where: { id: back.userId } })
        ).email;

        await staffService.grant({
            staff: as(owner),
            email,
            roles: [Roles.AccountManager],
            reason: "Now looks after businesses",
            worksAs: "ACCOUNT_MANAGER_JOB",
            onCommission: true,
        });

        const after = await prisma.staffProfile.findUniqueOrThrow({
            where: { platformAdminId: back.platformAdminId },
        });
        expect(after.worksAs).toBe("ACCOUNT_MANAGER_JOB");
        expect(after.onCommission).toBe(true);
        expect(after.managerCode).toBe(before.managerCode);
        expect(after.capacity).toBe(7);
        expect(after.phone).toBe(before.phone);
    });

    it("leaves the profile alone when no job is named", async () => {
        const user = await prisma.user.create({
            data: { email: `no-job-${tag}@example.com`, name: "Dev Auditor" },
        });
        const { platformAdminId } = await staffService.grant({
            staff: as(owner),
            email: user.email,
            roles: [Roles.Auditor],
            reason: "Reads the books",
        });
        expect(
            await prisma.staffProfile.findUnique({
                where: { platformAdminId },
            }),
        ).toBeNull();
    });

    it("refuses a job from someone without team:write", async () => {
        const user = await prisma.user.create({
            data: { email: `refused-${tag}@example.com`, name: "Nisha Jain" },
        });
        await expect(
            staffService.grant({
                staff: {
                    ...as(support),
                    permissions: [
                        ...permissionsFor([Roles.Support]),
                        "staff:grant",
                    ],
                },
                email: user.email,
                roles: [Roles.Support],
                reason: "Trying a job",
                worksAs: "OTHER",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(
            await prisma.platformAdmin.findUnique({
                where: { userId: user.id },
            }),
        ).toBeNull();
    });
});

describe("Businesses without a manager (DB, U17)", () => {
    it("lists them paying first, then the oldest, without the ones that have a manager", async () => {
        const oldFree = await business({
            createdAt: new Date(Date.now() - 400 * DAY_MS),
        });
        const newPaying = await business({
            paying: true,
            createdAt: new Date(Date.now() - DAY_MS),
        });
        const managed = await business({
            createdAt: new Date(Date.now() - 500 * DAY_MS),
        });
        await prisma.accountManagerLink.create({
            data: {
                organizationId: managed,
                platformAdminId: asha.platformAdminId,
                source: "ASSIGNED",
                kind: "ASSIGNED",
                evidence: { source: "ASSIGNED" },
                startedAt: new Date(),
            },
        });

        const { businesses, total } = await managers.unassigned(as(support));
        const ids = businesses.map((b) => b.organizationId);
        expect(total).toBeGreaterThanOrEqual(2);
        expect(ids).not.toContain(managed);
        // Paying ones come before every free one, whatever their age.
        const paying = businesses.findIndex(
            (b) => b.organizationId === newPaying,
        );
        expect(paying).toBeGreaterThanOrEqual(0);
        expect(businesses[paying]).toMatchObject({ paying: true });
        expect(businesses.slice(0, paying).every((b) => b.paying)).toBe(true);
        const free = ids.indexOf(oldFree);
        if (free >= 0) expect(free).toBeGreaterThan(paying);
    });

    it("refuses an Account manager, who sees only their own", async () => {
        await expect(managers.unassigned(as(asha))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});
