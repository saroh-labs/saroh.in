jest.mock("@saroh/database", () => {
    const prisma = {
        user: { findUnique: jest.fn(), findMany: jest.fn() },
        session: {
            deleteMany: jest.fn(),
            findFirst: jest.fn(async () => null),
        },
        organizationInvitation: { findFirst: jest.fn() },
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

    it("needs two characters to search", async () => {
        const { service } = build();
        await expect(service.search("a")).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });
});
