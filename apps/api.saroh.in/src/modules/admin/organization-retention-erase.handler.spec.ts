// DB-free: the writes are mocked (organization-retention-erase.db.spec.ts
// runs them against Postgres); this pins the chain and what holds it back.
jest.mock("@saroh/database", () => {
    const prisma = {
        organization: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        adminAuditEvent: { create: jest.fn() },
        auditEvent: { create: jest.fn() },
        job: { create: jest.fn(), count: jest.fn() },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { prisma };
});
jest.mock("../payments/refunds-outstanding", () => ({
    refundsOutstanding: jest.fn(async () => ({ count: 0, rows: [] })),
}));
jest.mock("./retention-erase-writes", () => {
    class EraseStoppedError extends Error {
        constructor(readonly why: string) {
            super(why);
        }
    }
    return {
        EraseStoppedError,
        RETENTION_ERASE_ACTOR: "system:retention-erase",
        contactsToErase: jest.fn(async () => []),
        eraseContact: jest.fn(async () => true),
        eraseWaitlist: jest.fn(async () => 0),
        eraseStoreCustomers: jest.fn(async () => 0),
        eraseRecords: jest.fn(async () => ({ orders: 0 })),
        eraseAnalyticsEvents: jest.fn(async () => 0),
    };
});

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { MediaService } from "../media/media.service";
import { refundsOutstanding } from "../payments/refunds-outstanding";
import {
    ERASE_CONTACTS_PER_RUN,
    ORGANIZATION_RETENTION_ERASE_TYPE,
    OrganizationRetentionEraseHandler,
    RETENTION_ERASE_BACKLOG_MS,
    RETENTION_ERASE_EVERY_MS,
} from "./organization-retention-erase.handler";
import * as writes from "./retention-erase-writes";

const mock = (fn: unknown) => fn as jest.Mock;
const list = mock(prisma.organization.findMany);
const read = mock(prisma.organization.findUnique);
const stamp = mock(prisma.organization.updateMany);
const heldCount = mock(prisma.organization.count);
const ledger = mock(prisma.adminAuditEvent.create);
const history = mock(prisma.auditEvent.create);
const jobCreate = mock(prisma.job.create);

const NOW = new Date("2027-06-01T06:00:00.000Z");
const DAY = 86_400_000;
const deleted = (daysAgo: number, extra: Record<string, unknown> = {}) => ({
    lifecycleStatus: "DELETED_RETAINED",
    deletedRetainedAt: new Date(NOW.getTime() - daysAgo * DAY),
    retentionErasedAt: null,
    legalHoldAt: null,
    ...extra,
});

function build() {
    const media = {
        removeAllForDeletedBusiness: jest.fn(async () => ({
            removed: 2,
            failed: 0,
            stopped: false,
        })),
    };
    return {
        handler: new OrganizationRetentionEraseHandler(
            media as unknown as MediaService,
        ),
        media,
    };
}

const job = () => ({ id: "job_1", payload: {} }) as unknown as Job;

function nextRun(): Date | undefined {
    const call = jobCreate.mock.calls.find(
        ([arg]) =>
            (arg as { data: { type: string } }).data.type ===
            ORGANIZATION_RETENTION_ERASE_TYPE,
    );
    return (call?.[0] as { data: { runAt: Date } } | undefined)?.data.runAt;
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW, advanceTimers: true });
    list.mockResolvedValue([]);
    heldCount.mockResolvedValue(0);
    stamp.mockResolvedValue({ count: 1 });
    jobCreate.mockResolvedValue({});
    mock(writes.contactsToErase).mockResolvedValue([]);
    mock(refundsOutstanding).mockResolvedValue({ count: 0, rows: [] });
});

afterEach(() => {
    jest.useRealTimers();
});

describe("OrganizationRetentionEraseHandler.sweep (DEC-122)", () => {
    it("lists only deleted businesses 180 days on, not erased and not on legal hold", async () => {
        await build().handler.sweep(NOW);
        expect(list).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    lifecycleStatus: "DELETED_RETAINED",
                    deletedRetainedAt: {
                        not: null,
                        lte: new Date(NOW.getTime() - 180 * DAY),
                    },
                    retentionErasedAt: null,
                    legalHoldAt: null,
                },
            }),
        );
    });

    it("takes every step, then stamps the business on both ledgers", async () => {
        list.mockResolvedValue([{ id: "o1" }]);
        read.mockResolvedValue(deleted(181));
        const { handler, media } = build();

        const swept = await handler.sweep(NOW);

        expect(swept.erased).toEqual(["o1"]);
        expect(media.removeAllForDeletedBusiness).toHaveBeenCalledWith(
            "o1",
            expect.any(Function),
        );
        expect(writes.eraseWaitlist).toHaveBeenCalledWith("o1");
        expect(writes.eraseRecords).toHaveBeenCalledWith("o1", NOW);
        expect(writes.eraseAnalyticsEvents).toHaveBeenCalled();
        // Fenced on the hold and on the stamp.
        expect(stamp).toHaveBeenCalledWith({
            where: {
                id: "o1",
                lifecycleStatus: "DELETED_RETAINED",
                retentionErasedAt: null,
                legalHoldAt: null,
            },
            data: { retentionErasedAt: NOW },
        });
        expect(ledger).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.retention.erase",
                actorUserId: "system:retention-erase",
                outcome: "SUCCESS",
                idempotencyKey: "organization-retention-erased:o1",
            }),
        });
        expect(history).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: "organization.retention.erased",
                organizationId: "o1",
            }),
        });
    });

    it("leaves a business that is 179 days on", async () => {
        read.mockResolvedValue(deleted(179));
        const { handler, media } = build();
        expect((await handler.eraseOne("o1", NOW)).outcome).toBe("passed");
        expect(media.removeAllForDeletedBusiness).not.toHaveBeenCalled();
        expect(writes.eraseRecords).not.toHaveBeenCalled();
    });

    it("honours a longer retention from the environment", async () => {
        read.mockResolvedValue(deleted(200));
        const { handler, media } = build();
        expect((await handler.eraseOne("o1", NOW, 365)).outcome).toBe("passed");
        expect(media.removeAllForDeletedBusiness).not.toHaveBeenCalled();
    });

    it("leaves a business on legal hold found when it is read again", async () => {
        read.mockResolvedValue(deleted(400, { legalHoldAt: new Date() }));
        const { handler, media } = build();
        expect((await handler.eraseOne("o1", NOW)).outcome).toBe("held");
        expect(media.removeAllForDeletedBusiness).not.toHaveBeenCalled();
        expect(writes.eraseRecords).not.toHaveBeenCalled();
        expect(stamp).not.toHaveBeenCalled();
    });

    it("stops every later step when a write finds the hold, and doesn't stamp", async () => {
        read.mockResolvedValue(deleted(400));
        mock(writes.eraseWaitlist).mockRejectedValueOnce(
            new writes.EraseStoppedError("legal-hold"),
        );
        const { handler } = build();

        const result = await handler.eraseOne("o1", NOW);

        expect(result.outcome).toBe("held");
        expect(result.failed).toEqual([]);
        expect(writes.contactsToErase).not.toHaveBeenCalled();
        expect(writes.eraseRecords).not.toHaveBeenCalled();
        expect(stamp).not.toHaveBeenCalled();
        expect(ledger).toHaveBeenCalledWith({
            data: expect.objectContaining({
                outcome: "FAILURE",
                reason: "On legal hold: the erase stopped",
            }),
        });
    });

    it("waits while a customer is still owed a refund", async () => {
        read.mockResolvedValue(deleted(400));
        mock(refundsOutstanding).mockResolvedValue({ count: 2, rows: [] });
        const { handler, media } = build();
        expect((await handler.eraseOne("o1", NOW)).outcome).toBe("waiting");
        expect(media.removeAllForDeletedBusiness).not.toHaveBeenCalled();
    });

    it("names a failing step, goes on with the rest, and doesn't stamp", async () => {
        read.mockResolvedValue(deleted(400));
        const { handler, media } = build();
        media.removeAllForDeletedBusiness.mockRejectedValueOnce(
            new Error("storage down"),
        );

        const result = await handler.eraseOne("o1", NOW);

        expect(result.outcome).toBe("failed");
        expect(result.failed).toEqual(["media"]);
        expect(writes.eraseRecords).toHaveBeenCalled();
        expect(stamp).not.toHaveBeenCalled();
    });

    it("does a capped number of contacts a run and comes back for the rest", async () => {
        read.mockResolvedValue(deleted(400));
        // Always another full batch.
        mock(writes.contactsToErase).mockImplementation(
            async (_org: string, _skip: string[], take: number) =>
                Array.from({ length: take }, (_, i) => `c${i}`),
        );
        const { handler } = build();

        const result = await handler.eraseOne("o1", NOW);

        expect(result.outcome).toBe("more");
        expect(writes.eraseContact).toHaveBeenCalledTimes(
            ERASE_CONTACTS_PER_RUN,
        );
        expect(stamp).not.toHaveBeenCalled();
    });
});

describe("OrganizationRetentionEraseHandler.handle (DEC-122)", () => {
    it("schedules the next run a day on", async () => {
        await build().handler.handle(job());
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + RETENTION_ERASE_EVERY_MS),
        );
    });

    it("comes back in a minute when a business has more to erase", async () => {
        list.mockResolvedValue([{ id: "o1" }]);
        read.mockResolvedValue(deleted(400));
        mock(writes.contactsToErase).mockImplementation(
            async (_org: string, _skip: string[], take: number) =>
                Array.from({ length: take }, (_, i) => `c${i}`),
        );
        await build().handler.handle(job());
        expect(nextRun()).toEqual(
            new Date(NOW.getTime() + RETENTION_ERASE_BACKLOG_MS),
        );
    });

    it("still schedules the next run when the sweep fails", async () => {
        heldCount.mockRejectedValue(new Error("db down"));
        await build().handler.handle(job());
        expect(nextRun()).toBeDefined();
    });

    it("throws when the next run can't be queued, so the worker retries", async () => {
        jobCreate.mockRejectedValue(new Error("db down"));
        await expect(build().handler.handle(job())).rejects.toThrow(
            "Could not schedule the next retention erase",
        );
    });

    it("takes one already waiting as scheduled", async () => {
        jobCreate.mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(build().handler.schedule(NOW)).resolves.toBe(true);
    });
});
