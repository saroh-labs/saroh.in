import { ForbiddenException, NotFoundException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        // The role's own permissions, read alongside the membership since
        // roles became rows. `null` means the business has invented nothing,
        // so the shipped map decides — which is what these tests assert.
        organizationRole: {
            findUnique: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
        },
        membership: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
        },
        organization: {
            findUnique: jest.fn(),
        },
    },
}));

import { prisma } from "@saroh/database";

import { OrganizationContextService } from "./organization-context.service";

const membershipFindUnique = prisma.membership.findUnique as jest.Mock;
const membershipFindMany = prisma.membership.findMany as jest.Mock;
const organizationFindUnique = prisma.organization.findUnique as jest.Mock;

describe("OrganizationContextService.resolve", () => {
    const service = new OrganizationContextService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("resolves an invented role from what the business stored", async () => {
        membershipFindUnique.mockResolvedValue({ role: "stock-clerk" });
        (prisma.organizationRole.findUnique as jest.Mock).mockResolvedValueOnce(
            { actions: ["order:read", "order:write"] },
        );

        const ctx = await service.resolve("user_1", "org_1");

        // `role` is the floor, which is fail-safe for anything still reading a
        // role name; `actions` is what actually decides.
        expect(ctx.role).toBe("MEMBER");
        expect(ctx.roleKey).toBe("stock-clerk");
        expect(ctx.actions?.has("order:write")).toBe(true);
        expect(ctx.actions?.has("member:read")).toBe(false);
    });

    it("returns a context when the user is a member", async () => {
        membershipFindUnique.mockResolvedValue({ role: "ADMIN" });

        const ctx = await service.resolve("user_1", "org_1");

        expect(ctx).toMatchObject({
            organizationId: "org_1",
            userId: "user_1",
            role: "ADMIN",
            roleKey: "ADMIN",
        });
        // Resolved from the shipped map, because this business has stored no
        // role of its own — ADMIN is everything except closing the business.
        expect(ctx.actions?.has("org:update")).toBe(true);
        expect(ctx.actions?.has("org:delete")).toBe(false);
        expect(membershipFindUnique).toHaveBeenCalledWith({
            where: {
                organizationId_userId: {
                    organizationId: "org_1",
                    userId: "user_1",
                },
            },
            select: { role: true },
        });
        // Success path is a single query — no org existence lookup.
        expect(organizationFindUnique).not.toHaveBeenCalled();
    });

    it("throws NotFound when the organization does not exist", async () => {
        membershipFindUnique.mockResolvedValue(null);
        organizationFindUnique.mockResolvedValue(null);

        await expect(
            service.resolve("user_1", "missing"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws Forbidden when the org exists but the user is not a member", async () => {
        membershipFindUnique.mockResolvedValue(null);
        organizationFindUnique.mockResolvedValue({ id: "org_1" });

        await expect(service.resolve("user_1", "org_1")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });

    it("narrows a valid role string to OrgRole", async () => {
        membershipFindUnique.mockResolvedValue({ role: "OWNER" });
        const ctx = await service.resolve("user_1", "org_1");
        expect(ctx.role).toBe("OWNER");
    });

    it("fails closed to MEMBER for an unknown role value", async () => {
        membershipFindUnique.mockResolvedValue({ role: "SUPERUSER" });
        const ctx = await service.resolve("user_1", "org_1");
        expect(ctx.role).toBe("MEMBER");
    });
});

describe("OrganizationContextService.listForUser", () => {
    const service = new OrganizationContextService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("maps memberships to org summaries with the caller's role", async () => {
        membershipFindMany.mockResolvedValue([
            {
                role: "OWNER",
                organization: { id: "org_1", name: "Acme", slug: "acme" },
            },
            {
                role: "MEMBER",
                organization: { id: "org_2", name: "Beta", slug: "beta" },
            },
        ]);

        const result = await service.listForUser("user_1");

        expect(result).toMatchObject([
            { id: "org_1", name: "Acme", slug: "acme", role: "OWNER" },
            { id: "org_2", name: "Beta", slug: "beta", role: "MEMBER" },
        ]);
        // Each membership carries what the actor may do there, so the rail
        // renders what the API allows instead of a map compiled into it.
        expect(result[0]!.actions).toContain("org:delete");
        expect(result[1]!.actions).not.toContain("org:delete");
        expect(result[1]!.actions).toContain("member:read");
    });

    it("asks for the stored roles of every membership in one query", async () => {
        membershipFindMany.mockResolvedValue([
            {
                role: "stock-clerk",
                organization: { id: "org_1", name: "Acme", slug: "acme" },
            },
        ]);
        (prisma.organizationRole.findMany as jest.Mock).mockResolvedValueOnce([
            {
                organizationId: "org_1",
                key: "stock-clerk",
                actions: ["order:read"],
            },
        ]);

        const result = await service.listForUser("user_1");

        // One round trip for the whole list, not one per organization.
        expect(prisma.organizationRole.findMany).toHaveBeenCalledTimes(1);
        expect(result[0]).toMatchObject({
            role: "MEMBER",
            roleKey: "stock-clerk",
            actions: ["order:read"],
        });
    });

    it("returns an empty list when the user has no memberships", async () => {
        membershipFindMany.mockResolvedValue([]);
        expect(await service.listForUser("user_1")).toEqual([]);
    });
});

describe("OrganizationContextService.getSummary", () => {
    const service = new OrganizationContextService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns the org identity", async () => {
        organizationFindUnique.mockResolvedValue({
            id: "org_1",
            name: "Acme",
            slug: "acme",
        });
        expect(await service.getSummary("org_1")).toEqual({
            id: "org_1",
            name: "Acme",
            slug: "acme",
        });
    });

    it("throws NotFound when the org is gone", async () => {
        organizationFindUnique.mockResolvedValue(null);
        await expect(service.getSummary("missing")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});
