jest.mock("@saroh/database", () => ({
    prisma: {
        organization: { findMany: jest.fn(), findUnique: jest.fn() },
        auditEvent: { groupBy: jest.fn(async () => []) },
        job: { groupBy: jest.fn(async () => []) },
        webhookEvent: { groupBy: jest.fn(async () => []) },
    },
}));

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AdminOrganizationsService } from "./admin-organizations.service";

const findMany = prisma.organization.findMany as jest.Mock;
const jobGroupBy = prisma.job.groupBy as jest.Mock;

function record(id: string, overrides: Record<string, unknown> = {}) {
    return {
        id,
        name: `Business ${id}`,
        slug: id,
        lifecycleStatus: "ACTIVE",
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        _count: { memberships: 2 },
        organizationModules: [{ moduleKey: "CRM" }],
        subscription: null,
        ...overrides,
    };
}

beforeEach(() => jest.clearAllMocks());

describe("AdminOrganizationsService.directory", () => {
    const service = new AdminOrganizationsService();

    it("refuses an email search without the PII permission", async () => {
        await expect(
            service.directory(
                { q: "owner@northwind.test" },
                { canReadPii: false },
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findMany).not.toHaveBeenCalled();
    });

    it("searches members' emails with the PII permission", async () => {
        findMany.mockResolvedValue([]);
        await service.directory(
            { q: "owner@northwind.test" },
            { canReadPii: true },
        );
        expect(findMany.mock.calls[0][0].where).toEqual({
            AND: [
                {
                    memberships: {
                        some: {
                            user: {
                                email: {
                                    contains: "owner@northwind.test",
                                    mode: "insensitive",
                                },
                            },
                        },
                    },
                },
            ],
        });
    });

    it("searches by id, name or slug otherwise", async () => {
        findMany.mockResolvedValue([]);
        await service.directory({ q: "north" }, { canReadPii: false });
        expect(findMany.mock.calls[0][0].where.AND[0].OR).toHaveLength(3);
    });

    it("pages on a cursor with a tie-breaking order, reading one extra row", async () => {
        findMany.mockResolvedValue([record("c"), record("b"), record("a")]);
        const page = await service.directory(
            { limit: 2, cursor: "d" },
            { canReadPii: false },
        );

        const args = findMany.mock.calls[0][0];
        expect(args.take).toBe(3);
        expect(args.cursor).toEqual({ id: "d" });
        expect(args.skip).toBe(1);
        expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
        expect(page.items.map((row) => row.id)).toEqual(["c", "b"]);
        expect(page.nextCursor).toBe("b");
    });

    it("says why a business needs attention", async () => {
        findMany.mockResolvedValue([
            record("a", {
                subscription: {
                    status: "PAST_DUE",
                    plan: { key: "pro", name: "Pro" },
                },
            }),
        ]);
        jobGroupBy.mockResolvedValue([
            { organizationId: "a", _count: { _all: 2 } },
        ]);

        const page = await service.directory({}, { canReadPii: false });
        expect(page.items[0]?.attention).toEqual(["PAST_DUE", "FAILED_JOBS"]);
        expect(page.items[0]?.plan).toEqual({ key: "pro", name: "Pro" });
    });

    it("filters to businesses without a plan", async () => {
        findMany.mockResolvedValue([]);
        await service.directory({ planKey: "none" }, { canReadPii: false });
        expect(findMany.mock.calls[0][0].where).toEqual({
            AND: [{ subscription: { is: null } }],
        });
    });
});
