jest.mock("@saroh/database", () => {
    const prisma = {
        user: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
            update: jest.fn(),
        },
        platformAdmin: { findUnique: jest.fn(async () => null) },
        session: {
            deleteMany: jest.fn(),
            findFirst: jest.fn(async () => null),
        },
        organizationInvitation: { findFirst: jest.fn() },
        membership: {
            count: jest.fn(),
            findUnique: jest.fn(async () => ({ role: "MEMBER" })),
            findMany: jest.fn(async () => []),
        },
        ownerChangeRequest: {
            create: jest.fn(async () => ({ id: "ocr_1" })),
            findFirst: jest.fn(),
            updateMany: jest.fn(async () => ({ count: 1 })),
        },
        organization: {
            findUnique: jest.fn(async () => ({
                name: "Rye",
                edition: "INDIA",
            })),
        },
        signInEmailChange: { findFirst: jest.fn(async () => null) },
        adminAuditEvent: { findMany: jest.fn(async () => []) },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

jest.mock("../../common/email", () => ({
    sendOwnerChangedNotice: jest.fn(async () => undefined),
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendOwnerChangedNotice } from "../../common/email";
import type {
    InTxLedger,
    OrganizationMembersService,
} from "../organizations/organization-members.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminPeopleService } from "./admin-people.service";

// The members service hands the ledger its transaction; here, the mock.
const TX = prisma as never;

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [],
    viaBootstrap: false,
    edition: null,
};

function build() {
    const members = {
        // Each runs the admin ledger write inside its own transaction.
        updateRole: jest.fn(
            async (
                _ctx: unknown,
                _userId: string,
                _dto: unknown,
                ledger?: InTxLedger,
            ) => {
                await ledger?.(TX, { from: "MEMBER", to: "ADMIN" });
                return { userId: "u1", role: "ADMIN", siteIds: [] };
            },
        ),
        remove: jest.fn(async () => ({ removed: true })),
        invite: jest.fn(),
        revokeInvitation: jest.fn(async () => ({ revoked: true })),
    };
    const audit = { write: jest.fn() };
    return {
        service: new AdminPeopleService(
            members as unknown as OrganizationMembersService,
            audit as unknown as AdminAuditService,
        ),
        members,
        audit,
    };
}

beforeEach(() => jest.clearAllMocks());

describe("AdminPeopleService", () => {
    it("ends every session, which is what signs a person out", async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: "u1",
            email: "u1@example.com",
        });
        (prisma.session.deleteMany as jest.Mock).mockResolvedValue({
            count: 3,
        });
        const { service, audit } = build();

        await expect(
            service.endSessions(staff, "u1", "Account reported compromised"),
        ).resolves.toEqual({ ended: 3 });
        expect(prisma.session.deleteMany).toHaveBeenCalledWith({
            where: { userId: "u1" },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "person.sessions.ended",
                targetId: "u1",
            }),
        );
    });

    it("refuses to end sessions for nobody", async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
        const { service } = build();
        await expect(
            service.endSessions(staff, "ghost", "Compromised"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("reads the person on the console's edition only (A3, A4)", async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
        const { service } = build();
        const india = { ...staff, edition: "INDIA" } as PlatformAdminInfo;
        await expect(
            service.endSessions(india, "u1", "Compromised"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.setExtraFreeBusinesses(india, "u1", 1, "Agreed by email"),
        ).rejects.toBeInstanceOf(NotFoundException);
        for (const [args] of (prisma.user.findFirst as jest.Mock).mock
            .calls as [{ where: Record<string, unknown> }][]) {
            expect(args.where).toMatchObject({
                id: "u1",
                OR: expect.any(Array),
            });
        }
        expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("lets only a Platform owner end a staff member's sessions (A3)", async () => {
        (prisma.user.findFirst as jest.Mock).mockResolvedValue({
            id: "owner_1",
            email: "owner@example.com",
        });
        (prisma.platformAdmin.findUnique as jest.Mock).mockResolvedValue({
            revokedAt: null,
        });
        const { service, audit } = build();
        await expect(
            service.endSessions(staff, "owner_1", "Incident"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(prisma.session.deleteMany).not.toHaveBeenCalled();
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                action: "person.sessions.ended",
                outcome: "DENIED",
            }),
        );

        (prisma.session.deleteMany as jest.Mock).mockResolvedValue({
            count: 1,
        });
        const owner = {
            ...staff,
            userId: "owner_2",
            roles: ["PLATFORM_OWNER"],
        } as PlatformAdminInfo;
        await expect(
            service.endSessions(owner, "owner_1", "Incident"),
        ).resolves.toEqual({ ended: 1 });
    });

    it("changes a role as the operator, through the business's own rules", async () => {
        const { service, members, audit } = build();
        await service.changeRole({
            staff,
            organizationId: "org_1",
            userId: "u1",
            role: "ADMIN",
            reason: "Owner asked by email",
        });

        const [ctx] = members.updateRole.mock.calls[0] as unknown as [
            { userId: string; organizationId: string; actions: Set<string> },
        ];
        // The business's audit names the operator, and nothing about the
        // operator's own reach stops them.
        expect(ctx.userId).toBe("staff_1");
        expect(ctx.organizationId).toBe("org_1");
        expect(ctx.actions.has("member:role:update")).toBe(true);
        expect(audit.write).toHaveBeenCalledWith(
            TX,
            expect.objectContaining({
                action: "person.role.changed",
                organizationId: "org_1",
                reason: "Owner asked by email",
                metadata: { role: "ADMIN", from: "MEMBER", to: "ADMIN" },
            }),
        );
    });

    it("lets the business's last-owner rule stand", async () => {
        const { service, members, audit } = build();
        members.remove.mockRejectedValue(new BadRequestException("last owner"));
        await expect(
            service.removeMember({
                staff,
                organizationId: "org_1",
                userId: "owner",
                reason: "Asked to leave",
            }),
        ).rejects.toThrow("last owner");
        expect(audit.write).not.toHaveBeenCalled();
    });

    describe("an Owner change needs a second staff member (F3)", () => {
        const other: PlatformAdminInfo = { ...staff, userId: "staff_2" };
        const membership = prisma.membership.findUnique as jest.Mock;
        const requests = prisma.ownerChangeRequest as unknown as Record<
            string,
            jest.Mock
        >;

        it("making an Owner is only asked for, on the ledger in the same transaction", async () => {
            const { service, members, audit } = build();
            await expect(
                service.changeRole({
                    staff,
                    organizationId: "org_1",
                    userId: "u1",
                    role: "OWNER",
                    reason: "Owner asked by email",
                }),
            ).resolves.toEqual({ pending: true, requestId: "ocr_1" });
            expect(members.updateRole).not.toHaveBeenCalled();
            expect(requests.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        kind: "ROLE",
                        role: "OWNER",
                        fromRole: "MEMBER",
                        requestedByUserId: "staff_1",
                    }),
                }),
            );
            expect(audit.write).toHaveBeenCalledWith(
                prisma,
                expect.objectContaining({
                    action: "person.owner-change.requested",
                    outcome: "SUCCESS",
                }),
            );
        });

        it.each([
            ["demoting", "ADMIN"],
            ["removing", null],
        ])("%s an Owner is only asked for", async (_what, role) => {
            membership.mockResolvedValueOnce({ role: "OWNER" });
            const { service, members } = build();
            const input = {
                staff,
                organizationId: "org_1",
                userId: "u1",
                reason: "Owner asked by email",
            };
            const result = role
                ? await service.changeRole({ ...input, role })
                : await service.removeMember(input);
            expect(result).toMatchObject({ pending: true });
            expect(members.updateRole).not.toHaveBeenCalled();
            expect(members.remove).not.toHaveBeenCalled();
        });

        it("refuses a direct change to someone who became an Owner meanwhile", async () => {
            const { service, members, audit } = build();
            members.updateRole.mockImplementationOnce(
                async (_c, _u, _d, ledger?: InTxLedger) => {
                    await ledger?.(TX, { from: "OWNER", to: "ADMIN" });
                    return { userId: "u1", role: "ADMIN", siteIds: [] };
                },
            );
            await expect(
                service.changeRole({
                    staff,
                    organizationId: "org_1",
                    userId: "u1",
                    role: "ADMIN",
                    reason: "Owner asked by email",
                }),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(audit.write).not.toHaveBeenCalled();
        });

        it("the one who asked can't confirm it", async () => {
            requests.findFirst.mockResolvedValue({
                id: "ocr_1",
                userId: "u1",
                kind: "ROLE",
                role: "OWNER",
                reason: "Owner asked by email",
                requestedByUserId: "staff_1",
            });
            const { service, members, audit } = build();
            await expect(
                service.confirmOwnerChange({
                    staff,
                    organizationId: "org_1",
                    requestId: "ocr_1",
                    reason: "Checked with the owner",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(members.updateRole).not.toHaveBeenCalled();
            expect(audit.write).toHaveBeenCalledWith(
                prisma,
                expect.objectContaining({ outcome: "DENIED" }),
            );
        });

        it("the person the change is about can't confirm it", async () => {
            requests.findFirst.mockResolvedValue({
                id: "ocr_1",
                userId: "staff_2",
                kind: "ROLE",
                role: "OWNER",
                reason: "Owner asked by email",
                requestedByUserId: "staff_1",
            });
            const { service, members, audit } = build();
            await expect(
                service.confirmOwnerChange({
                    staff: other,
                    organizationId: "org_1",
                    requestId: "ocr_1",
                    reason: "Checked with the owner",
                }),
            ).rejects.toBeInstanceOf(ForbiddenException);
            expect(members.updateRole).not.toHaveBeenCalled();
            expect(requests.updateMany).not.toHaveBeenCalled();
            expect(audit.write).toHaveBeenCalledWith(
                prisma,
                expect.objectContaining({
                    outcome: "DENIED",
                    actorUserId: "staff_2",
                    metadata: { requestId: "ocr_1", subjectConfirm: true },
                }),
            );
        });

        it("a second staff member applies it, marks it and tells the Owners", async () => {
            requests.findFirst.mockResolvedValue({
                id: "ocr_1",
                userId: "u1",
                kind: "ROLE",
                role: "OWNER",
                reason: "Owner asked by email",
                requestedByUserId: "staff_1",
            });
            (prisma.membership.findMany as jest.Mock).mockResolvedValue([
                { user: { email: "owner@example.test" } },
            ]);
            const { service, members, audit } = build();
            await service.confirmOwnerChange({
                staff: other,
                organizationId: "org_1",
                requestId: "ocr_1",
                reason: "Checked with the owner",
            });
            expect(members.updateRole).toHaveBeenCalledWith(
                expect.objectContaining({ userId: "staff_2" }),
                "u1",
                { role: "OWNER" },
                expect.any(Function),
            );
            expect(requests.updateMany).toHaveBeenCalledWith({
                where: { id: "ocr_1", confirmedAt: null },
                data: expect.objectContaining({ confirmedByUserId: "staff_2" }),
            });
            expect(audit.write).toHaveBeenCalledWith(
                TX,
                expect.objectContaining({
                    action: "person.role.changed",
                    actorUserId: "staff_2",
                    metadata: expect.objectContaining({
                        requestId: "ocr_1",
                        requestedBy: "staff_1",
                    }),
                }),
            );
            expect(sendOwnerChangedNotice).toHaveBeenCalledWith(
                "owner@example.test",
                expect.objectContaining({ business: "Rye", added: true }),
                "INDIA",
            );
        });

        it("a confirm that lost the race changes nothing on the ledger", async () => {
            requests.findFirst.mockResolvedValue({
                id: "ocr_1",
                userId: "u1",
                kind: "ROLE",
                role: "OWNER",
                reason: "r",
                requestedByUserId: "staff_1",
            });
            requests.updateMany.mockResolvedValueOnce({ count: 0 });
            const { service, audit } = build();
            await expect(
                service.confirmOwnerChange({
                    staff: other,
                    organizationId: "org_1",
                    requestId: "ocr_1",
                    reason: "Checked with the owner",
                }),
            ).rejects.toBeInstanceOf(ConflictException);
            expect(audit.write).not.toHaveBeenCalled();
            expect(sendOwnerChangedNotice).not.toHaveBeenCalled();
        });
    });

    it("resends an invitation with the role it was sent with", async () => {
        (
            prisma.organizationInvitation.findFirst as jest.Mock
        ).mockResolvedValue({
            email: "new@example.test",
            role: "MEMBER",
            siteIds: [],
        });
        const { service, members } = build();
        await service.resendInvitation({
            staff,
            organizationId: "org_1",
            invitationId: "inv_1",
            reason: "Link expired",
        });
        expect(members.invite).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "staff_1" }),
            { email: "new@example.test", role: "MEMBER", siteIds: [] },
            expect.any(Function),
        );
    });

    describe("a person's other edition", () => {
        const person = {
            id: "u1",
            name: "Asha",
            email: "asha@example.test",
            emailVerified: true,
            emailVerifiedByStaffAt: null,
            createdAt: new Date("2026-10-01T00:00:00Z"),
            _count: { memberships: 1 },
            memberships: [],
            sessions: [],
            platformAdmin: null,
        };

        it("counts their businesses elsewhere, and lists only this edition's", async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(person);
            (prisma.membership.count as jest.Mock).mockResolvedValue(2);
            const { service } = build();

            const detail = await service.detail("u1", "GLOBAL");

            expect(detail.otherEditionBusinesses).toBe(2);
            expect(prisma.membership.count).toHaveBeenCalledWith({
                where: {
                    userId: "u1",
                    organization: { edition: { not: "GLOBAL" } },
                },
            });
            const read = (prisma.user.findUnique as jest.Mock).mock
                .calls[0][0] as {
                select: { memberships: { where: unknown } };
            };
            expect(read.select.memberships.where).toEqual({
                organization: { edition: "GLOBAL" },
            });
        });

        it("is 0, with nothing read, on an address of no edition", async () => {
            (prisma.user.findUnique as jest.Mock).mockResolvedValue(person);
            const { service } = build();

            const detail = await service.detail("u1", null);

            expect(detail.otherEditionBusinesses).toBe(0);
            expect(prisma.membership.count).not.toHaveBeenCalled();
        });
    });

    it("needs two characters to search", async () => {
        const { service } = build();
        await expect(service.search({ q: "a" })).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
