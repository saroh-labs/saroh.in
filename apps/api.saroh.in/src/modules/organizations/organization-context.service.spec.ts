import { ForbiddenException, NotFoundException } from "@nestjs/common";

// Mock the database package so the service never touches a real Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
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

    it("returns a context when the user is a member", async () => {
        membershipFindUnique.mockResolvedValue({ role: "ADMIN" });

        const ctx = await service.resolve("user_1", "org_1");

        expect(ctx).toEqual({
            organizationId: "org_1",
            userId: "user_1",
            role: "ADMIN",
        });
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

        expect(result).toEqual([
            { id: "org_1", name: "Acme", slug: "acme", role: "OWNER" },
            { id: "org_2", name: "Beta", slug: "beta", role: "MEMBER" },
        ]);
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
