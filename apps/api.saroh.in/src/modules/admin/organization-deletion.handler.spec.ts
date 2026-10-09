jest.mock("@saroh/database", () => {
    const prisma = {
        organization: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
        },
        auditEvent: { create: jest.fn() },
        job: { create: jest.fn(), count: jest.fn() },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { prisma };
});

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { AdminAuditService } from "./admin-audit.service";
import {
    ORGANIZATION_DELETION_ACTOR,
    ORGANIZATION_DELETION_TYPE,
    OrganizationDeletionHandler,
} from "./organization-deletion.handler";

const list = prisma.organization.findMany as jest.Mock;
const read = prisma.organization.findUnique as jest.Mock;
const write = prisma.organization.updateMany as jest.Mock;
const history = prisma.auditEvent.create as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;

const NOW = new Date("2026-11-10T00:00:00.000Z");
const PAST = new Date("2026-11-09T00:00:00.000Z");
const FUTURE = new Date("2026-11-11T00:00:00.000Z");

const org = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    lifecycleStatus: "PENDING_DELETION",
    lifecycleVersion: 3,
    deletionScheduledAt: PAST,
    deletionScheduledBy: "staff_1",
    ...extra,
});

function build() {
    const audit = { write: jest.fn() };
    return {
        handler: new OrganizationDeletionHandler(
            audit as unknown as AdminAuditService,
        ),
        audit,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    write.mockResolvedValue({ count: 1 });
    jobCreate.mockResolvedValue({});
});

describe("OrganizationDeletionHandler.sweep (#907)", () => {
    it("lists only businesses still PENDING_DELETION whose window has passed", async () => {
        list.mockResolvedValue([]);
        await build().handler.sweep(NOW);
        expect(list).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    lifecycleStatus: "PENDING_DELETION",
                    deletionScheduledAt: { not: null, lte: NOW },
                },
            }),
        );
    });

    it("takes a due business to DELETED_RETAINED, fenced and audited twice", async () => {
        list.mockResolvedValueOnce([{ id: "o1" }]);
        read.mockResolvedValue(org("o1"));
        const { handler, audit } = build();

        const result = await handler.sweep(NOW);

        expect(result).toEqual({ deleted: ["o1"], passed: 0, failed: 0 });
        expect(write).toHaveBeenCalledWith({
            where: {
                id: "o1",
                lifecycleStatus: "PENDING_DELETION",
                lifecycleVersion: 3,
                deletionScheduledAt: { not: null, lte: NOW },
            },
            data: {
                lifecycleStatus: "DELETED_RETAINED",
                deletedRetainedAt: NOW,
                lifecycleVersion: { increment: 1 },
            },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                actorUserId: ORGANIZATION_DELETION_ACTOR,
                permission: "organization:lifecycle:write",
                action: "organization.deleted",
                targetId: "o1",
                organizationId: "o1",
                outcome: "SUCCESS",
                idempotencyKey: "organization-deletion:o1",
            }),
        );
        expect(history).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.deleted",
                organizationId: "o1",
                actorUserId: ORGANIZATION_DELETION_ACTOR,
            }),
        });
    });

    it.each([
        ["still inside its window", org("o1", { deletionScheduledAt: FUTURE })],
        [
            "reinstated since it was listed",
            org("o1", { lifecycleStatus: "ACTIVE" }),
        ],
        ["suspended instead", org("o1", { lifecycleStatus: "SUSPENDED" })],
        ["with no window", org("o1", { deletionScheduledAt: null })],
        ["gone", null],
    ])(
        "never touches a business %s, re-read inside the transaction",
        async (_why, row) => {
            list.mockResolvedValueOnce([{ id: "o1" }]);
            read.mockResolvedValue(row);
            const { handler, audit } = build();

            const result = await handler.sweep(NOW);

            expect(result).toEqual({ deleted: [], passed: 1, failed: 0 });
            expect(write).not.toHaveBeenCalled();
            expect(audit.write).not.toHaveBeenCalled();
            expect(history).not.toHaveBeenCalled();
        },
    );

    it("writes no audit when the fenced write matches nothing (a reinstate won)", async () => {
        list.mockResolvedValueOnce([{ id: "o1" }]);
        read.mockResolvedValue(org("o1"));
        write.mockResolvedValue({ count: 0 });
        const { handler, audit } = build();

        expect(await handler.sweep(NOW)).toEqual({
            deleted: [],
            passed: 1,
            failed: 0,
        });
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("logs and moves past a business that fails, never fetching it twice", async () => {
        list.mockResolvedValueOnce(
            Array.from({ length: 50 }, (_, i) => ({ id: `o${i}` })),
        ).mockResolvedValueOnce([]);
        read.mockImplementation(({ where }: { where: { id: string } }) =>
            where.id === "o0"
                ? Promise.reject(new Error("boom"))
                : Promise.resolve(org(where.id)),
        );

        const result = await build().handler.sweep(NOW);

        expect(result.failed).toBe(1);
        expect(result.deleted).toHaveLength(49);
        const second = list.mock.calls[1]?.[0] as {
            where: { id: { notIn: string[] } };
        };
        expect(second.where.id.notIn).toHaveLength(50);
    });
});

describe("OrganizationDeletionHandler.handle (#907)", () => {
    it("schedules the next run a day on", async () => {
        list.mockResolvedValue([]);
        await build().handler.handle({} as Job);
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: ORGANIZATION_DELETION_TYPE,
                payload: {},
                runAt: expect.any(Date),
            },
        });
    });

    it("takes one already waiting as scheduled", async () => {
        list.mockResolvedValue([]);
        jobCreate.mockRejectedValue(
            Object.assign(new Error("dup"), { code: "P2002" }),
        );
        await expect(
            build().handler.handle({} as Job),
        ).resolves.toBeUndefined();
    });

    it("throws when the next run can't be queued, so the worker retries", async () => {
        list.mockResolvedValue([]);
        jobCreate.mockRejectedValue(new Error("db down"));
        await expect(build().handler.handle({} as Job)).rejects.toThrow(
            /Could not schedule/,
        );
    });

    it("still schedules the next run when the sweep fails", async () => {
        list.mockRejectedValue(new Error("db down"));
        await build().handler.handle({} as Job);
        expect(jobCreate).toHaveBeenCalled();
    });
});
