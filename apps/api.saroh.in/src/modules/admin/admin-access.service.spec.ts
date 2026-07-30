jest.mock("@saroh/database", () => {
    const prisma = {
        organization: {
            findUnique: jest.fn(),
        },
        platformAdmin: {
            findUnique: jest.fn(),
        },
        adminAccessSession: {
            create: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import {
    AdminAccessService,
    assertOrganizationLifecycleTransition,
    OrganizationLifecycleStatus,
} from "./admin-access.service";
import type { AdminAuditService } from "./admin-audit.service";

const organizationFindUnique = prisma.organization.findUnique as jest.Mock;
const platformAdminFindUnique = prisma.platformAdmin.findUnique as jest.Mock;
const sessionCreate = prisma.adminAccessSession.create as jest.Mock;
const sessionFindUnique = prisma.adminAccessSession.findUnique as jest.Mock;
const sessionUpdate = prisma.adminAccessSession.update as jest.Mock;
const sessionUpdateMany = prisma.adminAccessSession.updateMany as jest.Mock;

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "platform_admin_1",
    roles: ["SUPPORT"],
    permissions: ["organization:view-as"],
    viaBootstrap: false,
};

const activeSession = {
    id: "access_1",
    organizationId: "org_1",
    actorUserId: "staff_1",
    platformAdminId: "platform_admin_1",
    reason: "Investigating customer report",
    scope: "READ_ONLY",
    expiresAt: new Date("2026-07-30T10:30:00.000Z"),
    revokedAt: null,
    platformAdmin: { revokedAt: null },
};

describe("Organization lifecycle state machine", () => {
    it.each([
        ["ACTIVE", "SUSPENDED"],
        ["ACTIVE", "PENDING_DELETION"],
        ["SUSPENDED", "ACTIVE"],
        ["SUSPENDED", "PENDING_DELETION"],
        ["PENDING_DELETION", "ACTIVE"],
        ["PENDING_DELETION", "SUSPENDED"],
        ["PENDING_DELETION", "DELETED_RETAINED"],
    ] as const)("allows %s → %s", (from, to) => {
        expect(() =>
            assertOrganizationLifecycleTransition(from, to),
        ).not.toThrow();
    });

    it.each([
        ["ACTIVE", "DELETED_RETAINED"],
        ["SUSPENDED", "DELETED_RETAINED"],
        ["DELETED_RETAINED", "ACTIVE"],
        ["DELETED_RETAINED", "SUSPENDED"],
        ["DELETED_RETAINED", "PENDING_DELETION"],
    ] as const)("rejects %s → %s", (from, to) => {
        expect(() => assertOrganizationLifecycleTransition(from, to)).toThrow(
            ConflictException,
        );
    });

    it("defines the complete fixed lifecycle vocabulary", () => {
        expect(Object.values(OrganizationLifecycleStatus)).toEqual([
            "ACTIVE",
            "SUSPENDED",
            "PENDING_DELETION",
            "DELETED_RETAINED",
        ]);
    });
});

describe("AdminAccessService", () => {
    const audit = {
        write: jest.fn(),
        recordRead: jest.fn(),
    };
    const service = new AdminAccessService(
        audit as unknown as AdminAuditService,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers().setSystemTime(
            new Date("2026-07-30T10:00:00.000Z"),
        );
        organizationFindUnique.mockResolvedValue({
            id: "org_1",
            lifecycleStatus: "ACTIVE",
        });
        sessionCreate.mockImplementation(
            async ({ data }: { data: Record<string, unknown> }) => ({
                id: "access_1",
                ...data,
            }),
        );
        sessionFindUnique.mockImplementation(
            async ({
                where,
            }: {
                where: { id?: string; idempotencyKey?: string };
            }) => (where.idempotencyKey ? null : activeSession),
        );
        platformAdminFindUnique.mockResolvedValue({ revokedAt: null });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it("requires a meaningful reason before opening access", async () => {
        await expect(
            service.open({
                organizationId: "org_1",
                staff,
                reason: "x",
                idempotencyKey: "access-open-123",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(sessionCreate).not.toHaveBeenCalled();
    });

    it("opens read-only access for exactly 30 minutes and audits atomically", async () => {
        const result = await service.open({
            organizationId: "org_1",
            staff,
            reason: "Investigating customer report",
            idempotencyKey: "access-open-123",
        });

        expect(sessionUpdateMany).toHaveBeenCalledWith({
            where: {
                actorUserId: "staff_1",
                organizationId: "org_1",
                revokedAt: null,
            },
            data: {
                revokedAt: new Date("2026-07-30T10:00:00.000Z"),
                revokedByUserId: "staff_1",
            },
        });
        expect(sessionCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                actorUserId: "staff_1",
                platformAdminId: "platform_admin_1",
                scope: "READ_ONLY",
                expiresAt: new Date("2026-07-30T10:30:00.000Z"),
            }),
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.access.open",
                organizationId: "org_1",
                outcome: "SUCCESS",
            }),
        );
        expect(result.expiresAt).toEqual(new Date("2026-07-30T10:30:00.000Z"));
    });

    it("refuses access for an unknown Organization", async () => {
        organizationFindUnique.mockResolvedValue(null);

        await expect(
            service.open({
                organizationId: "missing",
                staff,
                reason: "Investigating customer report",
                idempotencyKey: "access-open-123",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("replays an existing idempotency key without opening another session", async () => {
        sessionFindUnique.mockResolvedValue(activeSession);

        const result = await service.open({
            organizationId: "org_1",
            staff,
            reason: "Investigating customer report",
            idempotencyKey: "access-open-123",
        });

        expect(result).toEqual(activeSession);
        expect(organizationFindUnique).not.toHaveBeenCalled();
        expect(sessionUpdateMany).not.toHaveBeenCalled();
        expect(sessionCreate).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("authorizes a read for the same Organization and active staff grant", async () => {
        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_1",
                staff,
                intent: "READ",
            }),
        ).resolves.toEqual(activeSession);
    });

    it("rejects every write through a read-only access session", async () => {
        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_1",
                staff,
                intent: "WRITE",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(audit.recordRead).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "organization.access.denied",
                outcome: "DENIED",
                metadata: expect.objectContaining({ reasonCode: "READ_ONLY" }),
            }),
        );
    });

    it("rejects an Organization mismatch without disclosing the session", async () => {
        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_other",
                staff,
                intent: "READ",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("expires and audits a stale session", async () => {
        sessionFindUnique.mockResolvedValue({
            ...activeSession,
            expiresAt: new Date("2026-07-30T09:59:00.000Z"),
        });

        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_1",
                staff,
                intent: "READ",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { id: "access_1" },
            data: {
                revokedAt: new Date("2026-07-30T10:00:00.000Z"),
                revokedByUserId: null,
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.access.expired",
                outcome: "DENIED",
            }),
        );
    });

    it("rejects a session after its staff grant is revoked", async () => {
        platformAdminFindUnique.mockResolvedValue({
            revokedAt: new Date("2026-07-30T09:55:00.000Z"),
        });

        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_1",
                staff,
                intent: "READ",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("revokes the matching session and records who closed it", async () => {
        await service.revoke({
            sessionId: "access_1",
            organizationId: "org_1",
            staff,
            reason: "Investigation complete",
        });

        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { id: "access_1" },
            data: {
                revokedAt: new Date("2026-07-30T10:00:00.000Z"),
                revokedByUserId: "staff_1",
                revocationReason: "Investigation complete",
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "organization.access.close",
                outcome: "SUCCESS",
            }),
        );
    });
});
