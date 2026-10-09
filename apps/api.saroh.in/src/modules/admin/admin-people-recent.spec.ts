jest.mock("@saroh/database", () => ({
    prisma: { user: { findMany: jest.fn() } },
}));
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("../../common/guards/platform-admin.guard", () => ({
    PlatformAdminGuard: class PlatformAdminGuard {},
}));

import { PATH_METADATA } from "@nestjs/common/constants";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { REQUIRE_ADMIN_PERMISSIONS } from "../../common/decorators/require-admin-permission.decorator";
import type { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { OrganizationMembersService } from "../organizations/organization-members.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminAuditOutcome } from "./admin-audit.service";
import { AdminPeopleController } from "./admin-people.controller";
import { AdminPeopleService, RECENT_LIMIT } from "./admin-people.service";
import { AdminPermission } from "./admin-permissions";

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

const staff: PlatformAdminInfo = {
    userId: "staff_1",
    platformAdminId: "pa_1",
    roles: ["SUPPORT"],
    permissions: [AdminPermission.OrganizationPiiRead],
    viaBootstrap: false,
};

const findMany = prisma.user.findMany as jest.Mock;

function user(n: number, memberships: { id: string; name: string }[] = []) {
    return {
        id: `u${n}`,
        name: n % 2 === 0 ? `Person ${n}` : null,
        email: `person${n}@example.com`,
        createdAt: new Date(Date.UTC(2026, 9, 9, 0, 0, 0) - n * 60_000),
        memberships: memberships.map((organization) => ({ organization })),
    };
}

function build() {
    const audit = { recordRead: jest.fn(async () => undefined) };
    const service = new AdminPeopleService(
        {} as OrganizationMembersService,
        audit as unknown as AdminAuditService,
    );
    const controller = new AdminPeopleController(
        service,
        audit as unknown as AdminAuditService,
        {} as IdempotencyService,
    );
    return { service, controller, audit };
}

beforeEach(() => jest.clearAllMocks());

describe("GET /admin/people/recent (Newest sign-ups)", () => {
    const handler = AdminPeopleController.prototype.recent;

    it("needs the same permission as a search, and nothing less", () => {
        expect(Reflect.getMetadata(REQUIRE_ADMIN_PERMISSIONS, handler)).toEqual(
            [AdminPermission.OrganizationPiiRead],
        );
        expect(
            Reflect.getMetadata(
                REQUIRE_ADMIN_PERMISSIONS,
                AdminPeopleController.prototype.search,
            ),
        ).toEqual([AdminPermission.OrganizationPiiRead]);
    });

    it("is mounted at people/recent, ahead of people/:userId", () => {
        expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
            "people/recent",
        );
        // Nest registers routes in declaration order: "recent" must come
        // first, or it would be read as a user id.
        const names = Object.getOwnPropertyNames(
            AdminPeopleController.prototype,
        );
        expect(names.indexOf("recent")).toBeLessThan(names.indexOf("detail"));
    });

    it("reads the newest 25 accounts, newest first", async () => {
        findMany.mockResolvedValue([]);
        const { service } = build();
        await service.recent();
        expect(RECENT_LIMIT).toBe(25);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 25,
            }),
        );
    });

    it("returns each account with its businesses, in the order read", async () => {
        findMany.mockResolvedValue([
            user(1, [
                { id: "org_a", name: "Ayurveda House" },
                { id: "org_b", name: "Brew Bar" },
            ]),
            user(2),
        ]);
        const { service } = build();
        await expect(service.recent()).resolves.toEqual([
            {
                id: "u1",
                name: null,
                email: "person1@example.com",
                createdAt: expect.any(Date),
                businesses: [
                    { id: "org_a", name: "Ayurveda House" },
                    { id: "org_b", name: "Brew Bar" },
                ],
            },
            {
                id: "u2",
                name: "Person 2",
                email: "person2@example.com",
                createdAt: expect.any(Date),
                businesses: [],
            },
        ]);
    });

    it("selects no password, session or token column", async () => {
        findMany.mockResolvedValue([]);
        const { service } = build();
        await service.recent();
        const args = findMany.mock.calls[0][0];
        expect(Object.keys(args.select).sort()).toEqual(
            ["createdAt", "email", "id", "memberships", "name"].sort(),
        );
    });

    it("records each opening in the admin audit trail, as a search is", async () => {
        findMany.mockResolvedValue([user(1), user(2), user(3)]);
        const { controller, audit } = build();
        const rows = await controller.recent(staff);
        expect(rows).toHaveLength(3);
        expect(audit.recordRead).toHaveBeenCalledTimes(1);
        expect(audit.recordRead).toHaveBeenCalledWith({
            actorUserId: "staff_1",
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.signups.list",
            targetType: "user",
            outcome: AdminAuditOutcome.Success,
            metadata: { resultCount: 3 },
        });
    });
});
