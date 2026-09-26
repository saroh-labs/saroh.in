// The hold release sweep (U19): it releases holds whose time ran out, logs
// and moves past one that fails, and throws only when it cannot leave the
// next run waiting. Database and the release itself mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        prisma: {
            booking: { findMany: jest.fn() },
            job: { create: jest.fn(), count: jest.fn() },
            $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
        },
    };
});
jest.mock("./booking-hold", () => ({
    ...jest.requireActual("./booking-hold"),
    releaseHoldInTx: jest.fn(),
}));

import { Logger } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { releaseHoldInTx } from "./booking-hold";
import {
    RELEASE_BATCH,
    RELEASE_EVERY_MS,
    RELEASE_HOLDS_TYPE,
    ReleaseHoldsHandler,
} from "./release-holds.handler";

const findMany = prisma.booking.findMany as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const jobCount = prisma.job.count as jest.Mock;
const release = releaseHoldInTx as jest.Mock;

const NOW = new Date("2026-09-18T10:00:00Z");
const JOB = {} as never;

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: NOW });
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    findMany.mockResolvedValue([]);
    jobCreate.mockResolvedValue({});
    release.mockResolvedValue(true);
});

afterEach(() => jest.useRealTimers());

describe("booking.release-holds", () => {
    it("releases every PENDING hold whose time ran out", async () => {
        findMany.mockResolvedValue([{ id: "bk_1" }, { id: "bk_2" }]);
        await new ReleaseHoldsHandler().handle(JOB);

        expect(findMany.mock.calls[0][0].where).toEqual({
            status: "PENDING",
            holdExpiresAt: { lte: NOW },
        });
        expect(release.mock.calls.map((c) => c[1])).toEqual(["bk_1", "bk_2"]);
        expect(release.mock.calls[0][2]).toEqual(NOW);
    });

    it("moves past a hold that fails, and still schedules the next run", async () => {
        findMany.mockResolvedValue([{ id: "bk_1" }, { id: "bk_2" }]);
        release.mockRejectedValueOnce(new Error("deadlock"));
        await new ReleaseHoldsHandler().handle(JOB);

        expect(release).toHaveBeenCalledTimes(2);
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: RELEASE_HOLDS_TYPE,
                payload: {},
                runAt: new Date(NOW.getTime() + RELEASE_EVERY_MS),
            },
        });
    });

    it("runs again straight away after a full batch", async () => {
        findMany.mockResolvedValue(
            Array.from({ length: RELEASE_BATCH }, (_, i) => ({
                id: `bk_${i}`,
            })),
        );
        await new ReleaseHoldsHandler().handle(JOB);
        expect(jobCreate.mock.calls[0][0].data.runAt).toEqual(NOW);
    });

    it("counts a run already waiting as scheduled", async () => {
        jobCreate.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("Unique constraint", {
                code: "P2002",
                clientVersion: "test",
            }),
        );
        await expect(new ReleaseHoldsHandler().handle(JOB)).resolves.toBe(
            undefined,
        );
    });

    it("throws when it cannot leave the next run waiting", async () => {
        jobCreate.mockRejectedValue(new Error("db down"));
        await expect(new ReleaseHoldsHandler().handle(JOB)).rejects.toThrow(
            /next hold release run/,
        );
    });

    it("restarts the chain only when nothing is waiting or running", async () => {
        const handler = new ReleaseHoldsHandler();
        jobCount.mockResolvedValue(1);
        await handler.ensureScheduled();
        expect(jobCreate).not.toHaveBeenCalled();

        jobCount.mockResolvedValue(0);
        await handler.ensureScheduled();
        expect(jobCreate).toHaveBeenCalledTimes(1);
    });
});
