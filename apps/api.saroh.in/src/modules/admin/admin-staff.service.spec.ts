jest.mock("@saroh/database", () => {
    const prisma = {
        user: { findUnique: jest.fn() },
        platformAdmin: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            upsert: jest.fn(),
            update: jest.fn(),
        },
        platformAdminRoleAssignment: {
            findMany: jest.fn(),
            createMany: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        adminAccessSession: { updateMany: jest.fn(async () => ({ count: 1 })) },
        // Account-manager links a revoke or amend ends (U25): none here.
        accountManagerLink: {
            findMany: jest.fn(async () => []),
            updateMany: jest.fn(async () => ({ count: 0 })),
        },
        adminAuditEvent: { create: jest.fn() },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminStaffService } from "./admin-staff.service";

const ownerCount = prisma.platformAdminRoleAssignment.count as jest.Mock;
const assignments = prisma.platformAdminRoleAssignment.findMany as jest.Mock;
const createMany = prisma.platformAdminRoleAssignment.createMany as jest.Mock;
const updateMany = prisma.platformAdminRoleAssignment.updateMany as jest.Mock;
const adminFind = prisma.platformAdmin.findUnique as jest.Mock;
const adminUpsert = prisma.platformAdmin.upsert as jest.Mock;
const userFind = prisma.user.findUnique as jest.Mock;

const owner: PlatformAdminInfo = {
    userId: "owner_1",
    platformAdminId: "pa_owner",
    roles: ["PLATFORM_OWNER"],
    permissions: [],
    viaBootstrap: false,
    edition: null,
};

function service() {
    const audit = { write: jest.fn() } as unknown as AdminAuditService & {
        write: jest.Mock;
    };
    return { service: new AdminStaffService(audit), audit };
}

beforeEach(() => {
    jest.clearAllMocks();
    adminFind.mockResolvedValue({ id: "pa_owner", revokedAt: null });
    assignments.mockResolvedValue([]);
});

describe("AdminStaffService — the last owner", () => {
    it("cannot be revoked", async () => {
        ownerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        const { service: staff } = service();
        await expect(
            staff.revoke({
                staff: owner,
                platformAdminId: "pa_owner",
                reason: "Leaving",
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("cannot be demoted by an amend", async () => {
        assignments.mockResolvedValue([
            { id: "a1", role: "PLATFORM_OWNER", expiresAt: null },
        ]);
        ownerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        const { service: staff } = service();
        await expect(
            staff.amend({
                staff: owner,
                platformAdminId: "pa_owner",
                roles: ["SUPPORT"],
                reason: "Moving to support",
            }),
        ).rejects.toThrow(/nobody who can manage staff/);
    });

    it("cannot be given an expiry that would leave no lasting owner", async () => {
        assignments.mockResolvedValue([
            { id: "a1", role: "PLATFORM_OWNER", expiresAt: null },
        ]);
        ownerCount.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        const { service: staff } = service();
        await expect(
            staff.amend({
                staff: owner,
                platformAdminId: "pa_owner",
                roles: ["PLATFORM_OWNER"],
                reason: "Contract ends",
                expiresAt: new Date(Date.now() + 86_400_000),
            }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("can step down once someone else owns the instance", async () => {
        ownerCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
        const { service: staff, audit } = service();
        await expect(
            staff.revoke({
                staff: owner,
                platformAdminId: "pa_owner",
                reason: "Handing over",
            }),
        ).resolves.toEqual({ platformAdminId: "pa_owner", changed: true });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "staff.revoked",
                reason: "Handing over",
            }),
        );
    });
});

describe("AdminStaffService — granting", () => {
    it("lets an instance with only break-glass access grant its first owner", async () => {
        userFind.mockResolvedValue({ id: "user_2" });
        adminUpsert.mockResolvedValue({
            id: "pa_2",
            revokedAt: null,
            editions: ["INDIA"],
        });
        ownerCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        const { service: staff, audit } = service();

        await expect(
            staff.grant({
                staff: { ...owner, platformAdminId: null, viaBootstrap: true },
                email: "Asha@Example.test ",
                roles: ["PLATFORM_OWNER"],
                reason: "First owner of this instance",
            }),
        ).resolves.toEqual({
            platformAdminId: "pa_2",
            added: ["PLATFORM_OWNER"],
        });
        expect(userFind).toHaveBeenCalledWith(
            expect.objectContaining({ where: { email: "asha@example.test" } }),
        );
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ action: "staff.granted" }),
        );
    });

    it("writes the reason and expiry onto each new role", async () => {
        userFind.mockResolvedValue({ id: "user_3" });
        adminUpsert.mockResolvedValue({
            id: "pa_3",
            revokedAt: null,
            editions: ["INDIA"],
        });
        ownerCount.mockResolvedValue(1);
        const expiresAt = new Date(Date.now() + 7 * 86_400_000);
        const { service: staff } = service();

        await staff.grant({
            staff: owner,
            email: "temp@example.test",
            roles: ["SUPPORT", "AUDITOR"],
            reason: "Covering the holidays",
            expiresAt,
        });
        expect(createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    role: "SUPPORT",
                    reason: "Covering the holidays",
                    expiresAt,
                }),
                expect.objectContaining({ role: "AUDITOR", expiresAt }),
            ],
        });
    });

    it("needs an existing account", async () => {
        userFind.mockResolvedValue(null);
        const { service: staff } = service();
        await expect(
            staff.grant({
                staff: owner,
                email: "nobody@example.test",
                roles: ["SUPPORT"],
                reason: "New hire",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses an unknown role and a past expiry", async () => {
        const { service: staff } = service();
        await expect(
            staff.grant({
                staff: owner,
                email: "a@b.test",
                roles: ["GOD"],
                reason: "Because",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            staff.grant({
                staff: owner,
                email: "a@b.test",
                roles: ["SUPPORT"],
                reason: "Because",
                expiresAt: new Date(Date.now() - 1000),
            }),
        ).rejects.toThrow(/in the future/);
    });
});

describe("AdminStaffService — amending", () => {
    it("revokes what goes and writes what comes, never editing a row", async () => {
        adminFind.mockResolvedValue({ id: "pa_4", revokedAt: null });
        assignments.mockResolvedValue([
            { id: "a_support", role: "SUPPORT", expiresAt: null },
            { id: "a_auditor", role: "AUDITOR", expiresAt: null },
        ]);
        ownerCount.mockResolvedValue(1);
        const { service: staff } = service();

        await staff.amend({
            staff: owner,
            platformAdminId: "pa_4",
            roles: ["SUPPORT", "BILLING"],
            reason: "Now handles billing questions",
        });
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["a_auditor"] } },
            data: { revokedAt: expect.any(Date) },
        });
        expect(createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({ role: "BILLING" })],
        });
    });
});

describe("AdminStaffService — editions (DEC-204)", () => {
    const adminUpdate = prisma.platformAdmin.update as jest.Mock;
    const grantInput = {
        email: "new@example.test",
        roles: ["SUPPORT"],
        reason: "Joining support",
    };

    beforeEach(() => {
        userFind.mockResolvedValue({ id: "user_9" });
        ownerCount.mockResolvedValue(1);
    });

    it("grants the console's own edition by default, India where it has none", async () => {
        adminUpsert.mockImplementation(({ create }) =>
            Promise.resolve({
                id: "pa_9",
                revokedAt: null,
                editions: create.editions,
            }),
        );
        const { service: staff, audit } = service();

        await staff.grant({
            ...grantInput,
            staff: { ...owner, edition: "GLOBAL" },
        });
        expect(adminUpsert.mock.calls[0][0].create.editions).toEqual([
            "GLOBAL",
        ]);
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                metadata: expect.objectContaining({ editions: ["GLOBAL"] }),
            }),
        );

        await staff.grant({ ...grantInput, staff: owner });
        expect(adminUpsert.mock.calls[1][0].create.editions).toEqual(["INDIA"]);
        expect(adminUpdate).not.toHaveBeenCalled();
    });

    it("refuses an empty or unknown choice before anything is written", async () => {
        const { service: staff } = service();
        await expect(
            staff.grant({ ...grantInput, staff: owner, editions: [] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            staff.grant({ ...grantInput, staff: owner, editions: ["MARS"] }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(adminUpsert).not.toHaveBeenCalled();
    });

    it("adds to a teammate's editions, and a reopened grant starts over", async () => {
        const { service: staff } = service();
        adminUpsert.mockResolvedValue({
            id: "pa_9",
            revokedAt: null,
            editions: ["INDIA"],
        });
        await staff.grant({
            ...grantInput,
            staff: owner,
            editions: ["GLOBAL"],
        });
        expect(adminUpdate).toHaveBeenLastCalledWith({
            where: { id: "pa_9" },
            data: { editions: ["INDIA", "GLOBAL"] },
        });

        adminUpsert.mockResolvedValue({
            id: "pa_9",
            revokedAt: new Date(),
            editions: ["INDIA"],
        });
        await staff.grant({
            ...grantInput,
            staff: owner,
            editions: ["GLOBAL"],
        });
        expect(adminUpdate).toHaveBeenLastCalledWith({
            where: { id: "pa_9" },
            data: expect.objectContaining({ editions: ["GLOBAL"] }),
        });
    });

    it("Change sets them exactly, on the ledger, with no role change needed", async () => {
        adminFind.mockResolvedValue({
            id: "pa_9",
            revokedAt: null,
            editions: ["INDIA"],
        });
        assignments.mockResolvedValue([
            { id: "a1", role: "SUPPORT", expiresAt: null },
        ]);
        const { service: staff, audit } = service();

        await expect(
            staff.amend({
                staff: owner,
                platformAdminId: "pa_9",
                roles: ["SUPPORT"],
                reason: "Moved to Global",
                editions: ["GLOBAL"],
            }),
        ).resolves.toEqual({ platformAdminId: "pa_9", changed: true });
        expect(adminUpdate).toHaveBeenCalledWith({
            where: { id: "pa_9" },
            data: { editions: ["GLOBAL"] },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "staff.amended",
                reason: "Moved to Global",
                metadata: expect.objectContaining({
                    editions: ["GLOBAL"],
                    editionsBefore: ["INDIA"],
                }),
            }),
        );
    });

    it("Change with the same editions, or none sent, changes nothing", async () => {
        adminFind.mockResolvedValue({
            id: "pa_9",
            revokedAt: null,
            editions: ["INDIA", "GLOBAL"],
        });
        assignments.mockResolvedValue([
            { id: "a1", role: "SUPPORT", expiresAt: null },
        ]);
        const { service: staff } = service();
        const change = {
            staff: owner,
            platformAdminId: "pa_9",
            roles: ["SUPPORT"],
            reason: "No change",
        };

        await expect(
            staff.amend({ ...change, editions: ["GLOBAL", "INDIA"] }),
        ).resolves.toEqual({ platformAdminId: "pa_9", changed: false });
        await expect(staff.amend(change)).resolves.toEqual({
            platformAdminId: "pa_9",
            changed: false,
        });
        expect(adminUpdate).not.toHaveBeenCalled();
    });
});
