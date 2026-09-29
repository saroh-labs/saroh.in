/**
 * Subscriptions against a real Postgres: what the row lock and the partial
 * unique indexes guarantee, which a mock cannot show. Runs in the
 * integration project (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { pausesWaitingOnPayments } from "../home/home-pause-sources";
import { InvoicesService } from "../invoices/invoices.service";
import {
    RENEW_BATCH,
    SUBSCRIPTION_RENEW_TYPE,
    SubscriptionRenewHandler,
} from "./subscription-renew.handler";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const handler = new SubscriptionRenewHandler(service);

let org: OrganizationContext;
let contactId: string;
let planId: string;

async function makeOrg(slug: string): Promise<OrganizationContext> {
    const created = await prisma.organization.create({
        data: { name: slug, slug: `${slug}-${process.pid}` },
    });
    return { organizationId: created.id, userId: "user_1", role: "OWNER" };
}

beforeAll(async () => {
    org = await makeOrg("subs-org");
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: "asha@example.com",
                firstName: "Asha",
            },
        })
    ).id;
    planId = (
        await service.createPlan(org, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
});

const invoicesOf = (subscriptionId: string) =>
    prisma.invoice.findMany({
        where: { subscriptionId },
        orderBy: { periodStart: "asc" },
    });

/** Someone new each time: a person may be on a plan only once at a time. */
let people = 0;
async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: `member-${people}@example.com`,
            },
        })
    ).id;
}

/** Push a subscription's period into the past so it is due now. */
async function makeDue(id: string): Promise<void> {
    const start = new Date(Date.now() - 40 * 86_400_000);
    await prisma.customerSubscription.update({
        where: { id },
        data: {
            anchorAt: start,
            currentPeriodStart: start,
            currentPeriodEnd: new Date(Date.now() - 86_400_000),
        },
    });
}

describe("subscriptions (real database)", () => {
    it("bills a backdated start for the current period only", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
            startDate: "2026-01-15",
        });
        const invoices = await invoicesOf(s.id);
        expect(invoices).toHaveLength(1);
        expect(invoices[0]!.periodStart).toEqual(
            new Date(s.currentPeriodStart),
        );
        expect(invoices[0]!.status).toBe("ISSUED");
    });

    it("renews a due subscription exactly once, however often and however concurrently it runs", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(s.id);
        const now = new Date();

        const outcomes = await Promise.all([
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
        ]);
        expect(outcomes.filter((o) => o === "renewed")).toHaveLength(1);
        expect(outcomes.filter((o) => o === "skipped")).toHaveLength(2);

        await handler.renewDue(now);
        // One from signing up, one from the renewal.
        expect(await invoicesOf(s.id)).toHaveLength(2);
    });

    it("stays overdue for an unpaid old period after the next is issued", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        const [first] = await invoicesOf(s.id);
        await prisma.invoice.update({
            where: { id: first!.id },
            data: { dueAt: new Date(Date.now() - 86_400_000) },
        });
        await makeDue(s.id);
        await service.renewOne(s.id, new Date());

        const view = await service.get(org, s.id);
        expect(view.unpaidCount).toBe(2);
        expect(view.overdue).toBe(true);
        expect(view.oldestUnpaid?.id).toBe(first!.id);
    });

    it("never invoices after a cancel that won the race", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(s.id);
        await Promise.all([
            service.cancel(org, s.id, { when: "now" }),
            service.renewOne(s.id, new Date()),
        ]);
        const after = await service.get(org, s.id);
        expect(after.status).toBe("CANCELLED");
        const invoices = await invoicesOf(s.id);
        // Either the renewal ran first (two) or the cancel did (one) — never
        // an invoice for a period that starts after the cancel.
        for (const inv of invoices) {
            expect(inv.periodStart!.getTime()).toBeLessThanOrEqual(
                new Date(after.cancelledAt!).getTime(),
            );
        }
    });

    it("sends no renewal invoices to a business with Payments switched off", async () => {
        const off = await makeOrg("payments-off");
        const c = await prisma.contact.create({
            data: {
                organizationId: off.organizationId,
                email: "b@example.com",
            },
        });
        const p = await service.createPlan(off, {
            name: "Weekly",
            price: "300",
            currency: "INR",
            interval: "WEEK",
        });
        const s = await service.subscribe(off, {
            contactId: c.id,
            planId: p.id,
        });
        await prisma.organizationModule.create({
            data: {
                organizationId: off.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        await makeDue(s.id);

        await handler.renewDue(new Date());
        expect(await invoicesOf(s.id)).toHaveLength(1);
    });

    it("lets one of two subscribes at the same moment through", async () => {
        const results = await Promise.allSettled([
            service.subscribe(org, { contactId, planId }),
            service.subscribe(org, { contactId, planId }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find(
            (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(String(refused.reason)).toMatch(/already on Monthly/);
        expect(
            await prisma.customerSubscription.count({
                where: { contactId, planId },
            }),
        ).toBe(1);
    });

    it("keeps one pending renewal run, however many times it is scheduled", async () => {
        await Promise.all([
            handler.schedule(new Date()),
            handler.schedule(new Date()),
            handler.schedule(new Date()),
        ]);
        expect(
            await prisma.job.count({
                where: { type: SUBSCRIPTION_RENEW_TYPE, status: "PENDING" },
            }),
        ).toBe(1);
    });
});

// — U7: collections, skips and a booked plan change ————————————————————

const DAY_MS = 86_400_000;

/** UTC midnight today plus `days` (the subscriptions here run in UTC). */
function utcDay(days: number): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return new Date(d.getTime() + days * DAY_MS);
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Luxon's ISO weekday of a UTC date: 1 Monday … 7 Sunday. */
const isoWeekday = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;

describe("collections, skips and plan changes (real database)", () => {
    let weeklyPlanId: string;
    let otherPlanId: string;

    beforeAll(async () => {
        weeklyPlanId = (
            await service.createPlan(org, {
                name: "Bread box",
                price: "300",
                currency: "INR",
                interval: "WEEK",
            })
        ).id;
        otherPlanId = (
            await service.createPlan(org, {
                name: "Bread box plus",
                price: "450",
                currency: "INR",
                interval: "MONTH",
            })
        ).id;
    });

    /**
     * A weekly box whose last period ended at today's UTC midnight, so the
     * one now due runs today → today + 7, collected two days from now.
     */
    async function dueWeeklyBox(): Promise<{ id: string; collection: string }> {
        const collectOn = utcDay(2);
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId: weeklyPlanId,
            timezone: "UTC",
            collectionWeekday: isoWeekday(collectOn),
        });
        const start = utcDay(-7);
        await prisma.customerSubscription.update({
            where: { id: s.id },
            data: {
                anchorAt: start,
                currentPeriodStart: start,
                currentPeriodEnd: utcDay(0),
            },
        });
        // Its sign-up invoice becomes the last period's.
        await prisma.invoice.updateMany({
            where: { subscriptionId: s.id },
            data: { periodStart: start, periodEnd: utcDay(0) },
        });
        return { id: s.id, collection: ymd(collectOn) };
    }

    it("advances a period whose only collection is skipped without an invoice, and Undo bills it", async () => {
        const { id, collection } = await dueWeeklyBox();
        const skipped = await service.skipCollection(org, id, {
            date: collection,
        });
        expect(
            skipped.collection!.upcoming.find((c) => c.date === collection),
        ).toMatchObject({ skipped: true });

        const now = new Date();
        await expect(service.renewOne(id, now)).resolves.toBe("uncharged");
        // Idempotent: a second run is not due, and the job adds nothing.
        await expect(service.renewOne(id, now)).resolves.toBe("skipped");
        await handler.renewDue(now);
        expect(await invoicesOf(id)).toHaveLength(1);

        await service.unskipCollection(org, id, collection);
        const invoices = await invoicesOf(id);
        expect(invoices).toHaveLength(2);
        expect(invoices[1]!.periodStart).toEqual(utcDay(0));
    });

    it("bills a period its skips left uncharged, once, when the collection day moves", async () => {
        const { id, collection } = await dueWeeklyBox();
        await service.skipCollection(org, id, { date: collection });
        await expect(service.renewOne(id, new Date())).resolves.toBe(
            "uncharged",
        );
        expect(await invoicesOf(id)).toHaveLength(1);

        // Three days out: a day of this period the skip does not cover.
        const moved = isoWeekday(utcDay(3));
        await service.setCollection(org, id, { weekday: moved });
        const invoices = await invoicesOf(id);
        expect(invoices).toHaveLength(2);
        expect(invoices[1]!.periodStart).toEqual(utcDay(0));

        // Moving it again finds the period invoiced and adds nothing.
        await service.setCollection(org, id, {
            weekday: isoWeekday(utcDay(4)),
        });
        expect(await invoicesOf(id)).toHaveLength(2);
    });

    it("refuses a past collection and one already skipped, even at once", async () => {
        const { id, collection } = await dueWeeklyBox();
        await expect(
            service.skipCollection(org, id, { date: ymd(utcDay(-5)) }),
        ).rejects.toThrow();
        const results = await Promise.allSettled([
            service.skipCollection(org, id, { date: collection }),
            service.skipCollection(org, id, { date: collection }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(
            await prisma.subscriptionSkip.count({
                where: { subscriptionId: id },
            }),
        ).toBe(1);
    });

    it("keeps a skip through a cancel at period end, which then ends it unbilled", async () => {
        const { id, collection } = await dueWeeklyBox();
        await service.renewOne(id, new Date());
        await service.skipCollection(org, id, { date: collection });
        const ending = await service.cancel(org, id, { when: "periodEnd" });
        // Nothing listed past the day it ends.
        for (const c of ending.collection!.upcoming) {
            expect(c.date < ymd(utcDay(7))).toBe(true);
        }
        const before = (await invoicesOf(id)).length;
        await service.renewOne(id, new Date(Date.now() + 8 * DAY_MS));
        const after = await service.get(org, id);
        expect(after.status).toBe("CANCELLED");
        expect(await invoicesOf(id)).toHaveLength(before);
    });

    it("applies a plan change booked before a pause when the resume starts a new period", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId: weeklyPlanId,
        });
        const booked = await service.changePlan(org, s.id, {
            planId: otherPlanId,
        });
        expect(booked.pendingPlan?.id).toBe(otherPlanId);
        await service.pause(org, s.id);
        // The pause outlasts the paid week.
        await prisma.customerSubscription.update({
            where: { id: s.id },
            data: {
                pausedAt: utcDay(-20),
                anchorAt: utcDay(-21),
                currentPeriodStart: utcDay(-21),
                currentPeriodEnd: utcDay(-14),
            },
        });
        // Its sign-up invoice becomes that paid week's, or it would still
        // claim a period starting today — the one the resume starts.
        await prisma.invoice.updateMany({
            where: { subscriptionId: s.id },
            data: { periodStart: utcDay(-21), periodEnd: utcDay(-14) },
        });
        const resumed = await service.resume(org, s.id);
        expect(resumed).toMatchObject({
            plan: { id: otherPlanId },
            price: "450.00",
            interval: "MONTH",
            pendingPlan: null,
        });
        const invoices = await invoicesOf(s.id);
        expect(invoices[invoices.length - 1]!.total.toString()).toBe("450");
    });

    it("applies a booked change exactly once, however concurrently the renewal runs", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId: weeklyPlanId,
        });
        await service.changePlan(org, s.id, { planId: otherPlanId });
        await makeDue(s.id);
        const now = new Date();
        const outcomes = await Promise.all([
            service.renewOne(s.id, now),
            service.renewOne(s.id, now),
        ]);
        expect(outcomes.filter((o) => o === "renewed")).toHaveLength(1);
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: s.id },
        });
        expect(row.planId).toBe(otherPlanId);
        expect(row.pendingPlanId).toBeNull();
        await handler.renewDue(now);
        expect(await invoicesOf(s.id)).toHaveLength(2);
    });

    it("refuses a change to an archived plan", async () => {
        const archived = await service.createPlan(org, {
            name: "Old box",
            price: "250",
            currency: "INR",
            interval: "WEEK",
        });
        await service.setPlanStatus(org, archived.id, "ARCHIVED");
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId: weeklyPlanId,
        });
        await expect(
            service.changePlan(org, s.id, { planId: archived.id }),
        ).rejects.toThrow(/archived/);
    });
});

describe("a plan's figures and name (D1, real database)", () => {
    const MONTHLY = {
        name: "Monthly",
        price: "1200",
        currency: "INR",
        interval: "MONTH" as const,
    };

    async function peopleIn(
        ctx: OrganizationContext,
        n: number,
        tag: string,
    ): Promise<string[]> {
        const ids: string[] = [];
        for (let i = 0; i < n; i += 1) {
            const c = await prisma.contact.create({
                data: {
                    organizationId: ctx.organizationId,
                    email: `${tag}-${i}@example.com`,
                },
            });
            ids.push(c.id);
        }
        return ids;
    }

    it("lists who pays what from one grouped read: 12 at ₹1,500 and 3 at the older ₹1,200", async () => {
        const gym = await makeOrg("plans-by-price");
        const plan = await service.createPlan(gym, {
            ...MONTHLY,
            classesPerMonth: 8,
        });
        for (const contactId of await peopleIn(gym, 3, "older")) {
            await service.subscribe(gym, { contactId, planId: plan.id });
        }
        await service.updatePlan(gym, plan.id, { price: "1500" });
        const newer = await peopleIn(gym, 12, "newer");
        for (const contactId of newer) {
            await service.subscribe(gym, { contactId, planId: plan.id });
        }
        // A cancelled member is not on it; a paused one still is.
        const gone = await service.subscribe(gym, {
            contactId: (await peopleIn(gym, 1, "gone"))[0]!,
            planId: plan.id,
        });
        await service.cancel(gym, gone.id, { when: "now" });
        const [paused] = await prisma.customerSubscription.findMany({
            where: { contactId: newer[0] },
        });
        await service.pause(gym, paused!.id);

        const read = await service.getPlan(gym, plan.id);
        expect(read.classesPerMonth).toBe(8);
        expect(read.subscriberCount).toBe(15);
        expect(read.monthly).toBe("1500.00");
        expect(read.byPrice).toEqual([
            {
                price: "1500.00",
                currency: "INR",
                interval: "MONTH",
                count: 12,
                current: true,
            },
            {
                price: "1200.00",
                currency: "INR",
                interval: "MONTH",
                count: 3,
                current: false,
            },
        ]);
        // 11 running at ₹1,500 and 3 at ₹1,200; the paused one brings nothing.
        expect(read.monthlyFromMembers).toBe("20100.00");
        const [listed] = await service.listPlans(gym, {});
        expect(listed).toEqual(read);
    });

    it("says a yearly and a weekly plan as a month's worth", async () => {
        const shop = await makeOrg("plans-monthly");
        const yearly = await service.createPlan(shop, {
            ...MONTHLY,
            name: "Annual",
            price: "12000",
            interval: "YEAR",
        });
        const weekly = await service.createPlan(shop, {
            ...MONTHLY,
            name: "Weekly",
            price: "350",
            interval: "WEEK",
        });
        expect(yearly.monthly).toBe("1000.00");
        expect(weekly.monthly).toBe("1516.67");
        expect(weekly.classesPerMonth).toBeNull();
    });

    it("refuses 'Monthly' beside a live 'monthly', and frees the name once archived", async () => {
        const studio = await makeOrg("plans-names");
        const first = await service.createPlan(studio, {
            ...MONTHLY,
            name: "monthly",
        });
        await expect(service.createPlan(studio, MONTHLY)).rejects.toMatchObject(
            {
                status: 409,
                response: { details: { field: "name", planId: first.id } },
            },
        );

        await service.setPlanStatus(studio, first.id, "ARCHIVED");
        const second = await service.createPlan(studio, MONTHLY);
        expect(second.name).toBe("Monthly");

        // The archived one can't be sold again while its name is taken…
        await expect(
            service.setPlanStatus(studio, first.id, "ACTIVE"),
        ).rejects.toMatchObject({ status: 409 });
        // …nor can a live plan be renamed onto it.
        const other = await service.createPlan(studio, {
            ...MONTHLY,
            name: "Annual",
        });
        await expect(
            service.updatePlan(studio, other.id, { name: "MONTHLY" }),
        ).rejects.toMatchObject({ status: 409 });
        // A plan keeps its own name, in any case.
        const renamed = await service.updatePlan(studio, other.id, {
            name: "annual",
        });
        expect(renamed.name).toBe("annual");
    });

    it("lets one of three same-named creates at once through", async () => {
        const rush = await makeOrg("plans-race");
        const outcomes = await Promise.allSettled([
            service.createPlan(rush, { ...MONTHLY, name: "Drop-in" }),
            service.createPlan(rush, { ...MONTHLY, name: "drop-in" }),
            service.createPlan(rush, { ...MONTHLY, name: "DROP-IN" }),
        ]);
        expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(
            1,
        );
        expect(
            await prisma.subscriptionPlan.count({
                where: { organizationId: rush.organizationId },
            }),
        ).toBe(1);
    });

    it("keeps names per business, and answers another business's plan with a 404", async () => {
        const a = await makeOrg("plans-a");
        const b = await makeOrg("plans-b");
        const mine = await service.createPlan(a, MONTHLY);
        await expect(service.createPlan(b, MONTHLY)).resolves.toBeDefined();
        await expect(service.getPlan(b, mine.id)).rejects.toMatchObject({
            status: 404,
        });
        await expect(
            service.updatePlan(b, mine.id, { classesPerMonth: 4 }),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            service.setPlanStatus(b, mine.id, "ARCHIVED"),
        ).rejects.toMatchObject({ status: 404 });
    });
});

describe("a plan's history (D2, real database)", () => {
    const MONTHLY = {
        name: "Monthly",
        price: "1200",
        currency: "INR",
        interval: "MONTH" as const,
    };

    /** A business run by a named person, so the history can name them. */
    async function namedOrg(slug: string): Promise<OrganizationContext> {
        const ctx = await makeOrg(slug);
        const user = await prisma.user.create({
            data: {
                email: `${slug}-${process.pid}@example.com`,
                name: "Priya",
            },
        });
        return { ...ctx, userId: user.id };
    }

    const rows = (planId: string) =>
        prisma.subscriptionPlanEvent.findMany({
            where: { planId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });

    it("records a price change from ₹1,200 to ₹1,500 as one PRICE_CHANGED, read newest first by name", async () => {
        const gym = await namedOrg("plan-events-price");
        const plan = await service.createPlan(gym, MONTHLY);
        await service.updatePlan(gym, plan.id, { price: "1500" });

        const saved = await rows(plan.id);
        expect(saved.map((e) => e.kind)).toEqual(["CREATED", "PRICE_CHANGED"]);
        expect(saved[1]).toMatchObject({
            organizationId: gym.organizationId,
            actorKind: "TEAM",
            actorUserId: gym.userId,
            changes: { price: ["1200.00", "1500.00"] },
        });

        const page = await service.planEvents(gym, plan.id, {});
        expect(page.events.map((e) => e.kind)).toEqual([
            "PRICE_CHANGED",
            "CREATED",
        ]);
        expect(page.events[0]!.actor).toEqual({
            kind: "TEAM",
            userId: gym.userId,
            name: "Priya",
        });
        expect(page.nextCursor).toBeNull();
        expect(page.earlierUnrecorded).toBe(false);
    });

    it("records nothing for a save that changes nothing", async () => {
        const shop = await namedOrg("plan-events-same");
        const plan = await service.createPlan(shop, MONTHLY);
        await service.updatePlan(shop, plan.id, {
            name: "Monthly",
            price: "1200.00",
            classesPerMonth: null,
        });
        expect((await rows(plan.id)).map((e) => e.kind)).toEqual(["CREATED"]);
    });

    it("records nothing for a save refused for its name, nor for a create refused", async () => {
        const studio = await namedOrg("plan-events-refused");
        await service.createPlan(studio, MONTHLY);
        const other = await service.createPlan(studio, {
            ...MONTHLY,
            name: "Annual",
        });
        await expect(
            service.updatePlan(studio, other.id, {
                name: "monthly",
                price: "999",
            }),
        ).rejects.toMatchObject({ status: 409 });
        await expect(service.createPlan(studio, MONTHLY)).rejects.toMatchObject(
            { status: 409 },
        );
        const all = await prisma.subscriptionPlanEvent.findMany({
            where: { organizationId: studio.organizationId },
        });
        expect(all.map((e) => e.kind)).toEqual(["CREATED", "CREATED"]);
        // The refused save changed nothing either.
        expect((await service.getPlan(studio, other.id)).price).toBe("1200.00");
    });

    it("records an archive and a sale again, and nothing for a repeat", async () => {
        const shop = await namedOrg("plan-events-archive");
        const plan = await service.createPlan(shop, MONTHLY);
        await service.setPlanStatus(shop, plan.id, "ARCHIVED");
        await service.setPlanStatus(shop, plan.id, "ARCHIVED");
        await service.setPlanStatus(shop, plan.id, "ACTIVE");
        const saved = await rows(plan.id);
        expect(saved.map((e) => [e.kind, e.changes])).toEqual([
            ["CREATED", expect.anything()],
            ["ARCHIVED", { status: ["ACTIVE", "ARCHIVED"] }],
            ["RESTORED", { status: ["ARCHIVED", "ACTIVE"] }],
        ]);
    });

    it("chains the before and after of two changes made at once", async () => {
        const rush = await namedOrg("plan-events-race");
        const plan = await service.createPlan(rush, MONTHLY);
        await Promise.all([
            service.updatePlan(rush, plan.id, { price: "1300" }),
            service.updatePlan(rush, plan.id, { price: "1400" }),
        ]);
        const changes = (await rows(plan.id))
            .filter((e) => e.kind === "PRICE_CHANGED")
            .map((e) => (e.changes as { price: [string, string] }).price);
        expect(changes).toHaveLength(2);
        // Whichever ran second saw what the first saved.
        expect(changes[0]![0]).toBe("1200.00");
        expect(changes[1]![0]).toBe(changes[0]![1]);
        expect((await service.getPlan(rush, plan.id)).price).toBe(
            changes[1]![1],
        );
    });

    it("pages the history by the last event read", async () => {
        const shop = await namedOrg("plan-events-pages");
        const plan = await service.createPlan(shop, MONTHLY);
        for (const price of ["1300", "1400", "1500", "1600"]) {
            await service.updatePlan(shop, plan.id, { price });
        }
        const first = await service.planEvents(shop, plan.id, { limit: 2 });
        const second = await service.planEvents(shop, plan.id, {
            limit: 2,
            cursor: first.nextCursor!,
        });
        const third = await service.planEvents(shop, plan.id, {
            limit: 2,
            cursor: second.nextCursor!,
        });
        const afters = [...first.events, ...second.events, ...third.events].map(
            (e) => e.changes.price?.[1],
        );
        expect(afters).toEqual([
            "1600.00",
            "1500.00",
            "1400.00",
            "1300.00",
            "1200.00",
        ]);
        expect(third.nextCursor).toBeNull();
    });

    it("says earlier changes weren't recorded for a plan made before the history", async () => {
        const shop = await namedOrg("plan-events-older");
        const older = await prisma.subscriptionPlan.create({
            data: {
                organizationId: shop.organizationId,
                name: "Loaf a week",
                price: "1800",
                currency: "INR",
                interval: "MONTH",
            },
        });
        expect(await service.planEvents(shop, older.id, {})).toEqual({
            events: [],
            nextCursor: null,
            earlierUnrecorded: true,
        });
        await service.updatePlan(shop, older.id, { classesPerMonth: 4 });
        const page = await service.planEvents(shop, older.id, {});
        expect(page.events.map((e) => e.kind)).toEqual(["CLASSES_CHANGED"]);
        expect(page.earlierUnrecorded).toBe(true);
    });

    it("answers another business's plan's history with a 404, and refuses its events as a cursor", async () => {
        const a = await namedOrg("plan-events-a");
        const b = await namedOrg("plan-events-b");
        const mine = await service.createPlan(a, MONTHLY);
        const theirs = await service.createPlan(b, MONTHLY);
        await expect(service.planEvents(b, mine.id, {})).rejects.toMatchObject({
            status: 404,
        });
        const [mineEvent] = await rows(mine.id);
        await expect(
            service.planEvents(b, theirs.id, { cursor: mineEvent!.id }),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses an event naming another business's plan", async () => {
        const a = await namedOrg("plan-events-fk-a");
        const b = await namedOrg("plan-events-fk-b");
        const mine = await service.createPlan(a, MONTHLY);
        await expect(
            prisma.subscriptionPlanEvent.create({
                data: {
                    organizationId: b.organizationId,
                    planId: mine.id,
                    kind: "RENAMED",
                    actorKind: "TEAM",
                },
            }),
        ).rejects.toThrow();
    });
});

describe("a pause with an end date (D8, real database)", () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    const eventsOf = (subscriptionId: string, kind?: string) =>
        prisma.subscriptionEvent.findMany({
            where: { subscriptionId, ...(kind ? { kind } : {}) },
            orderBy: { createdAt: "asc" },
        });

    /** A monthly member, paid from today for a month, paused for `weeks`. */
    async function pausedFor(
        ctx: OrganizationContext,
        plan: string,
        weeks: 2 | 4 | 8,
    ) {
        const s = await service.subscribe(ctx, {
            contactId: (
                await prisma.contact.create({
                    data: {
                        organizationId: ctx.organizationId,
                        email: `paused-${people++}@example.com`,
                    },
                })
            ).id,
            planId: plan,
            timezone: "UTC",
        });
        const paused = await service.pause(ctx, s.id, { weeks });
        return { before: s, paused, until: new Date(paused.pausedUntil!) };
    }

    it("resumes a 4-week pause on its date, 28 days later, once however often the job runs", async () => {
        const { before, paused, until } = await pausedFor(org, planId, 4);
        expect(paused.status).toBe("PAUSED");
        // The start of the day four weeks on, in its zone (UTC).
        const today = new Date(new Date().toISOString().slice(0, 10));
        expect(until).toEqual(new Date(today.getTime() + 28 * DAY));

        // The day before, nothing happens.
        await handler.renewDue(new Date(until.getTime() - HOUR));
        expect((await service.get(org, before.id)).status).toBe("PAUSED");

        // On the day: two deliveries at once, then the run again.
        const on = new Date(until.getTime() + HOUR);
        const outcomes = await Promise.all([
            service.renewOne(before.id, on),
            service.renewOne(before.id, on),
        ]);
        expect(outcomes.sort()).toEqual(["resumed", "skipped"]);
        await handler.renewDue(on);

        const after = await service.get(org, before.id);
        expect(after).toMatchObject({
            status: "ACTIVE",
            pausedAt: null,
            pausedUntil: null,
        });
        expect(
            new Date(after.currentPeriodEnd).getTime() -
                new Date(before.currentPeriodEnd).getTime(),
        ).toBe(28 * DAY);
        // Still covered by its first invoice.
        expect(await invoicesOf(before.id)).toHaveLength(1);
        const resumed = await eventsOf(before.id, "RESUMED");
        expect(resumed).toHaveLength(1);
        expect(resumed[0]).toMatchObject({
            actorKind: "JOB",
            actorUserId: null,
            data: { extendedDays: 28 },
        });
        expect((await eventsOf(before.id, "PAUSED"))[0]!.data).toEqual({
            until: until.toISOString(),
        });
    });

    it("issues the next invoice when an 8-week pause outlasts the paid month", async () => {
        const { before, until } = await pausedFor(org, planId, 8);
        expect(until > new Date(before.currentPeriodEnd)).toBe(true);

        await handler.renewDue(new Date(until.getTime() + HOUR));

        const after = await service.get(org, before.id);
        expect(after.status).toBe("ACTIVE");
        expect(new Date(after.currentPeriodStart)).toEqual(until);
        const invoices = await invoicesOf(before.id);
        expect(invoices).toHaveLength(2);
        expect(invoices[1]!.periodStart).toEqual(until);
        expect(await eventsOf(before.id, "RESUMED")).toEqual([
            expect.objectContaining({
                actorKind: "JOB",
                invoiceId: invoices[1]!.id,
                data: { restarted: true },
            }),
        ]);
    });

    it("clears the date on a resume by hand, and leaves the job nothing to resume", async () => {
        const { before, until } = await pausedFor(org, planId, 2);
        const resumed = await service.resume(org, before.id);
        expect(resumed.pausedUntil).toBeNull();
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: before.id },
        });
        expect(row.pausedUntil).toBeNull();

        await expect(
            service.renewOne(before.id, new Date(until.getTime() + HOUR)),
        ).resolves.toBe("skipped");
        expect(
            (await eventsOf(before.id, "RESUMED")).map((e) => e.actorKind),
        ).toEqual(["TEAM"]);
    });

    it("keeps it paused with Payments off, says so once, raises it on Home, and resumes once Payments is back", async () => {
        const off = await makeOrg("pause-payments-off");
        const monthly = await service.createPlan(off, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        });
        const { before, until } = await pausedFor(off, monthly.id, 8);
        const module = await prisma.organizationModule.create({
            data: {
                organizationId: off.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        const on = new Date(until.getTime() + HOUR);

        await handler.renewDue(on);
        await handler.renewDue(new Date(on.getTime() + HOUR));

        expect((await service.get(off, before.id)).status).toBe("PAUSED");
        expect(await invoicesOf(before.id)).toHaveLength(1);
        const refused = await eventsOf(before.id, "RESUME_REFUSED");
        expect(refused).toHaveLength(1);
        expect(refused[0]).toMatchObject({
            actorKind: "JOB",
            data: { until: until.toISOString(), reason: "PAYMENTS_OFF" },
        });
        const home = await pausesWaitingOnPayments(
            prisma,
            off.organizationId,
            on,
        );
        expect(home).toMatchObject({
            code: "PAYMENTS_PAUSES_WAITING",
            count: 1,
        });
        expect(home?.evidence?.[0]?.id).toBe(before.id);
        // Another business's pauses aren't its.
        expect(
            await pausesWaitingOnPayments(prisma, org.organizationId, on),
        ).toBeNull();

        await prisma.organizationModule.update({
            where: { id: module.id },
            data: { status: "ENABLED" },
        });
        await handler.renewDue(new Date(on.getTime() + 2 * HOUR));
        expect((await service.get(off, before.id)).status).toBe("ACTIVE");
        expect(await invoicesOf(before.id)).toHaveLength(2);
        expect(await eventsOf(before.id, "RESUMED")).toHaveLength(1);
        expect(
            await pausesWaitingOnPayments(prisma, off.organizationId, on),
        ).toBeNull();
    });
});

describe("the job and pauses it has to decide from dates (review S-3, S-4)", () => {
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    it("extends a pause that ended inside the period, though the job only runs after the period's end", async () => {
        const s = await service.subscribe(org, {
            contactId: await person(),
            planId,
            timezone: "UTC",
        });
        const paused = await service.pause(org, s.id, { weeks: 4 });
        const until = new Date(paused.pausedUntil!);
        const periodEnd = new Date(s.currentPeriodEnd);
        expect(until <= periodEnd).toBe(true);

        // The job was down: it gets there a day after the period ended.
        await handler.renewDue(new Date(periodEnd.getTime() + DAY));

        const after = await service.get(org, s.id);
        expect(after.status).toBe("ACTIVE");
        expect(
            new Date(after.currentPeriodEnd).getTime() - periodEnd.getTime(),
        ).toBe(28 * DAY);
        // Still covered by the first invoice: no restart.
        expect(await invoicesOf(s.id)).toHaveLength(1);
    });

    it("doesn't let pauses already refused for Payments pin the batch ahead of a due renewal", async () => {
        const off = await makeOrg("parked-pauses");
        await prisma.organizationModule.create({
            data: {
                organizationId: off.organizationId,
                moduleKey: "PAYMENTS",
                status: "DISABLED",
            },
        });
        const plan = await service.createPlan(off, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        });
        const now = new Date();
        const count = RENEW_BATCH + 5;
        const contacts = await prisma.contact.createManyAndReturn({
            data: Array.from({ length: count }, (_, i) => ({
                organizationId: off.organizationId,
                email: `parked-${i}@example.com`,
            })),
            select: { id: true },
        });
        // Paid to 30 days ago, paused to yesterday: each would restart
        // billing, and each was refused already. Their periods ended
        // before the due renewal's, so they sort ahead of it.
        const parked = await prisma.customerSubscription.createManyAndReturn({
            data: contacts.map((c) => ({
                organizationId: off.organizationId,
                planId: plan.id,
                contactId: c.id,
                status: "PAUSED",
                price: "1200",
                currency: "INR",
                interval: "MONTH",
                timezone: "UTC",
                anchorAt: new Date(now.getTime() - 60 * DAY),
                currentPeriodStart: new Date(now.getTime() - 60 * DAY),
                currentPeriodEnd: new Date(now.getTime() - 30 * DAY),
                pausedAt: new Date(now.getTime() - 45 * DAY),
                pausedUntil: new Date(now.getTime() - DAY),
            })),
            select: { id: true },
        });
        await prisma.subscriptionEvent.createMany({
            data: parked.map((p) => ({
                organizationId: off.organizationId,
                subscriptionId: p.id,
                kind: "RESUME_REFUSED",
                actorKind: "JOB",
                data: { reason: "PAYMENTS_OFF" },
            })),
        });

        const due = await service.subscribe(org, {
            contactId: await person(),
            planId,
        });
        await makeDue(due.id);

        const renewOne = jest.spyOn(service, "renewOne");
        try {
            // Nothing left waiting: the next run is the usual hour away.
            await expect(handler.renewDue(now)).resolves.toBe(false);
            const asked = new Set(renewOne.mock.calls.map((c) => c[0]));
            expect(asked.has(due.id)).toBe(true);
            expect(parked.some((p) => asked.has(p.id))).toBe(false);
        } finally {
            renewOne.mockRestore();
        }
        expect(await invoicesOf(due.id)).toHaveLength(2);
        // Still one refusal each: nothing was written twice.
        expect(
            await prisma.subscriptionEvent.count({
                where: {
                    organizationId: off.organizationId,
                    kind: "RESUME_REFUSED",
                },
            }),
        ).toBe(count);
    });
});

describe("retrying a failed charge (review S-5, real database)", () => {
    it("makes the pay link and records RETRIED together, and neither when the link is refused", async () => {
        const shop = await makeOrg("retry-charge");
        const plan = await service.createPlan(shop, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        });
        const s = await service.subscribe(shop, {
            contactId: (
                await prisma.contact.create({
                    data: {
                        organizationId: shop.organizationId,
                        email: "retry@example.com",
                    },
                })
            ).id,
            planId: plan.id,
        });
        await prisma.invoice.updateMany({
            where: { subscriptionId: s.id },
            data: { dueAt: new Date(Date.now() - 86_400_000) },
        });
        const retried = () =>
            prisma.subscriptionEvent.count({
                where: { subscriptionId: s.id, kind: "RETRIED" },
            });
        const tokenHash = async () =>
            (
                await prisma.invoice.findFirstOrThrow({
                    where: { subscriptionId: s.id },
                })
            ).payTokenHash;

        // No provider connected: the link is refused, and nothing is said.
        await expect(service.retryPayment(shop, s.id)).rejects.toThrow(
            "Connect a payment provider",
        );
        expect(await retried()).toBe(0);
        expect(await tokenHash()).toBeNull();

        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: shop.organizationId,
                provider: "RAZORPAY",
                // A pay link needs one that opens checkout (B11, D22).
                publicKey: "rzp_test_Retry1",
                encryptedCredentials: "x",
                credentialsIv: "x",
                credentialsAuthTag: "x",
            },
        });
        const { invoiceId, token } = await service.retryPayment(shop, s.id);
        expect(token).toBeTruthy();
        expect(await tokenHash()).not.toBeNull();
        const events = await prisma.subscriptionEvent.findMany({
            where: { subscriptionId: s.id, kind: "RETRIED" },
        });
        expect(events).toEqual([expect.objectContaining({ invoiceId })]);
    });
});
