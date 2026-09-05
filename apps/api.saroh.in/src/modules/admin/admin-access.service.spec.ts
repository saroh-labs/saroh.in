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
        // SEC-008: denials go through `write`, not `recordRead`. `recordRead`
        // swallows audit failures — a fair trade for a read that SUCCEEDED,
        // since an audit outage should not turn a good response into an error.
        // A denial is the opposite: it is the security-relevant event, and
        // losing it quietly leaves an incident with no evidence it happened.
        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
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

    // SEC-007's other half. Revocation is the control an incident depends on,
    // and it only means anything if the NEXT request stops being authorized —
    // with no background job in between, since a session revoked by a colleague
    // during an incident cannot wait for a sweep to notice.
    it("stops authorizing as soon as the session is revoked, whoever revoked it", async () => {
        sessionFindUnique.mockResolvedValue({
            ...activeSession,
            revokedAt: new Date("2026-07-30T10:00:00.000Z"),
            revokedByUserId: "staff_2",
            platformAdmin: { revokedAt: null },
        });

        await expect(
            service.authorize({
                sessionId: "access_1",
                organizationId: "org_1",
                staff,
                intent: "READ",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                outcome: "DENIED",
                metadata: expect.objectContaining({ reasonCode: "REVOKED" }),
            }),
        );
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

describe("cross-staff revocation (SEC-007)", () => {
    let service: AdminAccessService;
    let audit: { write: jest.Mock; recordRead: jest.Mock };

    beforeEach(() => {
        jest.clearAllMocks();
        audit = { write: jest.fn(), recordRead: jest.fn() };
        service = new AdminAccessService(audit as unknown as AdminAuditService);
    });

    /** A second staff member, holding the same permission. */
    const otherStaff: PlatformAdminInfo = {
        userId: "staff_2",
        platformAdminId: "platform_admin_2",
        roles: ["PLATFORM_OWNER"],
        permissions: ["organization:view-as"],
        viaBootstrap: false,
    };

    it("lets one staff member revoke another's session", async () => {
        // Previously `revoke` required session.actorUserId === staff.userId, so
        // a session could only be closed by the person who opened it. Nobody
        // could shut down a colleague's access — the one revocation that
        // matters during an incident.
        sessionFindUnique.mockResolvedValue({
            ...activeSession,
            actorUserId: "staff_1",
        });
        sessionUpdate.mockResolvedValue({});

        await expect(
            service.revoke({
                sessionId: "access_1",
                organizationId: "org_1",
                staff: otherStaff,
                reason: "Colleague went off shift mid-incident",
                idempotencyKey: undefined,
            }),
        ).resolves.toBeUndefined();

        expect(sessionUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    revokedByUserId: "staff_2",
                }),
            }),
        );
    });

    it("still refuses a session belonging to a different Organization", async () => {
        // Widening to any staff member must not widen across tenants.
        sessionFindUnique.mockResolvedValue({
            ...activeSession,
            organizationId: "org_OTHER",
        });

        await expect(
            service.revoke({
                sessionId: "access_1",
                organizationId: "org_1",
                staff: otherStaff,
                reason: "Should not be permitted",
                idempotencyKey: undefined,
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(sessionUpdate).not.toHaveBeenCalled();
    });

    it("records the revoker, not the opener, in the audit trail", async () => {
        sessionFindUnique.mockResolvedValue(activeSession);
        sessionUpdate.mockResolvedValue({});

        await service.revoke({
            sessionId: "access_1",
            organizationId: "org_1",
            staff: otherStaff,
            reason: "Closing a colleague's stale session",
            idempotencyKey: undefined,
        });

        expect(audit.write).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                action: "organization.access.close",
                actorUserId: "staff_2",
            }),
        );
    });
});
