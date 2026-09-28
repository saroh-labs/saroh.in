import type { Job } from "@saroh/database";

import {
    WAITLIST_OFFER_TYPE,
    WaitlistOfferHandler,
} from "./waitlist-offer.handler";

/**
 * The `waitlist.offer` job's own rules (round-2 A12): it names a session
 * and nothing else, re-reads the service, and closes the line of a service
 * taken off sale. What is offered, and to whom, is pinned against a real
 * database in `waitlist.service.db.spec.ts`.
 */

const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    service: { findFirst: jest.fn() },
    classWaitlistEntry: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
    },
    booking: { count: jest.fn().mockResolvedValue(0) },
    courseSession: { findMany: jest.fn().mockResolvedValue([]) },
    job: { create: jest.fn() },
};

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
        },
        runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
    };
});

function job(payload: unknown, organizationId: string | null = "org_1"): Job {
    return {
        id: "job_1",
        type: WAITLIST_OFFER_TYPE,
        organizationId,
        payload,
    } as unknown as Job;
}

const START = "2026-10-05T07:00:00.000Z";

describe("WaitlistOfferHandler", () => {
    const handler = new WaitlistOfferHandler();
    beforeEach(() => jest.clearAllMocks());

    it("is registered under waitlist.offer", () => {
        expect(WAITLIST_OFFER_TYPE).toBe("waitlist.offer");
    });

    it("does nothing for a job that names no session or no business", async () => {
        await handler.handle(job({}));
        await handler.handle(job({ serviceId: "svc_1", startAt: "soon" }));
        await handler.handle(job({ serviceId: "svc_1", startAt: START }, null));
        expect(tx.service.findFirst).not.toHaveBeenCalled();
    });

    it("does nothing when the service is gone", async () => {
        tx.service.findFirst.mockResolvedValueOnce(null);
        await handler.handle(job({ serviceId: "svc_1", startAt: START }));
        expect(tx.classWaitlistEntry.updateMany).not.toHaveBeenCalled();
    });

    it("takes the service's row lock, in the business, before reading", async () => {
        tx.service.findFirst.mockResolvedValueOnce(null);
        await handler.handle(job({ serviceId: "svc_1", startAt: START }));
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.service.findFirst).toHaveBeenCalledWith({
            where: { id: "svc_1", organizationId: "org_1" },
        });
    });

    it.each([
        ["archived", { status: "ARCHIVED", deletedAt: null, capacity: 10 }],
        ["deleted", { status: "ACTIVE", deletedAt: new Date(), capacity: 10 }],
        [
            "no longer a class",
            { status: "ACTIVE", deletedAt: null, capacity: 1 },
        ],
    ])("closes the line of a service %s, offering nothing", async (_, s) => {
        tx.service.findFirst.mockResolvedValueOnce({ id: "svc_1", ...s });
        const offered = await handler.offer(
            "org_1",
            { serviceId: "svc_1", startAt: START },
            new Date("2026-10-01T00:00:00Z"),
        );
        expect(offered).toBe(0);
        expect(tx.classWaitlistEntry.updateMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                serviceId: "svc_1",
                startAt: new Date(START),
                status: { in: ["WAITING", "OFFERED"] },
            },
            data: { status: "CLOSED", closedAt: expect.any(Date) },
        });
        expect(tx.job.create).not.toHaveBeenCalled();
    });
});
