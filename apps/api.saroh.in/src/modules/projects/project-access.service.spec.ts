/**
 * S1-010 project-level access — acceptance suite. Pure unit tests: Prisma is
 * jest-mocked, so nothing touches a database. Proves the ADR-001 rules:
 * OWNER/ADMIN see every project; a MEMBER sees only direct + team grants (no
 * dupes); the strongest granting path wins (MANAGER > EDITOR > VIEWER, direct
 * vs team); revocation removes access; a non-member cannot be granted; and only
 * OWNER/ADMIN may grant.
 */
import { BadRequestException, ForbiddenException } from "@nestjs/common";

jest.mock("@saroh/database", () => ({
    prisma: {
        project: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
        },
        projectAccess: {
            findMany: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
        membership: {
            findUnique: jest.fn(),
        },
        team: {
            findFirst: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
        },
        teamMember: {
            upsert: jest.fn(),
            deleteMany: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import type {
    OrganizationContext,
    OrgRole,
} from "../../common/types/organization-context";
import { ProjectAccessService } from "./project-access.service";

const projectFindMany = prisma.project.findMany as jest.Mock;
const projectFindFirst = prisma.project.findFirst as jest.Mock;
const accessFindMany = prisma.projectAccess.findMany as jest.Mock;
const accessUpsert = prisma.projectAccess.upsert as jest.Mock;
const accessDeleteMany = prisma.projectAccess.deleteMany as jest.Mock;
const membershipFindUnique = prisma.membership.findUnique as jest.Mock;

const ORG = "org_1";
const PROJECT = "proj_1";

function ctx(role: OrgRole, userId = "user_1"): OrganizationContext {
    return { organizationId: ORG, userId, role };
}

describe("ProjectAccessService.listAccessibleProjects", () => {
    let service: ProjectAccessService;
    beforeEach(() => {
        jest.clearAllMocks();
        service = new ProjectAccessService();
    });

    it.each<OrgRole>(["OWNER", "ADMIN"])(
        "%s sees EVERY project in the org, as MANAGER",
        async (role) => {
            projectFindMany.mockResolvedValue([
                { id: "p1", name: "Alpha", slug: "alpha" },
                { id: "p2", name: "Beta", slug: "beta" },
            ]);

            const result = await service.listAccessibleProjects(ctx(role));

            expect(result).toEqual([
                { id: "p1", name: "Alpha", slug: "alpha", role: "MANAGER" },
                { id: "p2", name: "Beta", slug: "beta", role: "MANAGER" },
            ]);
            // Queried the whole org, with no per-user access filter.
            expect(projectFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { organizationId: ORG },
                }),
            );
        },
    );

    it("MEMBER sees only direct + team-granted projects (union, no dupes)", async () => {
        // The DB-level `some` filter already yields the union with no duplicate
        // project rows; each row carries the caller's grants for role folding.
        projectFindMany.mockResolvedValue([
            {
                id: "p1",
                name: "Alpha",
                slug: "alpha",
                access: [{ role: "VIEWER" }],
            },
            {
                id: "p2",
                name: "Beta",
                slug: "beta",
                access: [{ role: "EDITOR" }, { role: "MANAGER" }],
            },
        ]);

        const result = await service.listAccessibleProjects(ctx("MEMBER"));

        expect(result).toEqual([
            { id: "p1", name: "Alpha", slug: "alpha", role: "VIEWER" },
            // strongest of EDITOR (direct) + MANAGER (team) wins
            { id: "p2", name: "Beta", slug: "beta", role: "MANAGER" },
        ]);
        // The query is scoped to grants reaching this user.
        const arg = projectFindMany.mock.calls[0][0] as {
            where: { access: { some: { OR: unknown[] } } };
        };
        expect(arg.where.access.some.OR).toHaveLength(2);
    });

    it("MEMBER with no grants sees nothing", async () => {
        projectFindMany.mockResolvedValue([]);
        expect(await service.listAccessibleProjects(ctx("MEMBER"))).toEqual([]);
    });
});

describe("ProjectAccessService.resolveProjectRole", () => {
    let service: ProjectAccessService;
    beforeEach(() => {
        jest.clearAllMocks();
        service = new ProjectAccessService();
    });

    it.each<OrgRole>(["OWNER", "ADMIN"])(
        "%s resolves to MANAGER without any grant lookup",
        async (role) => {
            const result = await service.resolveProjectRole(
                "user_1",
                PROJECT,
                role,
            );
            expect(result).toBe("MANAGER");
            expect(accessFindMany).not.toHaveBeenCalled();
        },
    );

    it("MEMBER: strongest of direct + team grants wins (EDITOR direct, MANAGER team → MANAGER)", async () => {
        accessFindMany.mockResolvedValue([
            { role: "EDITOR" },
            { role: "MANAGER" },
        ]);
        expect(
            await service.resolveProjectRole("user_1", PROJECT, "MEMBER"),
        ).toBe("MANAGER");
    });

    it("MEMBER: VIEWER direct only → VIEWER", async () => {
        accessFindMany.mockResolvedValue([{ role: "VIEWER" }]);
        expect(
            await service.resolveProjectRole("user_1", PROJECT, "MEMBER"),
        ).toBe("VIEWER");
    });

    it("MEMBER with no grant → null (no access)", async () => {
        accessFindMany.mockResolvedValue([]);
        expect(
            await service.resolveProjectRole("user_1", PROJECT, "MEMBER"),
        ).toBeNull();
    });
});

describe("ProjectAccessService grant/revoke authorization", () => {
    let service: ProjectAccessService;
    beforeEach(() => {
        jest.clearAllMocks();
        service = new ProjectAccessService();
    });

    it("a MEMBER (non OWNER/ADMIN) cannot grant access", async () => {
        await expect(
            service.grantToUser(ctx("MEMBER"), PROJECT, "user_2", "VIEWER"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        // Rejected by the policy before any DB work.
        expect(projectFindFirst).not.toHaveBeenCalled();
        expect(accessUpsert).not.toHaveBeenCalled();
    });

    it("membership is a prerequisite: cannot grant to a non-member", async () => {
        projectFindFirst.mockResolvedValue({ id: PROJECT }); // project exists
        membershipFindUnique.mockResolvedValue(null); // not a member
        await expect(
            service.grantToUser(ctx("OWNER"), PROJECT, "outsider", "EDITOR"),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(accessUpsert).not.toHaveBeenCalled();
    });

    it("OWNER grants a direct role to an org member", async () => {
        projectFindFirst.mockResolvedValue({ id: PROJECT });
        membershipFindUnique.mockResolvedValue({ id: "mem_1" });
        accessUpsert.mockResolvedValue({ id: "grant_1" });

        const res = await service.grantToUser(
            ctx("ADMIN"),
            PROJECT,
            "user_2",
            "EDITOR",
        );

        expect(res).toEqual({ id: "grant_1" });
        expect(accessUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    projectId_userId: { projectId: PROJECT, userId: "user_2" },
                },
                create: {
                    projectId: PROJECT,
                    userId: "user_2",
                    role: "EDITOR",
                },
                update: { role: "EDITOR" },
            }),
        );
    });

    it("revocation removes a user's access", async () => {
        projectFindFirst.mockResolvedValue({ id: PROJECT });
        accessDeleteMany.mockResolvedValue({ count: 1 });

        const res = await service.revokeFromUser(
            ctx("OWNER"),
            PROJECT,
            "user_2",
        );

        expect(res).toEqual({ revoked: 1 });
        expect(accessDeleteMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT, userId: "user_2" },
        });
    });

    it("a MEMBER cannot revoke access", async () => {
        await expect(
            service.revokeFromUser(ctx("MEMBER"), PROJECT, "user_2"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(accessDeleteMany).not.toHaveBeenCalled();
    });
});
