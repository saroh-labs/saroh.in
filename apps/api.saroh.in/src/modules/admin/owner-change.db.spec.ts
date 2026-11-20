/**
 * Making an Owner takes two staff members (review F3), against a real
 * Postgres: the first only records a request, the one who asked can't
 * confirm it, and a second one applies it, marks the request and puts it
 * on the admin ledger in one transaction, then emails the Owners.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../common/email", () => ({
    ...jest.requireActual("../../common/email"),
    sendOwnerChangedNotice: jest.fn(async () => undefined),
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { sendOwnerChangedNotice } from "../../common/email";
import { AuditService } from "../audit/audit.service";
import { OrganizationMembersService } from "../organizations/organization-members.service";
import { AdminAuditService } from "./admin-audit.service";
import {
    AdminPeopleService,
    pendingOwnerChanges,
} from "./admin-people.service";

const people = new AdminPeopleService(
    new OrganizationMembersService(new AuditService()),
    new AdminAuditService(),
);

const tag = `owner-change-${process.pid}`;
let organizationId: string;
let memberId: string;
let first: PlatformAdminInfo;
let second: PlatformAdminInfo;

function staffOf(userId: string): PlatformAdminInfo {
    return {
        userId,
        platformAdminId: null,
        roles: ["SUPPORT"],
        permissions: [],
        viaBootstrap: true,
        edition: null,
    };
}

beforeAll(async () => {
    const organization = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: tag },
    });
    organizationId = organization.id;
    const [owner, member, one, two] = await Promise.all(
        ["owner", "member", "staff-1", "staff-2"].map((who) =>
            prisma.user.create({
                data: { email: `${who}-${tag}@example.com`, name: who },
            }),
        ),
    );
    memberId = member!.id;
    first = staffOf(one!.id);
    second = staffOf(two!.id);
    await prisma.membership.createMany({
        data: [
            { organizationId, userId: owner!.id, role: "OWNER" },
            { organizationId, userId: member!.id, role: "MEMBER" },
        ],
    });
});

const roleOf = async (userId: string) =>
    (
        await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
        })
    )?.role;

describe("an Owner change takes two staff members (real database)", () => {
    it("asks, refuses the asker's confirm, applies on a second's", async () => {
        const asked = await people.changeRole({
            staff: first,
            organizationId,
            userId: memberId,
            role: "OWNER",
            reason: "Owner asked by email",
        });
        expect(asked).toMatchObject({ pending: true });
        expect(await roleOf(memberId)).toBe("MEMBER");
        const [pending] = await pendingOwnerChanges(organizationId);
        expect(pending).toMatchObject({
            userId: memberId,
            kind: "ROLE",
            role: "OWNER",
            requestedByUserId: first.userId,
        });
        const requestId = pending!.id;

        await expect(
            people.confirmOwnerChange({
                staff: first,
                organizationId,
                requestId,
                reason: "Checked with the owner",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await roleOf(memberId)).toBe("MEMBER");

        await people.confirmOwnerChange({
            staff: second,
            organizationId,
            requestId,
            reason: "Checked with the owner",
        });
        expect(await roleOf(memberId)).toBe("OWNER");
        expect(await pendingOwnerChanges(organizationId)).toEqual([]);
        expect(sendOwnerChangedNotice).toHaveBeenCalledWith(
            `owner-${tag}@example.com`,
            expect.objectContaining({ added: true }),
            "INDIA",
        );

        const ledger = await prisma.adminAuditEvent.findMany({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            select: { action: true, actorUserId: true, outcome: true },
        });
        expect(ledger).toEqual([
            expect.objectContaining({
                action: "person.owner-change.requested",
                actorUserId: first.userId,
            }),
            expect.objectContaining({
                action: "person.owner-change.confirmed",
                actorUserId: first.userId,
                outcome: "DENIED",
            }),
            expect.objectContaining({
                action: "person.role.changed",
                actorUserId: second.userId,
            }),
        ]);

        // Spent: a second confirm finds nothing waiting.
        await expect(
            people.confirmOwnerChange({
                staff: second,
                organizationId,
                requestId,
                reason: "Checked with the owner",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
