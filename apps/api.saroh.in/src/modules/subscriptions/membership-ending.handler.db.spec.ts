/**
 * "Your membership ends on ‹date›" a week before, and the team's Members
 * alerts (DEC-174 U19, #1150), against a real Postgres: the daily sweep
 * queues one notice per membership and end date and a second run adds
 * nothing; a membership kept since tells nobody; the switch off queues
 * nothing; the chain keeps one waiting run. A member's own cancel or pause
 * from their account rings the team's bell; the team's own doesn't. Runs
 * in the integration project, plain and with TEST_RLS=on.
 */
jest.mock("../../env", () => ({
    env: {
        ...jest.requireActual<typeof import("../../env")>("../../env").env,
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));
jest.mock("../../common/email", () => ({
    ...jest.requireActual<typeof import("../../common/email")>(
        "../../common/email",
    ),
    sendTeamAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { InvoicesService } from "../invoices/invoices.service";
import {
    TEAM_ALERT_TYPE,
    TeamAlertHandler,
} from "../notifications/team-alert.handler";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import {
    MEMBERSHIP_ENDING_TYPE,
    MembershipEndingHandler,
} from "./membership-ending.handler";
import { SubscriptionsService } from "./subscriptions.service";

const service = new SubscriptionsService(new InvoicesService());
const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const sweeper = new MembershipEndingHandler();
const teamAlerts = new TeamAlertHandler();

const DAY = 24 * 3_600_000;
let seq = 0;

interface Business {
    owner: OrganizationContext;
    contactId: string;
    planId: string;
}

async function business(): Promise<Business> {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: "Rye Studio", slug: `u19-${process.pid}-${seq}` },
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
            lastName: "Rao",
        },
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
    const plan = await service.createPlan(owner, {
        name: "Monthly yoga",
        price: "1200",
        currency: "INR",
        interval: "MONTH",
    });
    return { owner, contactId: contact.id, planId: plan.id };
}

const member = (b: Business) => ({
    organizationId: b.owner.organizationId,
    contactId: b.contactId,
    accountId: "acct_1",
});

/** A member whose membership the team set to end with its period. */
async function ending(b: Business) {
    const sub = await service.subscribe(b.owner, {
        contactId: b.contactId,
        planId: b.planId,
        timezone: "Asia/Kolkata",
    });
    await service.cancel(b.owner, sub.id, { when: "periodEnd" });
    await clearJobs(b);
    const row = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: sub.id },
        select: { id: true, currentPeriodEnd: true },
    });
    return row;
}

/** Done with what joining and cancelling queued, as the worker would be. */
async function clearJobs(b: Business) {
    await prisma.job.updateMany({
        where: { organizationId: b.owner.organizationId, status: "PENDING" },
        data: { status: "DONE" },
    });
}

/** The ending notices waiting to go. */
async function endingJobs(b: Business): Promise<Job[]> {
    return prisma.job.findMany({
        where: {
            organizationId: b.owner.organizationId,
            type: CUSTOMER_NOTIFY_TYPE,
            status: "PENDING",
            payload: { path: ["kind"], equals: "MEMBERSHIP_ENDING" },
        },
    });
}

async function tell(jobs: Job[]) {
    for (const job of jobs) {
        await customerNotify.handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
    }
}

async function emails(b: Business) {
    return prisma.message.findMany({
        where: {
            organizationId: b.owner.organizationId,
            template: "MEMBERSHIP_ENDING",
        },
        select: { subject: true, body: true, toAddress: true },
    });
}

/** Six and a half days before the end: inside the week, in any zone. */
const weekOut = (end: Date) => new Date(end.getTime() - 6.5 * DAY);

describe("a membership ending in 7 days (real database)", () => {
    it("queues one notice, emails the member, and the next day's run adds nothing", async () => {
        const b = await business();
        const sub = await ending(b);
        const now = weekOut(sub.currentPeriodEnd);

        await sweeper.sweep(now);
        // The same day again (a run retried): still one.
        await sweeper.sweep(now);
        const jobs = await endingJobs(b);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].payload).toEqual({
            kind: "MEMBERSHIP_ENDING",
            eventKey: `membership-ending:${sub.id}:${sub.currentPeriodEnd.toISOString()}`,
            subscriptionId: sub.id,
            periodEnd: sub.currentPeriodEnd.toISOString(),
        });

        await tell(jobs);
        const [email] = await emails(b);
        expect(email.toAddress).toBe("asha@example.com");
        expect(email.subject).toMatch(
            /^Your membership at Rye Studio ends on /,
        );
        expect(email.body).toContain("Your Monthly yoga membership ends on");
        expect(email.body).toContain("To keep it, let us know before then.");

        // The next day: told already, nothing more.
        await sweeper.sweep(new Date(now.getTime() + DAY));
        expect(await endingJobs(b)).toHaveLength(0);
        expect(await emails(b)).toHaveLength(1);
    });

    it("kept after it was queued: the run re-reads and says nothing", async () => {
        const b = await business();
        const sub = await ending(b);
        await sweeper.sweep(weekOut(sub.currentPeriodEnd));
        const jobs = await endingJobs(b);
        expect(jobs).toHaveLength(1);

        await service.keep(b.owner, sub.id);
        await tell(jobs);
        expect(await emails(b)).toHaveLength(0);
    });

    it("too early, not set to end, or Membership emails off: nothing", async () => {
        const b = await business();
        const sub = await ending(b);
        // Two weeks out.
        await sweeper.sweep(
            new Date(sub.currentPeriodEnd.getTime() - 14 * DAY),
        );
        expect(await endingJobs(b)).toHaveLength(0);

        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.owner.organizationId,
                kind: "MEMBERSHIP",
                enabled: false,
            },
        });
        await sweeper.sweep(weekOut(sub.currentPeriodEnd));
        expect(await endingJobs(b)).toHaveLength(0);

        const c = await business();
        const carries = await service.subscribe(c.owner, {
            contactId: c.contactId,
            planId: c.planId,
            timezone: "Asia/Kolkata",
        });
        await clearJobs(c);
        await sweeper.sweep(weekOut(new Date(carries.currentPeriodEnd)));
        expect(await endingJobs(c)).toHaveLength(0);
    });
});

describe("the sweep's chain", () => {
    const pending = () =>
        prisma.job.findMany({
            where: { type: MEMBERSHIP_ENDING_TYPE, status: "PENDING" },
        });

    it("keeps one waiting run, restarts a stopped chain, and a run schedules the next", async () => {
        await prisma.job.deleteMany({
            where: { type: MEMBERSHIP_ENDING_TYPE },
        });
        // A chain with nothing waiting is started again.
        await sweeper.ensureScheduled();
        expect(await pending()).toHaveLength(1);
        // Scheduling again keeps the one.
        expect(await sweeper.schedule(new Date())).toBe(true);
        await sweeper.ensureScheduled();
        expect(await pending()).toHaveLength(1);

        // A run (its job claimed) leaves the next one a day on.
        const [run] = await pending();
        await prisma.job.update({
            where: { id: run.id },
            data: { status: "PROCESSING" },
        });
        const before = Date.now();
        await sweeper.handle(run);
        const [next] = await pending();
        expect(next.id).not.toBe(run.id);
        expect(next.runAt.getTime()).toBeGreaterThanOrEqual(
            before + DAY - 1_000,
        );
    });
});

describe("the team hears of a member's own change (Members)", () => {
    const memberAlerts = (b: Business) =>
        prisma.job.findMany({
            where: {
                organizationId: b.owner.organizationId,
                type: TEAM_ALERT_TYPE,
                status: "PENDING",
                payload: { path: ["event"], equals: "member" },
            },
        });

    const bell = (b: Business) =>
        prisma.notification.findMany({
            where: {
                organizationId: b.owner.organizationId,
                type: { startsWith: "member." },
            },
            select: { type: true, title: true, contactId: true },
        });

    it("a member cancelling from their account rings the bell, once", async () => {
        const b = await business();
        const sub = await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "Asia/Kolkata",
        });
        await clearJobs(b);
        await service.cancelForCustomer(member(b), sub.id);

        const [job] = await memberAlerts(b);
        expect(job.payload).toMatchObject({
            event: "member",
            change: "cancelled",
            subscriptionId: sub.id,
        });
        await teamAlerts.handle(job);
        // Run twice: told once.
        await teamAlerts.handle(job);
        expect(await bell(b)).toEqual([
            {
                type: "member.cancelled",
                title: "Asha Rao cancelled their Monthly yoga membership",
                contactId: b.contactId,
            },
        ]);
    });

    it("a member pausing from their account rings the bell", async () => {
        const b = await business();
        const sub = await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "Asia/Kolkata",
        });
        await clearJobs(b);
        await service.pauseForCustomer(member(b), sub.id, 2);
        const [job] = await memberAlerts(b);
        await teamAlerts.handle(job);
        expect(await bell(b)).toEqual([
            expect.objectContaining({
                type: "member.paused",
                title: "Asha Rao paused their Monthly yoga membership",
            }),
        ]);
    });

    it("the team's own cancel and pause alert nobody", async () => {
        const b = await business();
        const sub = await service.subscribe(b.owner, {
            contactId: b.contactId,
            planId: b.planId,
            timezone: "Asia/Kolkata",
        });
        await service.pause(b.owner, sub.id, { weeks: 2 });
        await service.cancel(b.owner, sub.id, { when: "now" });
        expect(await memberAlerts(b)).toHaveLength(0);
    });
});
