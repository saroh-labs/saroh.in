// The team's "Not collected" alert (R34) against a stand-in transaction:
// queued for the third day in the business's zone, told once on the New
// order row, never for an order paid, handed over or cancelled since, and
// never a cancel.
jest.mock("@saroh/database", () => ({
    prisma: { $transaction: jest.fn() },
    runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
}));
jest.mock("../../env", () => ({
    env: { APP_URL: "https://app.saroh.localhost" },
}));

import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { CommunicationsService } from "../communications/communications.service";
import { alertEventOfType } from "./alert-preferences";
import {
    TEAM_ALERT_TYPE,
    TeamAlertHandler,
    tellTeam,
} from "./team-alert.handler";
import {
    ORDER_UNCOLLECTED_NOTIFICATION_TYPE,
    queueUncollectedAlert,
} from "./uncollected-alert";

const ORG = "org_1";
/** An instant in Kolkata, as `YYYY-MM-DDTHH:mm`. */
const at = (local: string) => new Date(`${local}:00.000+05:30`);
const PLACED = at("2026-10-05T22:00");

function makeTx(order: Record<string, unknown> = {}) {
    return {
        order: {
            findFirst: jest.fn().mockResolvedValue({
                id: "ord_1",
                orderId: "ORD-1042",
                createdAt: PLACED,
                status: "PROCESSING",
                paymentStatus: "UNPAID",
                payOnHandover: true,
                fulfilment: "PICKUP",
                customerId: "cus_1",
                walkInName: null,
                customer: {
                    firstName: "Anika",
                    lastName: "Rao",
                    email: "anika@example.com",
                },
                ...order,
            }),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        businessProfile: {
            findUnique: jest
                .fn()
                .mockResolvedValue({ timezone: "Asia/Kolkata" }),
        },
        service: { findFirst: jest.fn().mockResolvedValue(null) },
        job: { create: jest.fn().mockResolvedValue({}) },
        membership: {
            findMany: jest.fn().mockResolvedValue([
                { userId: "u_owner", role: "OWNER" },
                { userId: "u_kitchen", role: "MEMBER" },
            ]),
        },
        organizationRole: { findMany: jest.fn().mockResolvedValue([]) },
        // Both chose email for New order.
        notificationPreference: {
            findMany: jest.fn().mockResolvedValue([
                {
                    userId: "u_owner",
                    event: "order",
                    channel: "email",
                    enabled: true,
                },
                {
                    userId: "u_kitchen",
                    event: "order",
                    channel: "email",
                    enabled: true,
                },
            ]),
        },
        organization: {
            findUnique: jest.fn().mockResolvedValue({ name: "Rye & Co" }),
        },
        customerNotice: {
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockResolvedValue({}),
        },
        notification: {
            create: jest.fn().mockResolvedValue({ id: "ntf_1" }),
        },
    };
}
type FakeTx = ReturnType<typeof makeTx>;
const asTx = (tx: FakeTx) => tx as unknown as Prisma.TransactionClient;

const queueTransactional = jest.fn().mockResolvedValue({ id: "msg_1" });
const comms = {
    emailConnected: jest.fn().mockResolvedValue(true),
    queueTransactional,
} as unknown as CommunicationsService;

const payload = { event: "uncollected" as const, orderId: "ord_1" };

beforeEach(() => jest.clearAllMocks());

describe("queued with the order (R34)", () => {
    it("runs at the start of the third day after it was placed, in the business's zone", async () => {
        const tx = makeTx();
        await queueUncollectedAlert(asTx(tx), ORG, {
            id: "ord_1",
            createdAt: PLACED,
        });
        expect(tx.job.create).toHaveBeenCalledWith({
            data: {
                organizationId: ORG,
                type: TEAM_ALERT_TYPE,
                payload,
                runAt: at("2026-10-08T00:00"),
            },
        });
    });
});

describe("telling the team", () => {
    it("tells them once it is three days old: the bell, and email to whoever chose it for New order", async () => {
        const tx = makeTx();
        const out = await tellTeam(
            asTx(tx),
            comms,
            ORG,
            payload,
            at("2026-10-08T00:05"),
        );
        expect(out).toEqual({ told: true, emailed: 2 });
        expect(tx.customerNotice.createMany.mock.calls[0][0].data).toEqual([
            {
                organizationId: ORG,
                eventKey: "team:uncollected:ord_1",
                kind: "TEAM_TOLD",
                orderId: "ord_1",
            },
        ]);
        const notice = tx.notification.create.mock.calls[0][0].data;
        expect(notice).toMatchObject({
            organizationId: ORG,
            type: ORDER_UNCOLLECTED_NOTIFICATION_TYPE,
            title: "Not collected: order ORD-1042 from Anika Rao",
        });
        expect(notice.body).toContain("Placed 3 days ago to pay on collection");
        expect(notice.body).toContain("Nothing cancels on its own.");
        // It sits on the New order row: whoever turned that off hears none.
        expect(alertEventOfType(ORDER_UNCOLLECTED_NOTIFICATION_TYPE)).toBe(
            "order",
        );
        const email = queueTransactional.mock.calls[0][2] as {
            rendered: { body: string };
        };
        expect(email.rendered.body).toContain("/commerce/orders/ord_1");
    });

    it("never tells them twice, however long it keeps waiting", async () => {
        const tx = makeTx();
        tx.customerNotice.createMany.mockResolvedValue({ count: 0 });
        const out = await tellTeam(
            asTx(tx),
            comms,
            ORG,
            payload,
            at("2026-10-12T09:00"),
        );
        expect(out).toEqual({ told: false, emailed: 0 });
        expect(tx.notification.create).not.toHaveBeenCalled();
        expect(queueTransactional).not.toHaveBeenCalled();
    });

    it.each([
        ["paid", { paymentStatus: "PAID" }],
        [
            "collected",
            { status: "DELIVERED", stage: "COLLECTED", paymentStatus: "PAID" },
        ],
        ["cancelled", { status: "CANCELLED" }],
    ])("says nothing about an order %s since", async (_why, over) => {
        const tx = makeTx(over);
        const out = await tellTeam(
            asTx(tx),
            comms,
            ORG,
            payload,
            at("2026-10-09T09:00"),
        );
        expect(out.told).toBe(false);
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
    });

    it("never cancels the order, or touches it", async () => {
        const tx = makeTx();
        await tellTeam(asTx(tx), comms, ORG, payload, at("2026-10-20T09:00"));
        expect(tx.order.update).not.toHaveBeenCalled();
        expect(tx.order.updateMany).not.toHaveBeenCalled();
    });
});

describe("the job", () => {
    const job = (over: Partial<Job> = {}) =>
        ({
            id: "job_1",
            organizationId: ORG,
            type: TEAM_ALERT_TYPE,
            payload,
            ...over,
        }) as Job;

    afterEach(() => jest.useRealTimers());

    it("run early (the business moved its zone since) waits for its day instead of dropping it", async () => {
        const tx = makeTx();
        tx.businessProfile.findUnique.mockResolvedValue({
            timezone: "America/Los_Angeles",
        });
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        jest.useFakeTimers({ now: at("2026-10-08T00:30") });

        await new TeamAlertHandler(comms).handle(job());

        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
        expect(tx.job.create).toHaveBeenCalledTimes(1);
        const again = tx.job.create.mock.calls[0][0].data;
        expect(again.payload).toEqual(payload);
        // Placed on the 5th in Los Angeles too: due on the 8th there.
        expect(again.runAt).toEqual(new Date("2026-10-08T07:00:00.000Z"));
    });

    it("run on its day tells the team, and queues nothing more", async () => {
        const tx = makeTx();
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        jest.useFakeTimers({ now: at("2026-10-08T00:30") });

        await new TeamAlertHandler(comms).handle(job());

        expect(tx.customerNotice.createMany).toHaveBeenCalledTimes(1);
        expect(tx.job.create).not.toHaveBeenCalled();
    });

    it("for an order paid meanwhile, neither tells nor queues again", async () => {
        const tx = makeTx({ paymentStatus: "PAID" });
        (prisma.$transaction as jest.Mock).mockImplementation(
            (fn: (t: unknown) => unknown) => fn(tx),
        );
        await new TeamAlertHandler(comms).handle(job());
        expect(tx.customerNotice.createMany).not.toHaveBeenCalled();
        expect(tx.job.create).not.toHaveBeenCalled();
    });
});
