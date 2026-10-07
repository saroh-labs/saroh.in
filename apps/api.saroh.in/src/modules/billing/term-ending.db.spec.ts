/**
 * A 12-month term that ends (DEC-100) against a real Postgres: in the
 * term's last 30 days the billing sweep asks the business to pay for the
 * next term, 30, 7 and 1 days ahead — an inbox notice and an email to its
 * billing people — once per subscription, end and stage. A term already
 * renewed says nothing. And the first-month email (DEC-093) against a
 * genuine free trial's: the trial words only where the trial cost nothing.
 *
 * Every catalogue here is made up (`fakeCatalog`: Plan A free, Plan B 222,
 * Plan C 333). Runs in the integration project (TEST_DATABASE_URL).
 */
const createTransport = jest.fn();
jest.mock("nodemailer", () => ({
    __esModule: true,
    default: { createTransport },
}));

import type { Job } from "@saroh/database";
import {
    prisma,
    startOnFreePlan,
    writeCatalogueVersion,
} from "@saroh/database";
import { addMonthsUtc, planRows } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { SarohBillingEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    BILLING_EMAIL_TYPE,
    BillingEmailHandler,
    enqueueBillingEmail,
} from "./billing-email.job";
import { ONE_TIME_PAYMENT } from "./billing-term";
import { CheckoutService } from "./checkout.service";
import { PLAN_ENDING_NOTIFICATION_TYPE } from "./plan-ending";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { endTermAtInTx } from "./term-end";
import { TERM_ENDING_NOTICE_KIND } from "./term-ending";
import { remindEndingTerms } from "./term-ending-notice";

const DAY = 24 * 60 * 60 * 1000;
const tag = `${process.pid}-${Date.now()}`;
const logger = { error: jest.fn() };

let sent: SarohBillingEmail[];
let mailer: BillingEmailHandler;

beforeEach(async () => {
    sent = [];
    mailer = new BillingEmailHandler((email) => {
        sent.push(email);
        return Promise.resolve("sent");
    });
    await prisma.job.deleteMany({});
    await prisma.billingCheckout.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.pricingProviderPlan.deleteMany({});
    await prisma.pricingCatalogVersion.deleteMany({});
    await prisma.plan.deleteMany({});
    const catalog = fakeCatalog();
    await writeCatalogueVersion(prisma, {
        version: 1,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, 1),
    });
});

afterEach(() => {
    // Nothing in this file ever reaches a real mail transport.
    expect(createTransport).not.toHaveBeenCalled();
});

let seq = 0;
async function business() {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Term ${seq}`, slug: `term-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    const owner = await prisma.user.create({
        data: { email: `owner-term-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    return {
        organizationId: org.id,
        ownerEmail: owner.email,
        ctx: {
            organizationId: org.id,
            userId: owner.id,
            role: "OWNER",
        } as OrganizationContext,
    };
}

function planRow(interval: "month" | "year") {
    return prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: { key: "catalog.b", version: 1, interval },
        },
    });
}

/**
 * Plan B, paid through a completed checkout: monthly autopay whose charges
 * started at `startAt`, or a year paid once ending at `periodEnd`.
 */
async function onPlanB(
    organizationId: string,
    how: { cycle: "month"; startAt: Date } | { cycle: "year"; periodEnd: Date },
    trial?: { chargeNowPaise: number; endsAt: Date },
) {
    const plan = await planRow(how.cycle);
    const providerSubscriptionId = `sub_${organizationId}`;
    const sub = await prisma.subscription.update({
        where: { organizationId },
        data: {
            planId: plan.id,
            billingCycle: how.cycle,
            status: trial ? "TRIALING" : "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId,
            currentPeriodEnd: trial
                ? trial.endsAt
                : how.cycle === "year"
                  ? how.periodEnd
                  : new Date(Date.now() + 10 * DAY),
        },
    });
    await prisma.billingCheckout.create({
        data: {
            organizationId,
            planId: plan.id,
            cycle: how.cycle,
            kind: trial ? "TRIAL" : "NEW",
            status: "COMPLETED",
            provider: "RAZORPAY",
            providerSubscriptionId,
            providerPlanId:
                how.cycle === "year" ? ONE_TIME_PAYMENT : "plan_test_b",
            pricePaise: plan.priceCents,
            chargeNowPaise: trial?.chargeNowPaise ?? 0,
            // A NEW checkout starts at authorisation (no startAt, the
            // BillingCheckout_start_shape constraint): its term counts from
            // completedAt. A TRIAL starts when the trial ends.
            startAt: trial ? trial.endsAt : null,
            completedAt:
                !trial && how.cycle === "month" ? how.startAt : new Date(),
            expiresAt: new Date(Date.now() + DAY),
        },
    });
    return sub;
}

/** Run every waiting billing email, as the worker would. */
async function runMail() {
    const jobs = await prisma.job.findMany({
        where: { type: BILLING_EMAIL_TYPE, status: "PENDING" },
        orderBy: { createdAt: "asc" },
    });
    for (const j of jobs) {
        await mailer.handle(j as Job);
        await prisma.job.update({
            where: { id: j.id },
            data: { status: "COMPLETED" },
        });
    }
    return jobs;
}

describe("a 12-month term that ends", () => {
    it("monthly: asked to pay for the next term 30, 7 and 1 days ahead, once each", async () => {
        const b = await business();
        const now = new Date();
        const start = addMonthsUtc(new Date(now.getTime() + 20 * DAY), -12);
        const sub = await onPlanB(b.organizationId, {
            cycle: "month",
            startAt: start,
        });
        const ends = addMonthsUtc(start, 12);

        expect(await remindEndingTerms(now, logger)).toBe(1);
        const [notice] = await prisma.notification.findMany({
            where: {
                organizationId: b.organizationId,
                type: PLAN_ENDING_NOTIFICATION_TYPE,
            },
        });
        expect(notice?.title).toMatch(/^Your Plan B term ends on /);
        const jobs = await runMail();
        expect(jobs[0]!.payload).toMatchObject({
            kind: "TERM_ENDING",
            subscriptionId: sub.id,
            endsAt: ends.toISOString(),
            stage: 30,
        });
        expect(sent).toHaveLength(1);
        expect(sent[0]!.to).toEqual([b.ownerEmail]);
        expect(sent[0]!.subject).toMatch(
            /^Pay for Term \d+'s next Plan B term by /,
        );
        expect(sent[0]!.html).toContain("12 monthly payments");
        expect(sent[0]!.html).toContain("/settings/billing#change-plan");
        // The live price, from the catalogue: Plan B's 222.
        expect(sent[0]!.html).toContain("222");

        // The next hour, and a redelivered email: nothing more.
        expect(
            await remindEndingTerms(new Date(now.getTime() + 3600_000), logger),
        ).toBe(0);
        await mailer.handle(jobs[0] as Job);
        expect(sent).toHaveLength(1);

        expect(
            await remindEndingTerms(new Date(ends.getTime() - 6 * DAY), logger),
        ).toBe(1);
        expect(
            await remindEndingTerms(
                new Date(ends.getTime() - 12 * 3600_000),
                logger,
            ),
        ).toBe(1);
        const later = await prisma.job.findMany({
            where: { type: BILLING_EMAIL_TYPE, status: "PENDING" },
        });
        // Mailed at their own time: re-read as of now, the 30-day stage.
        expect(later).toHaveLength(2);
        const claims = await prisma.customerNotice.findMany({
            where: {
                organizationId: b.organizationId,
                kind: TERM_ENDING_NOTICE_KIND,
            },
        });
        expect(claims.map((c) => c.eventKey.split(":").pop()).sort()).toEqual([
            "1",
            "30",
            "7",
        ]);
        expect(claims.every((c) => c.notificationId)).toBe(true);

        // Past its end, and further than 30 days off: nothing.
        expect(
            await remindEndingTerms(new Date(ends.getTime() + DAY), logger),
        ).toBe(0);
        expect(
            await remindEndingTerms(
                new Date(ends.getTime() - 45 * DAY),
                logger,
            ),
        ).toBe(0);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("yearly paid once: the year's end asks for the next year's payment", async () => {
        const b = await business();
        const now = new Date();
        await onPlanB(b.organizationId, {
            cycle: "year",
            periodEnd: new Date(now.getTime() + 5 * DAY),
        });
        expect(await remindEndingTerms(now, logger)).toBe(1);
        const [job] = await runMail();
        expect(job!.payload).toMatchObject({ stage: 7 });
        expect(sent[0]!.html).toContain("The year Term");
        expect(sent[0]!.html).toContain("for the year plus GST");
    });

    it("a term renewed already is not asked, and a queued email says nothing", async () => {
        const b = await business();
        const now = new Date();
        await onPlanB(b.organizationId, {
            cycle: "year",
            periodEnd: new Date(now.getTime() + 20 * DAY),
        });
        expect(await remindEndingTerms(now, logger)).toBe(1);
        // The business renews: a SCHEDULED checkout from the term's end.
        const plan = await planRow("year");
        await prisma.billingCheckout.create({
            data: {
                organizationId: b.organizationId,
                planId: plan.id,
                cycle: "year",
                kind: "SCHEDULED",
                status: "SCHEDULED",
                provider: "RAZORPAY",
                providerSubscriptionId: `renew_${b.organizationId}`,
                providerPlanId: ONE_TIME_PAYMENT,
                pricePaise: plan.priceCents,
                startAt: new Date(now.getTime() + 20 * DAY),
                expiresAt: new Date(now.getTime() + DAY),
            },
        });
        await runMail();
        expect(sent).toHaveLength(0);
        expect(
            await remindEndingTerms(new Date(now.getTime() + 14 * DAY), logger),
        ).toBe(0);
    });
});

describe("a term whose owner chose Free (DEC-100)", () => {
    async function noticesOf(organizationId: string) {
        return prisma.notification.findMany({
            where: { organizationId, type: PLAN_ENDING_NOTIFICATION_TYPE },
        });
    }

    it("Free chosen in Plan and billing: told it moves to Free as chosen, never asked to pay", async () => {
        const b = await business();
        const now = new Date();
        const ends = new Date(now.getTime() + 5 * DAY);
        await onPlanB(b.organizationId, { cycle: "year", periodEnd: ends });
        const factory = new FakeBillingProviderFactory(
            new FakeBillingProvider("RAZORPAY", "whsec_fake_platform_secret"),
        );
        const checkout = new CheckoutService(new PlansService(), factory);
        const r = await checkout.changePlan(b.ctx, {
            plan: "free",
            cycle: "month",
        });
        expect(r.kind).toBe("TO_FREE");
        const row = await prisma.subscription.findUniqueOrThrow({
            where: { organizationId: b.organizationId },
        });
        expect(row.cancelAtPeriodEnd).toBe(true);
        expect(row.freeChosenAt).not.toBeNull();

        expect(await remindEndingTerms(now, logger)).toBe(1);
        const [notice] = await noticesOf(b.organizationId);
        expect(notice?.title).toMatch(
            /^Your plan moves to Free on .+, as you chose$/,
        );
        await runMail();
        expect(sent).toHaveLength(1);
        expect(sent[0]!.subject).toMatch(/moves to the Free plan on /);
        expect(sent[0]!.html).toContain("as you chose");
        expect(`${sent[0]!.subject} ${sent[0]!.html}`).not.toMatch(
            /pay for the next term/i,
        );
    });

    it("a term run out with nothing renewed (no choice recorded) is still asked to pay", async () => {
        const b = await business();
        const now = new Date();
        const ends = new Date(now.getTime() + 5 * DAY);
        const sub = await onPlanB(b.organizationId, {
            cycle: "year",
            periodEnd: ends,
        });
        // The provider's `completed`: on course for Free at the end.
        await prisma.$transaction((tx) =>
            endTermAtInTx(tx, { ...sub, plan: { version: 1 } }, ends),
        );
        expect(await remindEndingTerms(now, logger)).toBe(1);
        const [notice] = await noticesOf(b.organizationId);
        expect(notice?.title).toMatch(/^Your Plan B term ends on /);
        await runMail();
        expect(sent[0]!.subject).toMatch(/^Pay for /);
    });
});

describe("the first month's end (DEC-093) against a free trial's", () => {
    async function trialEmail(chargeNowPaise: number) {
        const b = await business();
        const endsAt = new Date(Date.now() + 3 * DAY);
        const sub = await onPlanB(
            b.organizationId,
            { cycle: "month", startAt: endsAt },
            { chargeNowPaise, endsAt },
        );
        await enqueueBillingEmail(prisma, {
            kind: "TRIAL_ENDING",
            organizationId: b.organizationId,
            subscriptionId: sub.id,
            endsAt: endsAt.toISOString(),
        });
        await runMail();
        expect(sent).toHaveLength(1);
        return sent[0]!;
    }

    it("a nominal first month is worded as one, never a trial", async () => {
        const email = await trialEmail(100);
        expect(email.subject).toMatch(
            /^Term \d+'s first month on Plan B ends on /,
        );
        expect(email.html).toContain("your autopay pays");
        expect(`${email.subject} ${email.html}`).not.toMatch(/trial/i);
    });

    it("a trial that cost nothing keeps the trial's words", async () => {
        const email = await trialEmail(0);
        expect(email.subject).toMatch(/^Term \d+'s Plan B trial ends on /);
        expect(email.html).toContain("charge");
    });
});
