jest.mock("@saroh/database", () => {
    const tx = {
        $executeRaw: jest.fn(),
        job: { count: jest.fn(), create: jest.fn() },
    };
    return {
        prisma: {
            accountManagerLink: { findMany: jest.fn() },
            organization: { findMany: jest.fn() },
            platformAdmin: { findMany: jest.fn() },
            job: { count: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});
jest.mock("../../common/email", () => ({
    sendManagerSignalsEmail: jest.fn(),
}));
jest.mock("./inactivity-signals", () => ({
    sweepInactivitySignals: jest.fn(),
    unemailedSignals: jest.fn(),
    markEmailed: jest.fn(),
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { sendManagerSignalsEmail } from "../../common/email";
import {
    markEmailed,
    sweepInactivitySignals,
    unemailedSignals,
} from "./inactivity-signals";
import {
    INACTIVITY_SWEEP_TYPE,
    InactivitySweepJob,
} from "./inactivity-sweep.job";

const db = prisma as unknown as {
    accountManagerLink: { findMany: jest.Mock };
    organization: { findMany: jest.Mock };
    platformAdmin: { findMany: jest.Mock };
    $transaction: jest.Mock;
    __tx: { job: { count: jest.Mock; create: jest.Mock } };
};
const send = sendManagerSignalsEmail as jest.Mock;
const mark = markEmailed as jest.Mock;
const unemailed = unemailedSignals as jest.Mock;

const since = new Date("2026-10-10T00:00:00.000Z");
const signal = (id: string, organizationId: string, kind: string) => ({
    id,
    organizationId,
    kind,
    since,
});

beforeEach(() => {
    jest.clearAllMocks();
    (sweepInactivitySignals as jest.Mock).mockResolvedValue({
        opened: 0,
        cleared: 0,
    });
    db.accountManagerLink.findMany.mockResolvedValue([
        { organizationId: "org-a", platformAdminId: "pa-1" },
        { organizationId: "org-b", platformAdminId: "pa-1" },
    ]);
    db.organization.findMany.mockResolvedValue([
        { id: "org-a", name: "Asha's Salon" },
        { id: "org-b", name: "Ravi's Studio" },
        { id: "org-c", name: "Nobody's Shop" },
    ]);
    db.platformAdmin.findMany.mockResolvedValue([
        { id: "pa-1", user: { email: "manager@example.com", name: "Meera" } },
    ]);
    db.__tx.job.count.mockResolvedValue(0);
    mark.mockImplementation((ids: string[]) => Promise.resolve(ids.length));
});

describe("InactivitySweepJob (#1199)", () => {
    const job = new InactivitySweepJob();
    const run = () => job.handle({} as Job);

    it("sends a manager one email listing both new signals, and marks them", async () => {
        unemailed.mockResolvedValue([
            signal("s1", "org-a", "NO_ACTIVITY"),
            signal("s2", "org-b", "NO_TRADING"),
        ]);
        send.mockResolvedValue("sent");

        await run();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith(
            { email: "manager@example.com", name: "Meera" },
            [
                {
                    organizationId: "org-a",
                    name: "Asha's Salon",
                    signals: [{ kind: "NO_ACTIVITY", since }],
                },
                {
                    organizationId: "org-b",
                    name: "Ravi's Studio",
                    signals: [{ kind: "NO_TRADING", since }],
                },
            ],
        );
        expect(mark).toHaveBeenCalledWith(["s1", "s2"], expect.any(Date));
        expect(db.__tx.job.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ type: INACTIVITY_SWEEP_TYPE }),
        });
    });

    it("sends nothing when nothing is new", async () => {
        unemailed.mockResolvedValue([]);
        await run();
        expect(send).not.toHaveBeenCalled();
        expect(mark).not.toHaveBeenCalled();
    });

    it("doesn't email or mark a business with no manager", async () => {
        unemailed.mockResolvedValue([signal("s3", "org-c", "NO_ACTIVITY")]);
        await run();
        expect(send).not.toHaveBeenCalled();
        expect(mark).not.toHaveBeenCalled();
    });

    it("leaves signals un-emailed when the mail fails, and still schedules the next run", async () => {
        unemailed.mockResolvedValue([signal("s1", "org-a", "NO_ACTIVITY")]);
        send.mockResolvedValue("failed");
        await run();
        expect(mark).not.toHaveBeenCalled();
        expect(db.__tx.job.create).toHaveBeenCalledTimes(1);
    });

    it("goes on to email when the sweep throws", async () => {
        (sweepInactivitySignals as jest.Mock).mockRejectedValue(new Error("x"));
        unemailed.mockResolvedValue([signal("s1", "org-a", "NO_ACTIVITY")]);
        send.mockResolvedValue("sent");
        await run();
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("throws when the next run can't be scheduled", async () => {
        unemailed.mockResolvedValue([]);
        db.$transaction.mockRejectedValueOnce(new Error("down"));
        await expect(run()).rejects.toThrow(/next inactivity sweep/);
    });
});
