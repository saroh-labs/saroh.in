jest.mock("@saroh/database", () => {
    const prisma = {
        user: { findUnique: jest.fn(), findMany: jest.fn() },
        session: {
            deleteMany: jest.fn(),
            findFirst: jest.fn(async () => null),
        },
        organizationInvitation: { findFirst: jest.fn() },
        membership: { count: jest.fn() },
        signInEmailChange: { findFirst: jest.fn(async () => null) },
        adminAuditEvent: { findMany: jest.fn(async () => []) },
        $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
            callback(prisma),
        ),
    };
    return { prisma };
});

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OrganizationMembersService } from "../organizations/organization-members.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminPeopleService } from "./admin-people.service";

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
        updateRole: jest.fn(async () => ({
            userId: "u1",
            role: "ADMIN",
            siteIds: [],
        })),
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
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: "u1" });
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
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
        const { service } = build();
        await expect(
            service.endSessions(staff, "ghost", "Compromised"),
        ).rejects.toBeInstanceOf(NotFoundException);
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
            prisma,
            expect.objectContaining({
                action: "person.role.changed",
                organizationId: "org_1",
                reason: "Owner asked by email",
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
