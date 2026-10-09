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

import type { CatalogueAccessService } from "../billing/catalogue-access.service";
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

/** The resolver: off the catalogue unless a test says otherwise. */
const resolve = jest.fn(async (): Promise<unknown> => ({
    source: "legacy",
    reason: "no-plan",
    entitlements: {},
    planEntitlements: {},
    planOverride: null,
}));
const access = { resolve } as unknown as CatalogueAccessService;

describe("AdminOrganizationsService.directory", () => {
    const service = new AdminOrganizationsService(access);

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

    it("shows the plan an override puts it on, with its subscription's beside it (UX-087)", async () => {
        const until = new Date("2026-12-31T18:29:59.999Z");
        findMany.mockResolvedValue([
            record("a", {
                subscription: {
                    status: "ACTIVE",
                    plan: { key: "catalog.free", name: "Free" },
                },
            }),
        ]);
        resolve.mockResolvedValueOnce({
            source: "catalogue",
            catalog: {
                plans: [
                    { id: "free", name: "Free" },
                    { id: "pro", name: "Pro" },
                ],
            },
            basePlanId: "free",
            planId: "pro",
            planName: "Pro",
            planOverride: { id: "o1", planKey: "pro", expiresAt: until },
        });

        const page = await service.directory({}, { canReadPii: false });
        expect(resolve).toHaveBeenCalledWith("a", expect.any(Date));
        expect(page.items[0]?.plan).toEqual({
            key: "catalog.free",
            name: "Free",
        });
        expect(page.items[0]?.effectivePlan).toEqual({
            id: "pro",
            name: "Pro",
            basePlanId: "free",
            basePlanName: "Free",
            override: { expiresAt: until },
        });
    });

    it("keeps the row when its plan can't be read, falling back to the subscription's", async () => {
        findMany.mockResolvedValue([record("a")]);
        resolve.mockRejectedValueOnce(new Error("db down"));

        const page = await service.directory({}, { canReadPii: false });
        expect(page.items).toHaveLength(1);
        expect(page.items[0]?.effectivePlan).toBeNull();
    });
});
