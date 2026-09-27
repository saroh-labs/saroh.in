import { flattenNeeds } from "./home-needs";
import { pausesWaitingOnPayments } from "./home-pause-sources";

/**
 * D8 on Home: pauses whose end date came while Payments is off, which the
 * renewal job left paused. Mocked Prisma; `subscriptions.db.spec.ts` reads
 * the same source against Postgres after a real refused resume.
 */

const NOW = new Date("2026-10-29T06:00:00.000Z");

function db(opts: { paymentsOff: boolean; rows?: unknown[]; count?: number }) {
    const rows = opts.rows ?? [];
    return {
        organizationModule: {
            findFirst: jest
                .fn()
                .mockResolvedValue(opts.paymentsOff ? { id: "m_1" } : null),
        },
        customerSubscription: {
            count: jest.fn().mockResolvedValue(opts.count ?? rows.length),
            findMany: jest.fn().mockResolvedValue(rows),
        },
    };
}

const ASHA = {
    id: "sub_1",
    pausedUntil: new Date("2026-10-29T00:00:00.000Z"),
    plan: { name: "Weekly bread" },
    contact: { firstName: "Asha", lastName: "Rao", email: "a@example.com" },
};

describe("pauses waiting on Payments", () => {
    it("says nothing while Payments is on, and doesn't look", async () => {
        const d = db({ paymentsOff: false, rows: [ASHA] });
        expect(
            await pausesWaitingOnPayments(d as never, "org_1", NOW),
        ).toBeNull();
        expect(d.customerSubscription.findMany).not.toHaveBeenCalled();
    });

    it("asks for this business's ended pauses past their paid period and not set to end", async () => {
        const d = db({ paymentsOff: true });
        expect(
            await pausesWaitingOnPayments(d as never, "org_1", NOW),
        ).toBeNull();
        expect(d.customerSubscription.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                status: "PAUSED",
                pausedUntil: { lte: NOW },
                currentPeriodEnd: { lte: NOW },
                cancelAtPeriodEnd: false,
            },
        });
    });

    it("names the one subscription, and sends the owner to turn Payments on", async () => {
        const action = await pausesWaitingOnPayments(
            db({ paymentsOff: true, rows: [ASHA] }) as never,
            "org_1",
            NOW,
        );
        expect(action).toMatchObject({
            code: "PAYMENTS_PAUSES_WAITING",
            title: "Turn Payments on to restart Asha Rao's Weekly bread",
            href: "/settings/modules",
            severity: "ATTENTION",
            count: 1,
            tone: "bad",
        });
        expect(action?.evidence?.[0]).toMatchObject({
            id: "sub_1",
            href: "/billing/subscriptions/sub_1",
            tag: "Pause ended",
            amountMinor: null,
        });

        const [row] = flattenNeeds([action!], "Asia/Kolkata").needs;
        expect(row).toMatchObject({
            title: "Turn Payments on to restart Asha Rao's Weekly bread",
            sub: "Their pause has ended. Restarting starts a new paid period, so it waits until Payments is on.",
            href: "/settings/modules",
            tone: "bad",
        });
    });

    it("counts them all as one row", async () => {
        const action = await pausesWaitingOnPayments(
            db({ paymentsOff: true, rows: [ASHA], count: 7 }) as never,
            "org_1",
            NOW,
        );
        expect(action?.title).toBe(
            "Turn Payments on to restart 7 paused subscriptions",
        );
        const { needs } = flattenNeeds([action!], "Asia/Kolkata");
        expect(needs).toHaveLength(1);
    });
});
