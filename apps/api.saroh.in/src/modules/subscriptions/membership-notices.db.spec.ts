/**
 * Membership emails (DEC-174 U11, #1142) against a real Postgres: joining,
 * pausing, resuming, a plan change booked and taking effect, a cancel and
 * Keep, each queued with its SubscriptionEvent and emailed to the
 * member's own address through the business's own provider. A workspace
 * change with an Undo is held, and the Undo (the inverse action) takes it
 * back unsent; a member's own change from their account is told at once;
 * the Membership emails switch off queues nothing and still writes the
 * history. Runs in the integration project, plain and with TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        ...jest.requireActual<typeof import("../../env")>("../../env").env,
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { dayWords } from "../../common/words-format";
import { CommunicationsService } from "../communications/communications.service";
import { InvoicesService } from "../invoices/invoices.service";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);

const HOUR = 3_600_000;
let seq = 0;

interface Business {
    owner: OrganizationContext;
    contactId: string;
    planId: string;
}

async function business(): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye Studio", slug: `u11-${process.pid}-${seq}` },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: "user_1",
        role: "OWNER",
    };
    const contact = await prisma.contact.create({
        data: {
            organizationId: org.id,
            email: "asha@example.com",
            firstName: "Asha",
        },
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
    const plan = await service.createPlan(owner, {
        name: "Monthly",
        price: "1200",
        currency: "INR",
        interval: "MONTH",
        classesPerMonth: 8,
    });
    return { owner, contactId: contact.id, planId: plan.id };
}

async function joined(b: Business) {
    const sub = await service.subscribe(b.owner, {
        contactId: b.contactId,
        planId: b.planId,
        timezone: "UTC",
    });
    // The member's welcome, told and done, as the worker would.
    await tell(await waiting(b));
    return sub;
}

/** The membership notices still waiting to go, oldest first. */
async function waiting(b: Business): Promise<Job[]> {
    return prisma.job.findMany({
        where: {
            organizationId: b.owner.organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
        },
        orderBy: { createdAt: "asc" },
    });
}

/** Run each, as the worker does after its hold, and mark it done. */
async function tell(jobs: Job[]): Promise<void> {
    for (const job of jobs) {
        await customerNotify.handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
    }
}

/** The emails queued to the member, oldest first. */
async function emails(b: Business) {
    return prisma.message.findMany({
        where: { organizationId: b.owner.organizationId },
        orderBy: { createdAt: "asc" },
        select: { template: true, toAddress: true, subject: true, body: true },
    });
}

async function eventsOf(subscriptionId: string): Promise<string[]> {
    const rows = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: "asc" },
        select: { kind: true },
    });
    return rows.map((r) => r.kind);
}

const kindOf = (job: Job) => (job.payload as { kind: string }).kind;

describe("membership emails (real database)", () => {
    it("joining emails the plan, the price and the next renewal date, at once", async () => {
        const b = await business();
        const before = Date.now();
        const sub = await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "UTC",
        });

        const [job] = await waiting(b);
        expect(job.payload).toMatchObject({
            kind: "MEMBERSHIP_JOINED",
            subscriptionId: sub.id,
        });
        // Nothing to undo: it isn't held.
        expect(job.runAt.getTime() - before).toBeLessThan(5_000);

        await tell([job]);
        const [email] = await emails(b);
        expect(email).toMatchObject({
            template: "MEMBERSHIP_JOINED",
            toAddress: "asha@example.com",
            subject: "Welcome to Monthly at Rye Studio",
        });
        const renews = dayWords(new Date(sub.currentPeriodEnd), "UTC", {
            year: true,
        });
        expect(email.body).toContain(
            `You&#39;ve joined Monthly, at ₹1,200 a month. It renews next on ${renews}. It includes 8 classes a month.`,
        );
    });

    it("a pause from the workspace waits; its Undo sends nothing", async () => {
        const b = await business();
        const sub = await joined(b);
        const before = Date.now();
        await service.pause(b.owner, sub.id, { weeks: 4 });

        const [held] = await waiting(b);
        expect(kindOf(held)).toBe("MEMBERSHIP_PAUSED");
        expect(held.runAt.getTime() - before).toBeGreaterThanOrEqual(9_000);

        // Undo is the resume.
        await service.resume(b.owner, sub.id);
        expect(await waiting(b)).toHaveLength(0);
        expect(await emails(b)).toHaveLength(1);
        // The history keeps both.
        expect(await eventsOf(sub.id)).toEqual([
            "SUBSCRIBED",
            "PAUSED",
            "RESUMED",
        ]);
    });

    it("a pause left alone is told: no charges until its date, classes on hold", async () => {
        const b = await business();
        const sub = await joined(b);
        const paused = await service.pause(b.owner, sub.id, { weeks: 4 });
        await tell(await waiting(b));

        const until = dayWords(new Date(paused.pausedUntil!), "UTC", {
            year: true,
        });
        const email = (await emails(b))[1];
        expect(email.template).toBe("MEMBERSHIP_PAUSED");
        expect(email.body).toContain(
            `No charges until ${until}; your classes are on hold.`,
        );
    });

    it("a pause that ends on its date sends the resumed email", async () => {
        const b = await business();
        const sub = await joined(b);
        const paused = await service.pause(b.owner, sub.id, { weeks: 4 });
        await tell(await waiting(b));

        const until = new Date(paused.pausedUntil!);
        expect(
            await service.renewOne(sub.id, new Date(until.getTime() + HOUR)),
        ).toBe("resumed");
        const [job] = await waiting(b);
        expect(kindOf(job)).toBe("MEMBERSHIP_RESUMED");
        // The job has no Undo: not held.
        expect(job.runAt.getTime()).toBeLessThanOrEqual(Date.now());

        await tell([job]);
        const email = (await emails(b))[2];
        expect(email.template).toBe("MEMBERSHIP_RESUMED");
        expect(email.body).toContain("has started again");
    });

    it("a member's own pause from their account is told at once", async () => {
        const b = await business();
        const sub = await joined(b);
        await service.pauseForCustomer(
            {
                organizationId: b.owner.organizationId,
                contactId: b.contactId,
                accountId: "acct_1",
            },
            sub.id,
            2,
        );
        const [job] = await waiting(b);
        expect(kindOf(job)).toBe("MEMBERSHIP_PAUSED");
        expect(job.runAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("a plan change booked says from when; it is told again when it applies", async () => {
        const b = await business();
        const quarterly = await service.createPlan(b.owner, {
            name: "Quarterly",
            price: "3000",
            currency: "INR",
            interval: "QUARTER",
        });
        const sub = await joined(b);
        await service.changePlan(b.owner, sub.id, { planId: quarterly.id });
        await tell(await waiting(b));

        const from = dayWords(new Date(sub.currentPeriodEnd), "UTC", {
            year: true,
        });
        expect((await emails(b))[1].body).toContain(
            `From ${from}, your membership moves from Monthly to Quarterly, at ₹3,000 every 3 months. Nothing changes until then.`,
        );

        // The renewal takes it.
        const start = new Date(Date.now() - 40 * 86_400_000);
        await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: {
                anchorAt: start,
                currentPeriodStart: start,
                currentPeriodEnd: new Date(Date.now() - 86_400_000),
            },
        });
        expect(await service.renewOne(sub.id, new Date())).toBe("renewed");
        const [applied] = await waiting(b);
        expect(kindOf(applied)).toBe("MEMBERSHIP_PLAN_CHANGED");
        await tell([applied]);
        expect((await emails(b))[2].body).toContain(
            "Your membership has moved from Monthly to Quarterly, at ₹3,000 every 3 months.",
        );
    });

    it("a booked plan change taken back with Undo sends nothing", async () => {
        const b = await business();
        const other = await service.createPlan(b.owner, {
            name: "Weekly",
            price: "300",
            currency: "INR",
            interval: "WEEK",
        });
        const sub = await joined(b);
        await service.changePlan(b.owner, sub.id, { planId: other.id });
        await service.cancelPlanChange(b.owner, sub.id);
        expect(await waiting(b)).toHaveLength(0);
        expect(await emails(b)).toHaveLength(1);
    });

    it("a cancel at the period end says they keep their classes until the day; Keep says it carries on", async () => {
        const b = await business();
        const sub = await joined(b);
        await service.cancel(b.owner, sub.id, { when: "periodEnd" });
        const [held] = await waiting(b);
        expect(kindOf(held)).toBe("MEMBERSHIP_CANCELLED");
        await tell([held]);
        const ends = dayWords(new Date(sub.currentPeriodEnd), "UTC", {
            year: true,
        });
        expect((await emails(b))[1].body).toContain(
            `You keep your classes until ${ends}, and nothing more will be charged.`,
        );

        // Kept after they were told: they are told it carries on.
        await service.keep(b.owner, sub.id);
        const [kept] = await waiting(b);
        expect(kindOf(kept)).toBe("MEMBERSHIP_KEPT");
        await tell([kept]);
        const email = (await emails(b))[2];
        expect(email.template).toBe("MEMBERSHIP_KEPT");
        expect(email.body).toContain("carries on");
    });

    it("a cancel taken back with Keep before it went sends nothing", async () => {
        const b = await business();
        const sub = await joined(b);
        await service.cancel(b.owner, sub.id, { when: "periodEnd" });
        await service.keep(b.owner, sub.id);
        expect(await waiting(b)).toHaveLength(0);
        expect(await emails(b)).toHaveLength(1);
    });

    it("a cancel today says it has ended and nothing more is charged", async () => {
        const b = await business();
        const sub = await joined(b);
        await service.cancel(b.owner, sub.id, { when: "now" });
        await tell(await waiting(b));
        expect((await emails(b))[1].body).toContain(
            "Your Monthly membership is cancelled and has ended today. Nothing more will be charged.",
        );
    });

    it("a change undone some other way before the notice runs tells nobody", async () => {
        const b = await business();
        const sub = await joined(b);
        await service.pause(b.owner, sub.id, {});
        const jobs = await waiting(b);
        await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: { status: "ACTIVE", pausedAt: null, pausedUntil: null },
        });
        await tell(jobs);
        expect(await emails(b)).toHaveLength(1);
    });

    it("with Membership emails off nothing is queued, and the history is still written", async () => {
        const b = await business();
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "MEMBERSHIP",
                enabled: false,
            },
        });
        const sub = await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "UTC",
        });
        await service.pause(b.owner, sub.id, {});
        await service.resume(b.owner, sub.id);
        await service.cancel(b.owner, sub.id, { when: "now" });

        expect(await waiting(b)).toHaveLength(0);
        expect(await emails(b)).toHaveLength(0);
        expect(await eventsOf(sub.id)).toEqual([
            "SUBSCRIBED",
            "PAUSED",
            "RESUMED",
            "CANCELLED",
        ]);
    });

    it("a notice turned off after it was queued is not sent", async () => {
        const b = await business();
        await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "UTC",
        });
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "MEMBERSHIP",
                enabled: false,
            },
        });
        await tell(await waiting(b));
        expect(await emails(b)).toHaveLength(0);
    });
});
