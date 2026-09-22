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
        },
        invoice: { findFirst: jest.fn() },
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
            customerSubscription: { findFirst: jest.fn(), findMany: jest.fn() },
            invoice: { findMany: jest.fn(), count: jest.fn() },
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
const service = new SubscriptionsService({
    issueInTx,
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
    tx.customerSubscription!.create!.mockResolvedValue({ id: "sub_1" });
    tx.customerSubscription!.findFirst!.mockResolvedValue(sub());
    tx.customerSubscription!.findUnique!.mockResolvedValue(sub());
    tx.invoice!.findFirst!.mockResolvedValue(null);
});

afterEach(() => jest.useRealTimers());

describe("subscribing", () => {
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
                cancelledAt: at("2026-10-01T00:00:00Z"),
                cancelAtPeriodEnd: false,
            },
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
