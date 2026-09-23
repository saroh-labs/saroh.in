// Subscriptions: who may, whose ids are trusted, forward-only billing, and
// what pause, resume, cancel and renewal each do to the period. The database
// and the invoices service are mocked; the calendar has its own spec
// (periods.spec.ts), and the real-database races are in the .db spec.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn(),
        customerSubscription: {
            create: jest.fn(),
            update: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            count: jest.fn(),
        },
        subscriptionPlan: { findFirst: jest.fn() },
        subscriptionSkip: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
            deleteMany: jest.fn(),
        },
        invoice: { findFirst: jest.fn() },
        organizationModule: { findFirst: jest.fn() },
    };
    return {
        ...actual,
        prisma: {
            contact: { findFirst: jest.fn() },
            subscriptionPlan: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                create: jest.fn(),
                updateMany: jest.fn(),
            },
            businessProfile: { findUnique: jest.fn() },
            customerSubscription: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                count: jest.fn(),
            },
            invoice: { findMany: jest.fn(), count: jest.fn() },
            subscriptionSkip: { findMany: jest.fn() },
            job: { findFirst: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { InvoicesService } from "../invoices/invoices.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { SubscriptionsService } from "./subscriptions.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked> & {
    __tx: Record<string, Mocked> & { $queryRaw: jest.Mock };
};
const tx = db.__tx;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };

const issueInTx = jest.fn();
const createPayLink = jest.fn();
const service = new SubscriptionsService({
    issueInTx,
    createPayLink,
} as unknown as InvoicesService);

const decimal = (s: string) => ({ toString: () => s });
const at = (s: string) => new Date(s);

const PLAN = {
    id: "plan_1",
    organizationId: "org_1",
    name: "Monthly membership",
    description: null,
    price: decimal("1200"),
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    createdAt: at("2026-01-01T00:00:00Z"),
};

function sub(over: Record<string, unknown> = {}) {
    return {
        id: "sub_1",
        organizationId: "org_1",
        status: "ACTIVE",
        planId: "plan_1",
        plan: { id: "plan_1", name: "Monthly membership" },
        contactId: "c_1",
        contact: {
            id: "c_1",
            firstName: "Asha",
            lastName: "Rao",
            email: "asha@example.com",
        },
        price: decimal("1200"),
        currency: "INR",
        interval: "MONTH",
        timezone: "UTC",
        anchorAt: at("2026-09-01T00:00:00Z"),
        currentPeriodStart: at("2026-09-01T00:00:00Z"),
        currentPeriodEnd: at("2026-10-01T00:00:00Z"),
        pausedAt: null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        collectionWeekday: null,
        collectionNote: null,
        pendingPlanId: null,
        pendingPlan: null,
        createdAt: at("2026-09-01T00:00:00Z"),
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: at("2026-09-22T10:00:00Z") });
    db.contact!.findFirst!.mockResolvedValue({ id: "c_1" });
    db.subscriptionPlan!.findFirst!.mockResolvedValue({
        ...PLAN,
        _count: { subscriptions: 0 },
    });
    db.businessProfile!.findUnique!.mockResolvedValue({ timezone: "UTC" });
    db.customerSubscription!.findFirst!.mockResolvedValue(sub());
    db.invoice!.findMany!.mockResolvedValue([]);
    db.subscriptionSkip!.findMany!.mockResolvedValue([]);
    tx.subscriptionSkip!.findFirst!.mockResolvedValue(null);
    tx.subscriptionSkip!.findMany!.mockResolvedValue([]);
    tx.customerSubscription!.count!.mockResolvedValue(0);
    tx.customerSubscription!.create!.mockResolvedValue({ id: "sub_1" });
    tx.customerSubscription!.findFirst!.mockResolvedValue(sub());
    tx.customerSubscription!.findUnique!.mockResolvedValue(sub());
    tx.invoice!.findFirst!.mockResolvedValue(null);
    tx.organizationModule!.findFirst!.mockResolvedValue(null);
});

afterEach(() => jest.useRealTimers());

describe("subscribing", () => {
    beforeEach(() => {
        db.customerSubscription!.count!.mockResolvedValue(0);
    });

    it("refuses a second live subscription to the same plan", async () => {
        db.customerSubscription!.count!.mockResolvedValue(1);
        const attempt = service.subscribe(owner, {
            contactId: "c_1",
            planId: "plan_1",
        });
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(
            "They are already on Monthly membership.",
        );
        expect(tx.customerSubscription!.create).not.toHaveBeenCalled();
    });

    it("refuses the second of two subscribes at once, by the index", async () => {
        tx.customerSubscription!.create!.mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(
            service.subscribe(owner, { contactId: "c_1", planId: "plan_1" }),
        ).rejects.toThrow("They are already on Monthly membership.");
    });

    it("bills only the period holding today when the start is six months back", async () => {
        await service.subscribe(owner, {
            contactId: "c_1",
            planId: "plan_1",
            startDate: "2026-03-15",
        });

        expect(tx.customerSubscription!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    anchorAt: at("2026-03-15T00:00:00Z"),
                    currentPeriodStart: at("2026-09-15T00:00:00Z"),
                    currentPeriodEnd: at("2026-10-15T00:00:00Z"),
                    price: "1200.00",
                    currency: "INR",
                    interval: "MONTH",
                    timezone: "UTC",
                }),
            }),
        );
        expect(issueInTx).toHaveBeenCalledTimes(1);
        expect(issueInTx.mock.calls[0]![2]).toEqual(
            expect.objectContaining({
                source: "SUBSCRIPTION",
                subscriptionId: "sub_1",
                periodStart: at("2026-09-15T00:00:00Z"),
                periodEnd: at("2026-10-15T00:00:00Z"),
                lines: [
                    {
                        description:
                            "Monthly membership · 15 Sep – 14 Oct 2026",
                        quantity: 1,
                        unitPrice: "1200.00",
                    },
                ],
            }),
        );
    });

    it("starts on the business's midnight when no date is given", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue({
            timezone: "Asia/Kolkata",
        });
        await service.subscribe(owner, { contactId: "c_1", planId: "plan_1" });
        const data = tx.customerSubscription!.create!.mock.calls[0]![0].data;
        expect(data.timezone).toBe("Asia/Kolkata");
        // 22 Sep 00:00 in Kolkata.
        expect(data.anchorAt).toEqual(at("2026-09-21T18:30:00Z"));
    });

    it("is refused while Payments is off: a subscription is its invoices", async () => {
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "m_1" });
        const attempt = service.subscribe(owner, {
            planId: "plan_1",
            contactId: "c_1",
        });
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow("Payments is switched off");
        expect(tx.customerSubscription!.create).not.toHaveBeenCalled();
    });

    it("bills nothing yet for a start still ahead; its first invoice waits for the day", async () => {
        // Today is 22 Sep; they start on 1 Oct.
        await service.subscribe(owner, {
            contactId: "c_1",
            planId: "plan_1",
            startDate: "2026-10-01",
        });
        expect(tx.customerSubscription!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    anchorAt: at("2026-10-01T00:00:00Z"),
                    currentPeriodStart: at("2026-10-01T00:00:00Z"),
                    currentPeriodEnd: at("2026-10-01T00:00:00Z"),
                }),
            }),
        );
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("refuses an archived plan", async () => {
        db.subscriptionPlan!.findFirst!.mockResolvedValue({
            ...PLAN,
            status: "ARCHIVED",
        });
        await expect(
            service.subscribe(owner, { contactId: "c_1", planId: "plan_1" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.customerSubscription!.create).not.toHaveBeenCalled();
    });

    it("answers another business's plan or contact with a 404", async () => {
        db.subscriptionPlan!.findFirst!.mockResolvedValue(null);
        await expect(
            service.subscribe(owner, { contactId: "c_1", planId: "plan_x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.subscriptionPlan!.findFirst).toHaveBeenCalledWith({
            where: { id: "plan_x", organizationId: "org_1" },
        });

        db.subscriptionPlan!.findFirst!.mockResolvedValue(PLAN);
        db.contact!.findFirst!.mockResolvedValue(null);
        await expect(
            service.subscribe(owner, { contactId: "c_x", planId: "plan_1" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("refuses a timezone that does not exist", async () => {
        await expect(
            service.subscribe(owner, {
                contactId: "c_1",
                planId: "plan_1",
                timezone: "Mars/Olympus",
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe("pause and resume", () => {
    it("moves the period end by the whole days paused, with no invoice", async () => {
        // Paid 1 Sep – 1 Oct; paused 5 Sep, resumed 10 Sep.
        jest.setSystemTime(at("2026-09-10T09:00:00Z"));
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "PAUSED", pausedAt: at("2026-09-05T09:00:00Z") }),
        );
        await service.resume(owner, "sub_1");

        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                status: "ACTIVE",
                pausedAt: null,
                currentPeriodEnd: at("2026-10-06T00:00:00Z"),
                anchorAt: at("2026-10-06T00:00:00Z"),
            },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("counts a pause across a clock change in whole calendar days", async () => {
        // New York springs forward on 8 Mar 2026: noon 1 Mar to noon 10 Mar
        // is nine days, though an hour short of nine times 24 hours.
        jest.setSystemTime(at("2026-03-10T16:00:00Z"));
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                timezone: "America/New_York",
                status: "PAUSED",
                pausedAt: at("2026-03-01T17:00:00Z"),
                currentPeriodStart: at("2026-02-15T05:00:00Z"),
                currentPeriodEnd: at("2026-03-15T04:00:00Z"),
            }),
        );
        await service.resume(owner, "sub_1");
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data
                .currentPeriodEnd,
        ).toEqual(at("2026-03-24T04:00:00Z"));
    });

    it("changes nothing when a pause is undone within seconds", async () => {
        jest.setSystemTime(at("2026-09-05T09:00:04Z"));
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "PAUSED", pausedAt: at("2026-09-05T09:00:00Z") }),
        );
        await service.resume(owner, "sub_1");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                status: "ACTIVE",
                pausedAt: null,
                currentPeriodEnd: at("2026-10-01T00:00:00Z"),
            },
        });
    });

    it("starts a new period with one invoice when the pause outlasted the paid one", async () => {
        jest.setSystemTime(at("2026-10-20T15:00:00Z"));
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "PAUSED", pausedAt: at("2026-09-05T09:00:00Z") }),
        );
        await service.resume(owner, "sub_1");

        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: expect.objectContaining({
                status: "ACTIVE",
                anchorAt: at("2026-10-20T00:00:00Z"),
                currentPeriodStart: at("2026-10-20T00:00:00Z"),
                currentPeriodEnd: at("2026-11-20T00:00:00Z"),
            }),
        });
        expect(issueInTx).toHaveBeenCalledTimes(1);
        expect(issueInTx.mock.calls[0]![2].periodStart).toEqual(
            at("2026-10-20T00:00:00Z"),
        );
    });

    it("ends one set to end with its period, rather than billing another", async () => {
        jest.setSystemTime(at("2026-10-20T15:00:00Z"));
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                status: "PAUSED",
                pausedAt: at("2026-09-05T09:00:00Z"),
                cancelAtPeriodEnd: true,
            }),
        );
        await service.resume(owner, "sub_1");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                status: "CANCELLED",
                pausedAt: null,
                cancelledAt: at("2026-10-01T00:00:00Z"),
                cancelAtPeriodEnd: false,
            },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("refuses a restart that would bill while Payments is off", async () => {
        jest.setSystemTime(at("2026-10-20T15:00:00Z"));
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "m_1" });
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "PAUSED", pausedAt: at("2026-09-05T09:00:00Z") }),
        );
        await expect(service.resume(owner, "sub_1")).rejects.toThrow(
            "Payments is switched off",
        );
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("still resumes inside a paid period while Payments is off", async () => {
        jest.setSystemTime(at("2026-09-10T09:00:00Z"));
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "m_1" });
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "PAUSED", pausedAt: at("2026-09-05T09:00:00Z") }),
        );
        await expect(service.resume(owner, "sub_1")).resolves.toBeDefined();
    });

    it("takes the row lock before reading, scoped to the business", async () => {
        await service.pause(owner, "sub_1");
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.customerSubscription!.findFirst!.mock.invocationCallOrder[0]!,
        );
        expect(tx.customerSubscription!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "sub_1", organizationId: "org_1" },
            }),
        );
    });

    it("refuses to resume what is not paused, or pause what is cancelled", async () => {
        await expect(service.resume(owner, "sub_1")).rejects.toBeInstanceOf(
            ConflictException,
        );
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ status: "CANCELLED" }),
        );
        await expect(service.pause(owner, "sub_1")).rejects.toBeInstanceOf(
            ConflictException,
        );
    });
});

describe("cancelling", () => {
    it("lets the period run out when asked to end at period end", async () => {
        await service.cancel(owner, "sub_1", { when: "periodEnd" });
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { cancelAtPeriodEnd: true },
        });
    });

    it("ends it now when asked", async () => {
        await service.cancel(owner, "sub_1", { when: "now" });
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: expect.objectContaining({
                status: "CANCELLED",
                cancelAtPeriodEnd: false,
            }),
        });
    });

    it("can be taken back before the period runs out", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ cancelAtPeriodEnd: true }),
        );
        await service.keep(owner, "sub_1");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { cancelAtPeriodEnd: false },
        });
    });
});

describe("renewal", () => {
    const now = at("2026-10-01T02:00:00Z");

    it("invoices the next period and advances it", async () => {
        await expect(service.renewOne("sub_1", now)).resolves.toBe("renewed");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                currentPeriodStart: at("2026-10-01T00:00:00Z"),
                currentPeriodEnd: at("2026-11-01T00:00:00Z"),
            },
        });
        expect(issueInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            expect.objectContaining({
                periodStart: at("2026-10-01T00:00:00Z"),
                createdByUserId: null,
            }),
        );
    });

    it("issues the first invoice on the day a later start arrives", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({
                anchorAt: at("2026-10-01T00:00:00Z"),
                currentPeriodStart: at("2026-10-01T00:00:00Z"),
                currentPeriodEnd: at("2026-10-01T00:00:00Z"),
            }),
        );
        await expect(service.renewOne("sub_1", now)).resolves.toBe("renewed");
        expect(issueInTx.mock.calls[0]![2]).toMatchObject({
            periodStart: at("2026-10-01T00:00:00Z"),
            periodEnd: at("2026-11-01T00:00:00Z"),
        });
    });

    it("skips months it missed and bills only the current one", async () => {
        await service.renewOne("sub_1", at("2027-01-10T00:00:00Z"));
        expect(issueInTx).toHaveBeenCalledTimes(1);
        expect(issueInTx.mock.calls[0]![2].periodStart).toEqual(
            at("2027-01-01T00:00:00Z"),
        );
    });

    it("does not invoice a period that already has a live invoice", async () => {
        tx.invoice!.findFirst!.mockResolvedValue({ id: "inv_1" });
        await expect(service.renewOne("sub_1", now)).resolves.toBe("advanced");
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("ends a subscription cancelled at period end, without an invoice", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({ cancelAtPeriodEnd: true }),
        );
        await expect(service.renewOne("sub_1", now)).resolves.toBe("ended");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                status: "CANCELLED",
                pausedAt: null,
                cancelledAt: at("2026-10-01T00:00:00Z"),
                cancelAtPeriodEnd: false,
            },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("ends a paused one that was set to end, without an invoice", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({
                status: "PAUSED",
                pausedAt: at("2026-09-10T00:00:00Z"),
                cancelAtPeriodEnd: true,
            }),
        );
        await expect(service.renewOne("sub_1", now)).resolves.toBe("ended");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: expect.objectContaining({ status: "CANCELLED" }),
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it.each([
        ["paused", { status: "PAUSED" }],
        ["cancelled", { status: "CANCELLED" }],
        ["not yet due", { currentPeriodEnd: at("2026-10-02T00:00:00Z") }],
    ])("skips one that is %s, read under the lock", async (_label, over) => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(sub(over));
        await expect(service.renewOne("sub_1", now)).resolves.toBe("skipped");
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.customerSubscription!.update).not.toHaveBeenCalled();
        expect(issueInTx).not.toHaveBeenCalled();
    });
});

describe("what a subscription owes", () => {
    it("is overdue while any issued invoice is past due, even after the next is issued", async () => {
        db.invoice!.findMany!.mockResolvedValue([
            {
                id: "inv_0",
                number: "INV-0000",
                status: "PAID",
                subscriptionId: "sub_1",
                total: decimal("1200"),
                dueAt: at("2026-08-08T00:00:00Z"),
                paidAt: at("2026-08-02T00:00:00Z"),
            },
            {
                id: "inv_1",
                number: "INV-0001",
                status: "ISSUED",
                subscriptionId: "sub_1",
                total: decimal("1200"),
                dueAt: at("2026-09-08T00:00:00Z"),
                paidAt: null,
            },
            {
                id: "inv_2",
                number: "INV-0002",
                status: "ISSUED",
                subscriptionId: "sub_1",
                total: decimal("1200"),
                dueAt: at("2026-10-08T00:00:00Z"),
                paidAt: null,
            },
        ]);
        const view = await service.get(owner, "sub_1");
        expect(view).toEqual(
            expect.objectContaining({
                overdue: true,
                overdueCount: 1,
                unpaidCount: 2,
                unpaidTotal: "2400.00",
                oldestUnpaid: {
                    id: "inv_1",
                    number: "INV-0001",
                    dueAt: "2026-09-08T00:00:00.000Z",
                },
                nextRenewalAt: "2026-10-01T00:00:00.000Z",
                endsAt: null,
                // The latest issued, whatever is still owed on older ones.
                latestInvoice: {
                    id: "inv_2",
                    number: "INV-0002",
                    status: "ISSUED",
                    dueAt: "2026-10-08T00:00:00.000Z",
                    paidAt: null,
                },
            }),
        );
        // Paid invoices are not owed.
        expect(db.invoice!.findMany!.mock.calls[0]![0].where.status).toEqual({
            in: ["ISSUED", "PAID"],
        });
    });

    it("tells a role without invoices what is owed, but not which invoices", async () => {
        db.invoice!.findMany!.mockResolvedValue([
            {
                id: "inv_1",
                number: "INV-0001",
                status: "ISSUED",
                subscriptionId: "sub_1",
                total: decimal("1200"),
                dueAt: at("2026-09-08T00:00:00Z"),
                paidAt: null,
            },
        ]);
        const desk: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["subscription:read"]),
        };
        const view = await service.get(desk, "sub_1");
        expect(view).toMatchObject({
            overdue: true,
            unpaidTotal: "1200.00",
            oldestUnpaid: null,
            latestInvoice: null,
        });
    });

    it("dates a moved-over member from the start they were given", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                anchorAt: at("2026-03-15T00:00:00Z"),
                createdAt: at("2026-09-22T00:00:00Z"),
            }),
        );
        expect((await service.get(owner, "sub_1")).startedAt).toBe(
            "2026-03-15T00:00:00.000Z",
        );
    });

    it("dates a resumed member from when they were added, not the new anchor", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                anchorAt: at("2026-10-06T00:00:00Z"),
                createdAt: at("2026-09-01T00:00:00Z"),
            }),
        );
        expect((await service.get(owner, "sub_1")).startedAt).toBe(
            "2026-09-01T00:00:00.000Z",
        );
    });

    it("has no next renewal once set to end", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ cancelAtPeriodEnd: true }),
        );
        const view = await service.get(owner, "sub_1");
        expect(view.nextRenewalAt).toBeNull();
        expect(view.endsAt).toBe("2026-10-01T00:00:00.000Z");
    });
});

describe("renewals", () => {
    it("says when the job last ran, when it runs next, and what went out today", async () => {
        const jobs = (db as unknown as { job: Mocked }).job;
        jobs.findFirst!.mockResolvedValueOnce({
            processedAt: at("2026-09-22T09:46:00Z"),
        });
        jobs.findFirst!.mockResolvedValueOnce({
            runAt: at("2026-09-22T10:46:00Z"),
        });
        (db.invoice as Mocked).count!.mockResolvedValue(3);

        await expect(service.renewals(owner)).resolves.toEqual({
            lastCheckedAt: "2026-09-22T09:46:00.000Z",
            nextCheckAt: "2026-09-22T10:46:00.000Z",
            issuedToday: 3,
        });
        // Only this business's own renewal invoices, the job's (no person).
        expect((db.invoice as Mocked).count!.mock.calls[0]![0].where).toEqual(
            expect.objectContaining({
                organizationId: "org_1",
                source: "SUBSCRIPTION",
                createdByUserId: null,
            }),
        );
    });

    it("counts today from the business's own midnight", async () => {
        // 22 Sep, 10:00 UTC is 15:30 in Kolkata; its day began 21 Sep 18:30 UTC.
        db.businessProfile!.findUnique!.mockResolvedValue({
            timezone: "Asia/Kolkata",
        });
        (db.invoice as Mocked).count!.mockResolvedValue(0);
        await service.renewals(owner);
        expect(
            (db.invoice as Mocked).count!.mock.calls[0]![0].where.issuedAt,
        ).toEqual({ gte: at("2026-09-21T18:30:00Z") });
    });

    it("is refused to a Member", async () => {
        await expect(service.renewals(member)).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});

describe("who may", () => {
    it("refuses a Member every read and write", async () => {
        await expect(service.list(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(service.listPlans(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.subscribe(member, { contactId: "c_1", planId: "plan_1" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.pause(member, "sub_1")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("answers another business's subscription with a 404", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(null);
        await expect(service.get(owner, "sub_x")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });
});

describe("plans", () => {
    it("needs a name, price, currency and interval to create", async () => {
        await expect(
            service.createPlan(owner, { name: "Monthly" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("archives a plan for new sign-ups only", async () => {
        await service.setPlanStatus(owner, "plan_1", "ARCHIVED");
        expect(db.subscriptionPlan!.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_1", organizationId: "org_1" },
            data: { status: "ARCHIVED" },
        });
    });
});

// — U7: collections, skips, plan changes, a failed charge ——————————————

const SATURDAY = 6;
const collecting = (over: Record<string, unknown> = {}) =>
    sub({
        collectionWeekday: SATURDAY,
        collectionNote: "1 sourdough",
        ...over,
    });

const WEEKLY_BOX = {
    id: "plan_2",
    name: "Weekly box",
    price: decimal("300"),
    currency: "INR",
    interval: "MONTH",
};

describe("collections on a subscription", () => {
    it("lists the next six from today, with skipped ones marked", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(collecting());
        db.subscriptionSkip!.findMany!.mockResolvedValue([
            { subscriptionId: "sub_1", date: at("2026-10-03T00:00:00Z") },
        ]);
        const view = await service.get(owner, "sub_1");
        expect(view.collection).toEqual({
            weekday: SATURDAY,
            note: "1 sourdough",
            upcoming: [
                { date: "2026-09-26", skipped: false, changeable: true },
                { date: "2026-10-03", skipped: true, changeable: true },
                { date: "2026-10-10", skipped: false, changeable: true },
                { date: "2026-10-17", skipped: false, changeable: true },
                { date: "2026-10-24", skipped: false, changeable: true },
                { date: "2026-10-31", skipped: false, changeable: true },
            ],
        });
    });

    it("stops at the period end of one set to end, and lists none while paused", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValueOnce(
            collecting({ cancelAtPeriodEnd: true }),
        );
        expect(
            (await service.get(owner, "sub_1")).collection!.upcoming,
        ).toEqual([{ date: "2026-09-26", skipped: false, changeable: true }]);

        db.customerSubscription!.findFirst!.mockResolvedValueOnce(
            collecting({
                status: "PAUSED",
                pausedAt: at("2026-09-20T00:00:00Z"),
            }),
        );
        expect(
            (await service.get(owner, "sub_1")).collection!.upcoming,
        ).toEqual([]);
    });

    it("is null for a membership with nothing to collect", async () => {
        expect((await service.get(owner, "sub_1")).collection).toBeNull();
    });

    it("drops the skips still to come when the day changes", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(collecting());
        await service.setCollection(owner, "sub_1", { weekday: 3 });
        expect(tx.subscriptionSkip!.deleteMany).toHaveBeenCalledWith({
            where: {
                subscriptionId: "sub_1",
                date: { gt: at("2026-09-22T00:00:00Z") },
            },
        });
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { collectionWeekday: 3 },
        });
    });
});

describe("skipping a collection", () => {
    beforeEach(() => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(collecting());
    });

    it("records the skip by its date, under the row lock", async () => {
        await service.skipCollection(owner, "sub_1", { date: "2026-10-03" });
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.subscriptionSkip!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                subscriptionId: "sub_1",
                date: at("2026-10-03T00:00:00Z"),
                createdByUserId: "user_1",
            },
        });
    });

    it.each([
        ["a past collection", "2026-09-19"],
        ["a day that is not a collection day", "2026-10-02"],
        ["a date more than a year away", "2027-10-02"],
        ["something that is not a date", "2026-02-30"],
    ])("refuses %s, naming the field", async (_label, date) => {
        const err = await service
            .skipCollection(owner, "sub_1", { date })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            details: { field: "date" },
        });
        expect(tx.subscriptionSkip!.create).not.toHaveBeenCalled();
    });

    it("refuses one already skipped, and the loser of a double-click", async () => {
        tx.subscriptionSkip!.findFirst!.mockResolvedValueOnce({ id: "skip_1" });
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(ConflictException);

        tx.subscriptionSkip!.create!.mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses a collection after one set to end has ended", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            collecting({ cancelAtPeriodEnd: true }),
        );
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses while paused or cancelled, and without a schedule", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValueOnce(
            collecting({ status: "PAUSED" }),
        );
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(ConflictException);
        tx.customerSubscription!.findFirst!.mockResolvedValueOnce(
            collecting({ status: "CANCELLED" }),
        );
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(ConflictException);
        tx.customerSubscription!.findFirst!.mockResolvedValueOnce(sub());
        await expect(
            service.skipCollection(owner, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("is refused to a Member", async () => {
        await expect(
            service.skipCollection(member, "sub_1", { date: "2026-10-03" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});

describe("undoing a skip", () => {
    beforeEach(() => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(collecting());
        tx.subscriptionSkip!.findFirst!.mockResolvedValue({ id: "skip_1" });
    });

    it("removes the skip; an invoiced period stays as it is", async () => {
        tx.invoice!.findFirst!.mockResolvedValue({ id: "inv_1" });
        await service.unskipCollection(owner, "sub_1", "2026-09-26");
        expect(tx.subscriptionSkip!.delete).toHaveBeenCalledWith({
            where: { id: "skip_1" },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("invoices the current period when the skip had left it uncharged", async () => {
        // A weekly box from Saturday 19 Sep, collected on Thursdays.
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                interval: "WEEK",
                collectionWeekday: 4,
                anchorAt: at("2026-09-19T00:00:00Z"),
                currentPeriodStart: at("2026-09-19T00:00:00Z"),
                currentPeriodEnd: at("2026-09-26T00:00:00Z"),
            }),
        );
        await service.unskipCollection(owner, "sub_1", "2026-09-24");
        expect(issueInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            expect.objectContaining({
                periodStart: at("2026-09-19T00:00:00Z"),
                periodEnd: at("2026-09-26T00:00:00Z"),
                createdByUserId: "user_1",
            }),
        );
    });

    it("answers a date that is not skipped with a 404, and a passed one with a 409", async () => {
        tx.subscriptionSkip!.findFirst!.mockResolvedValueOnce(null);
        await expect(
            service.unskipCollection(owner, "sub_1", "2026-10-03"),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            service.unskipCollection(owner, "sub_1", "2026-09-19"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.subscriptionSkip!.delete).not.toHaveBeenCalled();
    });
});

describe("changing plan from the next renewal", () => {
    beforeEach(() => {
        tx.subscriptionPlan!.findFirst!.mockResolvedValue({
            id: "plan_2",
            name: "Weekly box",
            status: "ACTIVE",
        });
    });

    it("books the change and leaves the period already billed alone", async () => {
        await service.changePlan(owner, "sub_1", { planId: "plan_2" });
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { pendingPlanId: "plan_2" },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("shows the booked change on the subscription", async () => {
        db.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ pendingPlanId: "plan_2", pendingPlan: WEEKLY_BOX }),
        );
        expect((await service.get(owner, "sub_1")).pendingPlan).toEqual({
            id: "plan_2",
            name: "Weekly box",
            price: "300.00",
            currency: "INR",
            interval: "MONTH",
            from: "2026-10-01T00:00:00.000Z",
        });
    });

    it("refuses an archived plan, naming the field", async () => {
        tx.subscriptionPlan!.findFirst!.mockResolvedValue({
            id: "plan_2",
            name: "Weekly box",
            status: "ARCHIVED",
        });
        const err = await service
            .changePlan(owner, "sub_1", { planId: "plan_2" })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
            details: { field: "planId" },
        });
        expect(tx.customerSubscription!.update).not.toHaveBeenCalled();
    });

    it("refuses the plan they are on, another business's, and one they hold elsewhere", async () => {
        tx.subscriptionPlan!.findFirst!.mockResolvedValueOnce({
            id: "plan_1",
            name: "Monthly membership",
            status: "ACTIVE",
        });
        await expect(
            service.changePlan(owner, "sub_1", { planId: "plan_1" }),
        ).rejects.toBeInstanceOf(BadRequestException);

        tx.subscriptionPlan!.findFirst!.mockResolvedValueOnce(null);
        await expect(
            service.changePlan(owner, "sub_1", { planId: "plan_x" }),
        ).rejects.toBeInstanceOf(NotFoundException);

        tx.customerSubscription!.count!.mockResolvedValueOnce(1);
        await expect(
            service.changePlan(owner, "sub_1", { planId: "plan_2" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses a cancelled subscription and one set to end", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValueOnce(
            sub({ status: "CANCELLED" }),
        );
        await expect(
            service.changePlan(owner, "sub_1", { planId: "plan_2" }),
        ).rejects.toBeInstanceOf(ConflictException);
        tx.customerSubscription!.findFirst!.mockResolvedValueOnce(
            sub({ cancelAtPeriodEnd: true }),
        );
        await expect(
            service.changePlan(owner, "sub_1", { planId: "plan_2" }),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("is undone by clearing the booked plan", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ pendingPlanId: "plan_2", pendingPlan: WEEKLY_BOX }),
        );
        await service.cancelPlanChange(owner, "sub_1");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { pendingPlanId: null },
        });
        tx.customerSubscription!.findFirst!.mockResolvedValue(sub());
        await expect(
            service.cancelPlanChange(owner, "sub_1"),
        ).rejects.toBeInstanceOf(ConflictException);
    });

    it("is dropped when cancelled now, kept when set to end", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({ pendingPlanId: "plan_2", pendingPlan: WEEKLY_BOX }),
        );
        await service.cancel(owner, "sub_1", { when: "now" });
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data,
        ).toMatchObject({ status: "CANCELLED", pendingPlanId: null });

        await service.cancel(owner, "sub_1", { when: "periodEnd" });
        expect(tx.customerSubscription!.update!.mock.calls[1]![0].data).toEqual(
            { cancelAtPeriodEnd: true },
        );
    });

    it("applies on a resume past the paid period", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                status: "PAUSED",
                pausedAt: at("2026-08-10T00:00:00Z"),
                anchorAt: at("2026-08-01T00:00:00Z"),
                currentPeriodStart: at("2026-08-01T00:00:00Z"),
                currentPeriodEnd: at("2026-09-01T00:00:00Z"),
                pendingPlanId: "plan_2",
                pendingPlan: WEEKLY_BOX,
            }),
        );
        await service.resume(owner, "sub_1");
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data,
        ).toMatchObject({
            status: "ACTIVE",
            planId: "plan_2",
            price: "300.00",
            pendingPlanId: null,
        });
        expect(issueInTx.mock.calls[0]![2]).toMatchObject({
            lines: [
                expect.objectContaining({
                    description: expect.stringContaining("Weekly box"),
                    unitPrice: "300.00",
                }),
            ],
        });
    });

    it("waits through a resume inside the paid period", async () => {
        tx.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                status: "PAUSED",
                pausedAt: at("2026-09-20T00:00:00Z"),
                pendingPlanId: "plan_2",
                pendingPlan: WEEKLY_BOX,
            }),
        );
        await service.resume(owner, "sub_1");
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data,
        ).not.toHaveProperty("planId");
        expect(issueInTx).not.toHaveBeenCalled();
    });
});

describe("renewal with skips and a booked plan", () => {
    const now = at("2026-10-01T02:00:00Z");

    it("switches plan and price at the renewal, and bills the new ones", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({ pendingPlanId: "plan_2", pendingPlan: WEEKLY_BOX }),
        );
        await expect(service.renewOne("sub_1", now)).resolves.toBe("renewed");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                currentPeriodStart: at("2026-10-01T00:00:00Z"),
                currentPeriodEnd: at("2026-11-01T00:00:00Z"),
                planId: "plan_2",
                price: "300.00",
                currency: "INR",
                interval: "MONTH",
                pendingPlanId: null,
            },
        });
        expect(issueInTx.mock.calls[0]![2].lines[0]).toMatchObject({
            unitPrice: "300.00",
        });
    });

    it("starts a new interval's chain where the old period ended", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({
                anchorAt: at("2026-01-31T00:00:00Z"),
                pendingPlanId: "plan_2",
                pendingPlan: { ...WEEKLY_BOX, interval: "WEEK" },
            }),
        );
        await service.renewOne("sub_1", now);
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data,
        ).toMatchObject({
            anchorAt: at("2026-10-01T00:00:00Z"),
            currentPeriodStart: at("2026-10-01T00:00:00Z"),
            currentPeriodEnd: at("2026-10-08T00:00:00Z"),
            interval: "WEEK",
        });
    });

    it("keeps the old terms when the person already holds the new plan", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({ pendingPlanId: "plan_2", pendingPlan: WEEKLY_BOX }),
        );
        tx.customerSubscription!.count!.mockResolvedValue(1);
        await expect(service.renewOne("sub_1", now)).resolves.toBe("renewed");
        expect(
            tx.customerSubscription!.update!.mock.calls[0]![0].data,
        ).not.toHaveProperty("planId");
        expect(issueInTx.mock.calls[0]![2].lines[0].unitPrice).toBe("1200.00");
    });

    it("advances a period whose every collection is skipped without a charge", async () => {
        // A weekly box collected on Saturdays; the period from Thursday 1 Oct
        // holds one collection, Saturday 3 Oct, and it is skipped.
        tx.customerSubscription!.findUnique!.mockResolvedValue(
            sub({
                interval: "WEEK",
                collectionWeekday: SATURDAY,
                anchorAt: at("2026-09-24T00:00:00Z"),
                currentPeriodStart: at("2026-09-24T00:00:00Z"),
                currentPeriodEnd: at("2026-10-01T00:00:00Z"),
            }),
        );
        tx.subscriptionSkip!.findMany!.mockResolvedValue([
            { date: at("2026-10-03T00:00:00Z") },
        ]);
        await expect(service.renewOne("sub_1", now)).resolves.toBe("uncharged");
        expect(tx.customerSubscription!.update).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                currentPeriodStart: at("2026-10-01T00:00:00Z"),
                currentPeriodEnd: at("2026-10-08T00:00:00Z"),
            },
        });
        expect(tx.subscriptionSkip!.findMany).toHaveBeenCalledWith({
            where: {
                subscriptionId: "sub_1",
                date: { in: [at("2026-10-03T00:00:00Z")] },
            },
            select: { date: true },
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("still bills a month with one weekly collection skipped", async () => {
        tx.customerSubscription!.findUnique!.mockResolvedValue(collecting());
        tx.subscriptionSkip!.findMany!.mockResolvedValue([
            { date: at("2026-10-03T00:00:00Z") },
        ]);
        await expect(service.renewOne("sub_1", now)).resolves.toBe("renewed");
        expect(issueInTx).toHaveBeenCalledTimes(1);
    });
});

describe("a failed charge", () => {
    const paid = {
        id: "inv_0",
        number: "INV-0000",
        status: "PAID",
        subscriptionId: "sub_1",
        total: decimal("1200"),
        dueAt: at("2026-08-08T00:00:00Z"),
        paidAt: at("2026-08-02T00:00:00Z"),
    };
    const overdue = {
        id: "inv_1",
        number: "INV-0001",
        status: "ISSUED",
        subscriptionId: "sub_1",
        total: decimal("1200"),
        dueAt: at("2026-09-08T00:00:00Z"),
        paidAt: null,
    };

    it("is derived from the latest invoice unpaid past its due date", async () => {
        db.invoice!.findMany!.mockResolvedValue([paid, overdue]);
        expect(await service.get(owner, "sub_1")).toMatchObject({
            paymentFailed: true,
            failedCharge: {
                id: "inv_1",
                number: "INV-0001",
                dueAt: "2026-09-08T00:00:00.000Z",
                total: "1200.00",
            },
        });
    });

    it("is not an older unpaid invoice when the latest is paid, nor a cancelled one", async () => {
        // Oldest first: the overdue one, then a later one that was paid.
        db.invoice!.findMany!.mockResolvedValue([overdue, paid]);
        expect((await service.get(owner, "sub_1")).paymentFailed).toBe(false);

        db.invoice!.findMany!.mockResolvedValue([paid, overdue]);
        db.customerSubscription!.findFirst!.mockResolvedValue(
            sub({
                status: "CANCELLED",
                cancelledAt: at("2026-09-20T00:00:00Z"),
            }),
        );
        expect((await service.get(owner, "sub_1")).paymentFailed).toBe(false);
    });

    it("tells a role without invoices it failed, but not which invoice", async () => {
        db.invoice!.findMany!.mockResolvedValue([paid, overdue]);
        const desk: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["subscription:read"]),
        };
        expect(await service.get(desk, "sub_1")).toMatchObject({
            paymentFailed: true,
            failedCharge: null,
        });
    });

    it("retries by making a new pay link for that invoice", async () => {
        db.invoice!.findMany!.mockResolvedValue([paid, overdue]);
        createPayLink.mockResolvedValue({ token: "tok" });
        await expect(service.retryPayment(owner, "sub_1")).resolves.toEqual({
            invoiceId: "inv_1",
            token: "tok",
        });
        expect(createPayLink).toHaveBeenCalledWith(owner, "inv_1");
    });

    it("has nothing to retry when the latest charge is not overdue", async () => {
        await expect(
            service.retryPayment(owner, "sub_1"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(createPayLink).not.toHaveBeenCalled();
    });

    it("refuses a Member a retry", async () => {
        await expect(
            service.retryPayment(member, "sub_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
