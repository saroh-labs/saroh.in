/**
 * The reminder 3 days before a plan renews (#804) against a real Postgres:
 * the hourly billing sweep finds an autopay charge due within 3 days,
 * claims it once as a `CustomerNotice` and queues a `RENEWAL` billing email;
 * the email names the amount with GST (add-ons included) and the date in
 * the business's zone. A second sweep, a redelivered email, or a renewal
 * that changed since says nothing.
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
import { addMonthsUtc, planRows, withGstPaise } from "@saroh/pricing-catalog";

import { fakeCatalog } from "../../../test/fixtures/pricing-catalog";
import type { SarohBillingEmail } from "../../common/email";
import { paperDay, paperMoney } from "../invoices/invoice-paper-view";
import { BILLING_EMAIL_TYPE, BillingEmailHandler } from "./billing-email.job";
import { MovesApplyHandler } from "./moves-apply.handler";
import { RENEWAL_REMINDER_NOTICE_KIND } from "./renewal-reminder";
import { remindRenewals } from "./renewal-reminder-notice";
import { paiseToRupees } from "./saroh-invoice-terms";

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
    await prisma.subscriptionAddonCharge.deleteMany({});
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
async function business(timezone?: string) {
    seq += 1;
    const org = await prisma.organization.create({
        data: { name: `Renew ${seq}`, slug: `renew-${seq}-${tag}` },
    });
    await startOnFreePlan(prisma, org.id, { planId: "free" });
    if (timezone) {
        await prisma.businessProfile.create({
            data: { organizationId: org.id, timezone },
        });
    }
    const owner = await prisma.user.create({
        data: { email: `owner-renew-${seq}-${tag}@example.test` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    return { organizationId: org.id, ownerEmail: owner.email };
}

/** Plan B on monthly autopay, charges started 5 months before `renewsAt`. */
async function onPlanB(organizationId: string, renewsAt: Date) {
    const plan = await prisma.plan.findUniqueOrThrow({
        where: {
            key_version_interval: {
                key: "catalog.b",
                version: 1,
                interval: "month",
            },
        },
    });
    const providerSubscriptionId = `sub_${organizationId}`;
    const sub = await prisma.subscription.update({
        where: { organizationId },
        data: {
            planId: plan.id,
            billingCycle: "month",
            status: "ACTIVE",
            provider: "RAZORPAY",
            providerSubscriptionId,
            currentPeriodEnd: renewsAt,
        },
    });
    const started = addMonthsUtc(renewsAt, -5);
    await prisma.billingCheckout.create({
        data: {
            organizationId,
            planId: plan.id,
            cycle: "month",
            kind: "NEW",
            status: "COMPLETED",
            provider: "RAZORPAY",
            providerSubscriptionId,
            providerPlanId: "plan_test_b",
            pricePaise: plan.priceCents,
            chargeNowPaise: 0,
            completedAt: started,
            expiresAt: new Date(started.getTime() + DAY),
        },
    });
    return { sub, plan, providerSubscriptionId };
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

const rupees = (paise: number) => paperMoney(paiseToRupees(paise), "INR");

describe("a plan about to renew (#804)", () => {
    it("the hourly sweep emails the billing people once, 3 days ahead, with the amount and date", async () => {
        const b = await business();
        const now = new Date();
        const renewsAt = new Date(now.getTime() + 2 * DAY);
        const { sub, plan } = await onPlanB(b.organizationId, renewsAt);

        // Further off than 3 days: not yet.
        expect(
            await remindRenewals(
                new Date(renewsAt.getTime() - 4 * DAY),
                logger,
            ),
        ).toBe(0);

        const out = await new MovesApplyHandler().sweep(now);
        expect(out.reminded).toBeGreaterThanOrEqual(1);
        const claims = await prisma.customerNotice.findMany({
            where: {
                organizationId: b.organizationId,
                kind: RENEWAL_REMINDER_NOTICE_KIND,
            },
        });
        expect(claims.map((c) => c.eventKey)).toEqual([
            `renewal-reminder:${sub.id}:${renewsAt.toISOString()}`,
        ]);

        const jobs = await runMail();
        expect(jobs[0]!.payload).toMatchObject({
            kind: "RENEWAL",
            subscriptionId: sub.id,
            renewsAt: renewsAt.toISOString(),
        });
        expect(sent).toHaveLength(1);
        expect(sent[0]!.to).toEqual([b.ownerEmail]);
        expect(sent[0]!.subject).toMatch(/^Renew \d+'s Plan B plan renews on /);
        expect(sent[0]!.html).toContain(
            `your autopay pays ${rupees(withGstPaise(plan.priceCents))}, GST included, for another month`,
        );
        expect(sent[0]!.html).toContain("/settings/billing");
        expect(sent[0]!.html).not.toContain("add-ons");

        // The next hour, and a redelivered email: nothing more.
        expect(
            await remindRenewals(new Date(now.getTime() + 3600_000), logger),
        ).toBe(0);
        await mailer.handle(jobs[0] as Job);
        expect(sent).toHaveLength(1);
        expect(logger.error).not.toHaveBeenCalled();
    });

    it("dates the renewal in the business's zone, and counts add-ons owed on the charge", async () => {
        const zone = "Pacific/Kiritimati";
        const b = await business(zone);
        const now = new Date();
        const midnight = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        );
        // Noon UTC two days on: already the next day at UTC+14.
        const renewsAt = new Date(midnight + 2 * DAY + 12 * 3600_000);
        const { sub, plan, providerSubscriptionId } = await onPlanB(
            b.organizationId,
            renewsAt,
        );
        await prisma.subscriptionAddonCharge.create({
            data: {
                organizationId: b.organizationId,
                subscriptionId: sub.id,
                addonId: "extra",
                description: "Extra",
                quantity: 2,
                unitPaise: 5000,
                periodStart: addMonthsUtc(renewsAt, -1),
                periodEnd: renewsAt,
                chargeAt: renewsAt,
                provider: "RAZORPAY",
                providerSubscriptionId,
                // A sent charge carries the provider's id (migration check
                // `SubscriptionAddonCharge_sent_shape`).
                providerChargeId: `${providerSubscriptionId}_addon`,
                status: "SENT",
            },
        });

        expect(await remindRenewals(now, logger)).toBe(1);
        await runMail();
        const day = paperDay(renewsAt.toISOString(), zone);
        expect(day).not.toBe(paperDay(renewsAt.toISOString(), "UTC"));
        expect(sent[0]!.subject).toContain(`renews on ${day}`);
        expect(sent[0]!.html).toContain(
            `pays ${rupees(withGstPaise(plan.priceCents) + withGstPaise(10000))}`,
        );
        expect(sent[0]!.html).toContain("Plan B plan and its add-ons");
    });

    it("says nothing on a cancel or a move to come, and a queued email says nothing once one is chosen", async () => {
        const now = new Date();
        const renewsAt = new Date(now.getTime() + 2 * DAY);

        const cancelling = await business();
        const c = await onPlanB(cancelling.organizationId, renewsAt);
        await prisma.subscription.update({
            where: { id: c.sub.id },
            data: { cancelAtPeriodEnd: true },
        });
        expect(await remindRenewals(now, logger)).toBe(0);

        const moving = await business();
        const m = await onPlanB(moving.organizationId, renewsAt);
        expect(await remindRenewals(now, logger)).toBe(1);
        // A move to Plan C chosen for the period's end, after the sweep.
        const planC = await prisma.plan.findUniqueOrThrow({
            where: {
                key_version_interval: {
                    key: "catalog.c",
                    version: 1,
                    interval: "month",
                },
            },
        });
        await prisma.subscription.update({
            where: { id: m.sub.id },
            data: { pendingPlanId: planC.id, pendingFrom: renewsAt },
        });
        await runMail();
        expect(sent).toHaveLength(0);
    });

    it("says nothing on Free, or in a trial (its own email)", async () => {
        const now = new Date();
        const renewsAt = new Date(now.getTime() + 2 * DAY);
        const free = await business();
        await prisma.subscription.update({
            where: { organizationId: free.organizationId },
            data: { currentPeriodEnd: renewsAt },
        });
        const trial = await business();
        const t = await onPlanB(trial.organizationId, renewsAt);
        await prisma.subscription.update({
            where: { id: t.sub.id },
            data: { status: "TRIALING" },
        });
        expect(await remindRenewals(now, logger)).toBe(0);
    });
});
