jest.mock("@saroh/database", () => {
    const prisma = {
        job: { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
        webhookEvent: { findMany: jest.fn() },
        adminOperation: {
            findUnique: jest.fn(),
            findMany: jest.fn(async () => []),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        adminOperationItem: {
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
        },
        $transaction: jest.fn((arg: unknown) =>
            typeof arg === "function"
                ? (arg as (tx: unknown) => unknown)(prisma)
                : Promise.all(arg as unknown[]),
        ),
    };
    return { prisma };
});

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { WebhooksService } from "../webhooks/webhooks.service";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminOperationsService } from "./admin-operations.service";

const jobFind = prisma.job.findMany as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;
const jobUpdate = prisma.job.updateMany as jest.Mock;
const hookFind = prisma.webhookEvent.findMany as jest.Mock;
const opCreate = prisma.adminOperation.create as jest.Mock;
const opFind = prisma.adminOperation.findUnique as jest.Mock;
const itemNext = prisma.adminOperationItem.findFirst as jest.Mock;
const itemClaim = prisma.adminOperationItem.updateMany as jest.Mock;
const itemUpdate = prisma.adminOperationItem.update as jest.Mock;

const staff: PlatformAdminInfo = {
    userId: "ops_1",
    platformAdminId: "pa_1",
    roles: ["OPERATIONS"],
    permissions: [],
    viaBootstrap: false,
};

const failedJob = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    type: "enquiry.notify",
    status: "FAILED",
    organization: { lifecycleStatus: "ACTIVE" },
    ...extra,
});

function build(webhooks: Partial<WebhooksService> = {}) {
    const audit = { write: jest.fn() };
    return {
        service: new AdminOperationsService(
            audit as unknown as AdminAuditService,
            webhooks as WebhooksService,
        ),
        audit,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jobCount.mockResolvedValue(0);
});

describe("AdminOperationsService — dry run", () => {
    it("says what would happen to each job and changes nothing", async () => {
        jobFind.mockResolvedValue([
            failedJob("j1"),
            failedJob("j2", { status: "DONE" }),
            failedJob("j3", { organization: { lifecycleStatus: "SUSPENDED" } }),
        ]);
        const { service } = build();

        const plan = await service.plan("jobs.retry", ["j1", "j2", "j3", "j4"]);

        expect(plan).toEqual(
            expect.objectContaining({ total: 4, act: 1, skip: 2, unsafe: 1 }),
        );
        expect(plan.items.find((i) => i.targetId === "j3")?.detail).toMatch(
            /suspended/,
        );
        expect(plan.items.find((i) => i.targetId === "j4")?.detail).toBe(
            "Job not found",
        );
        expect(jobUpdate).not.toHaveBeenCalled();
        expect(opCreate).not.toHaveBeenCalled();
    });

    it("will not fork the renewal chain", async () => {
        jobFind.mockResolvedValue([
            failedJob("r1", { type: "subscription.renew" }),
        ]);
        jobCount.mockResolvedValue(1);
        const { service } = build();
        const plan = await service.plan("jobs.retry", ["r1"]);
        expect(plan.items[0]).toEqual(
            expect.objectContaining({
                verdict: "unsafe",
                detail: expect.stringMatching(/fork/),
            }),
        );
    });

    it("calls replaying a processed delivery unsafe", async () => {
        hookFind.mockResolvedValue([
            {
                id: "w1",
                status: "PROCESSED",
                eventType: "payment.captured",
                organizationId: "o",
            },
            {
                id: "w2",
                status: "FAILED",
                eventType: "payment.captured",
                organizationId: "o",
            },
        ]);
        const { service } = build();
        const plan = await service.plan("webhooks.replay", ["w1", "w2"]);
        expect(plan.items.map((i) => i.verdict)).toEqual(["unsafe", "act"]);
    });

    it("refuses an empty or oversized target list", async () => {
        const { service } = build();
        await expect(service.plan("jobs.retry", [])).rejects.toBeInstanceOf(
            BadRequestException,
        );
        await expect(
            service.plan(
                "jobs.retry",
                Array.from({ length: 501 }, (_, i) => `j${i}`),
            ),
        ).rejects.toThrow(/at most 500/);
    });
});

describe("AdminOperationsService — execution", () => {
    it("writes every row before running, and records skips as skips", async () => {
        jobFind.mockResolvedValue([
            failedJob("j1"),
            failedJob("j2", { status: "PENDING" }),
        ]);
        opFind.mockResolvedValueOnce(null); // no replay of the key
        opCreate.mockResolvedValue({ id: "op_1" });
        opFind.mockResolvedValue({ id: "op_1", kind: "jobs.retry", items: [] });
        itemNext.mockResolvedValue(null);
        const { service, audit } = build();

        await service.start({
            staff,
            kind: "jobs.retry",
            targetIds: ["j1", "j2"],
            reason: "Mail provider was down",
            idempotencyKey: "key-12345678",
        });

        const data = opCreate.mock.calls[0][0].data;
        expect(data).toEqual(expect.objectContaining({ total: 2, skipped: 1 }));
        expect(data.items.create).toEqual([
            expect.objectContaining({ targetId: "j1", status: "PENDING" }),
            expect.objectContaining({ targetId: "j2", status: "SKIPPED" }),
        ]);
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({ action: "operation.jobs.retry.started" }),
        );
    });

    it("returns the same operation for the same key, running nothing again", async () => {
        opFind.mockResolvedValue({ id: "op_1", kind: "jobs.retry", items: [] });
        const { service } = build();
        await service.start({
            staff,
            kind: "jobs.retry",
            targetIds: ["j1"],
            reason: "Retry again",
            idempotencyKey: "key-12345678",
        });
        expect(opCreate).not.toHaveBeenCalled();
    });

    it("claims each row before acting, and skips one another runner took", async () => {
        opFind.mockResolvedValue({ kind: "jobs.retry", failed: 0, total: 2 });
        itemNext
            .mockResolvedValueOnce({ id: "i1", targetId: "j1" })
            .mockResolvedValueOnce({ id: "i2", targetId: "j2" })
            .mockResolvedValueOnce(null);
        itemClaim
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 });
        jobFind.mockResolvedValue([failedJob("j1")]);
        jobUpdate.mockResolvedValue({ count: 1 });
        const { service } = build();

        await service.run("op_1");

        expect(jobUpdate).toHaveBeenCalledTimes(1);
        expect(jobUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "j1", status: "FAILED" },
                data: expect.objectContaining({
                    status: "PENDING",
                    attempts: 0,
                }),
            }),
        );
        expect(itemUpdate).toHaveBeenCalledTimes(1);
        expect(itemUpdate.mock.calls[0][0].data.status).toBe("DONE");
    });

    it("skips a retry the one-pending-renewal index refuses", async () => {
        opFind.mockResolvedValue({ kind: "jobs.retry", failed: 0, total: 1 });
        itemNext
            .mockResolvedValueOnce({ id: "i1", targetId: "r1" })
            .mockResolvedValueOnce(null);
        itemClaim.mockResolvedValue({ count: 1 });
        jobFind.mockResolvedValue([
            failedJob("r1", { type: "subscription.renew" }),
        ]);
        jobUpdate.mockRejectedValue(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        const { service } = build();

        await service.run("op_1");
        expect(itemUpdate.mock.calls[0][0].data).toEqual(
            expect.objectContaining({ status: "SKIPPED" }),
        );
    });

    it("replays deliveries through the webhooks service", async () => {
        opFind.mockResolvedValue({
            kind: "webhooks.replay",
            failed: 0,
            total: 1,
        });
        itemNext
            .mockResolvedValueOnce({ id: "i1", targetId: "w1" })
            .mockResolvedValueOnce(null);
        itemClaim.mockResolvedValue({ count: 1 });
        const replay = jest.fn(async () => ({ status: "processed" as const }));
        const { service } = build({ replay });

        await service.run("op_1");
        expect(replay).toHaveBeenCalledWith("w1");
        expect(itemUpdate.mock.calls[0][0].data.status).toBe("DONE");
    });
});
