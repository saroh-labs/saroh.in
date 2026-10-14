/**
 * "Move them" timing (KTD-4, DEC-161): a move that changes the price a
 * business pays is set at least 30 days after go-live and told 30 days
 * ahead; any other move keeps the 7 days. A fake transaction; made-up
 * prices (Plan B at 222, then 333).
 */
import {
    noticeDaysFor,
    pendingFromFor,
    PRICING_MOVE_NOTICE_TYPE,
    scheduleMoves,
} from "./moves.service";

const DAY = 24 * 60 * 60 * 1000;
const goLiveAt = new Date("2026-10-15T00:00:00.000Z");

const row = (over: Record<string, unknown> = {}) => ({
    key: "catalog.b",
    interval: "month",
    name: "Plan B",
    priceCents: 22_200,
    entitlements: { members: 3 },
    ...over,
});

function fakeTx(
    subs: {
        id: string;
        currentPeriodEnd: Date | null;
        plan: ReturnType<typeof row>;
    }[],
    target: ReturnType<typeof row> & { id: string },
) {
    const updates: { id: string; pendingFrom: Date }[] = [];
    const jobs: { runAt: Date; payload: Record<string, string> }[] = [];
    const tx = {
        plan: { findMany: jest.fn(async () => [target]) },
        subscription: {
            findMany: jest.fn(async () =>
                subs.map((s) => ({
                    ...s,
                    organizationId: `org-${s.id}`,
                    pendingPlan: null,
                })),
            ),
            update: jest.fn(
                async (a: {
                    where: { id: string };
                    data: { pendingFrom: Date };
                }) => {
                    updates.push({
                        id: a.where.id,
                        pendingFrom: a.data.pendingFrom,
                    });
                },
            ),
        },
        job: {
            findMany: jest.fn(async () => []),
            deleteMany: jest.fn(async () => ({ count: 0 })),
            create: jest.fn(
                async (a: {
                    data: {
                        type: string;
                        runAt: Date;
                        payload: Record<string, string>;
                    };
                }) => {
                    expect(a.data.type).toBe(PRICING_MOVE_NOTICE_TYPE);
                    jobs.push({ runAt: a.data.runAt, payload: a.data.payload });
                },
            ),
        },
    };
    return { tx: tx as never, updates, jobs };
}

describe("how far ahead a move is told", () => {
    it("is 30 days when the price changes, either way, else 7", () => {
        expect(
            noticeDaysFor({ priceCents: 22_200 }, { priceCents: 33_300 }),
        ).toBe(30);
        expect(
            noticeDaysFor({ priceCents: 33_300 }, { priceCents: 22_200 }),
        ).toBe(30);
        expect(
            noticeDaysFor({ priceCents: 22_200 }, { priceCents: 22_200 }),
        ).toBe(7);
    });

    it("moves on the first renewal at least that far after go-live", () => {
        const renews = new Date(goLiveAt.getTime() + 10 * DAY);
        expect(pendingFromFor(renews, goLiveAt, "month")).toEqual(renews);
        const at30 = pendingFromFor(renews, goLiveAt, "month", 30);
        expect(at30.getTime() - goLiveAt.getTime()).toBeGreaterThanOrEqual(
            30 * DAY,
        );
        expect(at30).toEqual(new Date("2026-11-25T00:00:00.000Z"));
        // Nothing to renew (Free): exactly the notice after go-live.
        expect(pendingFromFor(null, goLiveAt, "month", 30)).toEqual(
            new Date(goLiveAt.getTime() + 30 * DAY),
        );
    });
});

describe("scheduleMoves (DEC-161)", () => {
    const renews = new Date(goLiveAt.getTime() + 10 * DAY);

    it("a new price: moves 30+ days out, and is told 30 days before", async () => {
        const target = { id: "plan-v2-b", ...row({ priceCents: 33_300 }) };
        const { tx, updates, jobs } = fakeTx(
            [{ id: "s1", currentPeriodEnd: renews, plan: row() }],
            target,
        );
        const out = await scheduleMoves(tx, { version: 2, goLiveAt });
        expect(out).toEqual({ moved: 1, notices: 1 });
        const from = updates[0].pendingFrom;
        expect(from.getTime() - goLiveAt.getTime()).toBeGreaterThanOrEqual(
            30 * DAY,
        );
        expect(jobs).toHaveLength(1);
        expect(from.getTime() - jobs[0].runAt.getTime()).toBe(30 * DAY);
        expect(jobs[0].payload.pendingPlanId).toBe("plan-v2-b");
    });

    it("the same price with other limits: 7 days, as before", async () => {
        const target = {
            id: "plan-v2-b",
            ...row({ entitlements: { members: 5 } }),
        };
        const { tx, updates, jobs } = fakeTx(
            [{ id: "s1", currentPeriodEnd: renews, plan: row() }],
            target,
        );
        await scheduleMoves(tx, { version: 2, goLiveAt });
        expect(updates[0].pendingFrom).toEqual(renews);
        expect(renews.getTime() - jobs[0].runAt.getTime()).toBe(7 * DAY);
    });

    it("the same plan in every way: moved, told nothing", async () => {
        const target = { id: "plan-v2-b", ...row() };
        const { tx, jobs } = fakeTx(
            [{ id: "s1", currentPeriodEnd: renews, plan: row() }],
            target,
        );
        const out = await scheduleMoves(tx, { version: 2, goLiveAt });
        expect(out).toEqual({ moved: 1, notices: 0 });
        expect(jobs).toEqual([]);
    });
});
