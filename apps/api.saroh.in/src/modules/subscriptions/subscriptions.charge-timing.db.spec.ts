/**
 * The merchant chooses when autopay debits (round-2 D13B, DEC-065), with
 * the fake provider against a real Postgres and the clock moved by hand:
 * each timing's invoice date, planned debit and first step, for UPI (which
 * waits on a pre-debit notice) and a card (which doesn't); a plan's choice
 * over the business's; an early invoice dropped — voided, or credited for
 * a GST business — and its charge cancelled when the subscription is
 * cancelled or paused first; a changed setting never moving a charge
 * already queued; the default unchanged; the settings' capability and
 * validation; and "Next autopay charge" for the customer.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { createHmac } from "node:crypto";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { InvoicesService } from "../invoices/invoices.service";
import { hashPayToken } from "../invoices/pay-token";
import { AutopayService } from "../payments/autopay.service";
import { chargeUnderWayOn } from "../payments/charge-under-way";
import { MandateChargesService } from "../payments/mandate-charges.service";
import { MandateSetupService } from "../payments/mandate-setup.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import type { MandateMethod } from "../payments/providers/provider.port";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { AccountPlanService } from "../site-accounts/account-plan.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import type { AutopayChargeTiming } from "./autopay-timing";
import { SUBSCRIPTION_CHARGE_TYPE } from "./charge-job";
import { PlanChargeTimingDto, SubscriptionSettingsDto } from "./dto";
import { SubscriptionChargeHandler } from "./subscription-charge.handler";
import { SubscriptionRenewHandler } from "./subscription-renew.handler";
import { SubscriptionsService } from "./subscriptions.service";

const WEBHOOK_SECRET = "whsec_d13b_timing";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const fake = new FakeMerchantProvider("RAZORPAY");
const factory = new FakeProviderFactory(fake);
const payments = new PaymentsService(factory);
const setups = new MandateSetupService(factory);
const charges = new MandateChargesService(factory);
const invoices = new InvoicesService();
const subscriptions = new SubscriptionsService(invoices, undefined, charges);
const handler = new SubscriptionChargeHandler(charges);
const renewals = new SubscriptionRenewHandler(subscriptions);
const autopay = new AutopayService(setups);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const lots = () => new FixedWindowRateLimiter(1_000);
const publicInvoices = new PublicInvoicesService(
    payments,
    lots(),
    lots(),
    autopay,
    charges,
);
const account = new AccountPlanService(
    subscriptions,
    async (organizationId, invoiceId) =>
        (await chargeUnderWayOn(prisma, organizationId, invoiceId)) !== null,
    autopay,
    charges,
);

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let clock = new Date();

beforeEach(() => {
    clock = new Date();
    fake.now = () => clock;
    fake.mandateCalls.length = 0;
    fake.preDebitMethods.clear();
    fake.preDebitMethods.add("UPI");
});

/** A business with Razorpay connected and a monthly plan. */
async function business(opts: { gst?: boolean } = {}) {
    const user = await prisma.user.create({
        data: { email: `d13b-${next()}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse", slug: `d13b-${next()}` },
    });
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    if (opts.gst) {
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                gstRegistered: true,
                gstState: "29",
                taxId: "29AAGCK1234M1Z5",
                invoicePrefix: "PU",
            },
        });
    }
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
    const planId = (
        await subscriptions.createPlan(owner, {
            name: `Monthly ${next()}`,
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
    return { owner, planId };
}

type Biz = Awaited<ReturnType<typeof business>>;

async function webhook(owner: OrganizationContext, event: object) {
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_${next()}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A member on the plan with ACTIVE autopay by `method`; first period paid. */
async function autopayMember(biz: Biz, method: MandateMethod = "UPI") {
    const { owner } = biz;
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `c-${next()}@example.in`,
                firstName: "Ravi",
            },
        })
    ).id;
    const { id: subscriptionId } = await subscriptions.subscribe(owner, {
        contactId,
        planId: biz.planId,
    });
    await prisma.invoice.updateMany({
        where: { subscriptionId },
        data: { status: "PAID", paidAt: new Date() },
    });
    const view = await setups.createSetup({
        organizationId: owner.organizationId,
        subscriptionId,
        method,
        maxAmountCents: 180_000,
    });
    const setup = fake.authorise(`fake_setup_${view.mandateId}`);
    await webhook(owner, {
        eventType: "token.confirmed",
        outcome: "MANDATE",
        mandate: {
            status: "ACTIVE",
            setupReference: setup.setupReference,
            providerMandateId: setup.providerMandateId,
            method,
        },
    });
    const sub = await prisma.customerSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
    });
    return {
        contactId,
        subscriptionId,
        renewal: sub.currentPeriodEnd,
        timezone: sub.timezone,
        member: {
            organizationId: owner.organizationId,
            contactId,
            accountId: "acct_none",
        },
    };
}

function setTiming(biz: Biz, timing: AutopayChargeTiming) {
    return subscriptions.updateSettings(biz.owner, {
        autopayChargeTiming: timing,
    });
}

/** Renewal day: the job renews it an hour after the period ends. */
async function renewOnTheDay(subscriptionId: string, renewal: Date) {
    clock = new Date(renewal.getTime() + HOUR);
    return subscriptions.renewOne(subscriptionId, clock);
}

/** Two days before (plus an hour): the job's early pass. */
async function earlyPass(renewal: Date) {
    clock = new Date(renewal.getTime() - 2 * DAY + HOUR);
    return renewals.renewEarly(clock);
}

const invoicesOf = (subscriptionId: string, periodStart: Date) =>
    prisma.invoice.findMany({
        where: { subscriptionId, periodStart, kind: "INVOICE" },
        orderBy: { createdAt: "asc" },
    });

const intentsOf = (invoiceId: string) =>
    prisma.paymentIntent.findMany({
        where: { invoiceId, viaMandateId: { not: null } },
        orderBy: { createdAt: "asc" },
    });

function chargeJobs(organizationId: string, invoiceId: string) {
    return prisma.job.findMany({
        where: {
            organizationId,
            type: SUBSCRIPTION_CHARGE_TYPE,
            status: "PENDING",
            payload: { path: ["invoiceId"], equals: invoiceId },
        },
        orderBy: { createdAt: "asc" },
    });
}

/** Run the charge jobs due by `clock`, as the worker would. */
async function runDue(organizationId: string, invoiceId: string) {
    const due = (await chargeJobs(organizationId, invoiceId)).filter(
        (j) => j.runAt.getTime() <= clock.getTime(),
    );
    for (const job of due) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
        await handler.run(organizationId, job.payload as never, clock);
    }
    return due.map((j) => (j.payload as { step: string }).step);
}

const calls = (op: string) => fake.mandateCalls.filter((c) => c.op === op);

const eventsOf = async (subscriptionId: string) =>
    (
        await prisma.subscriptionEvent.findMany({
            where: { subscriptionId },
            orderBy: { createdAt: "asc" },
        })
    ).map((e) => ({ kind: e.kind, data: e.data }));

/** The start of the day `days` after `from`, in `zone`. */
const dayStart = (from: Date, days: number, zone: string) =>
    DateTime.fromJSDate(from, { zone })
        .plus({ days })
        .startOf("day")
        .toJSDate();

describe("the default, and DAY_AFTER_RENEWAL (D13 as it shipped)", () => {
    it("a business that never chose: invoiced on the renewal date, prepared at once, debited 26 hours on; no early pass", async () => {
        const biz = await business();
        expect((await subscriptions.settings(biz.owner)).autopay).toEqual({
            available: true,
            chargeTiming: "DAY_AFTER_RENEWAL",
            leadDays: 2,
            noticeHours: 26,
            dueDays: 7,
        });
        const who = await autopayMember(biz);
        expect(await earlyPass(who.renewal)).toBe(0);
        expect(await invoicesOf(who.subscriptionId, who.renewal)).toHaveLength(
            0,
        );

        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "renewed",
        );
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const [intent] = await intentsOf(invoice.id);
        // No planned debit: D13's intent, prepared now.
        expect(intent).toMatchObject({ status: "CREATED", debitAfter: null });
        const [prepare] = await chargeJobs(
            biz.owner.organizationId,
            invoice.id,
        );
        expect(prepare.runAt.getTime()).toBe(clock.getTime());
        expect(await runDue(biz.owner.organizationId, invoice.id)).toEqual([
            "PREPARE",
        ]);
        const [prepared] = await intentsOf(invoice.id);
        expect(prepared.debitAfter?.getTime()).toBe(
            clock.getTime() + 26 * HOUR,
        );
    });

    it("a card under it is debited as soon as it is prepared, as before", async () => {
        const biz = await business();
        const who = await autopayMember(biz, "CARD");
        await renewOnTheDay(who.subscriptionId, who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        expect(await runDue(biz.owner.organizationId, invoice.id)).toEqual([
            "PREPARE",
        ]);
        expect(await runDue(biz.owner.organizationId, invoice.id)).toEqual([
            "DEBIT",
        ]);
        expect(calls("charge")).toHaveLength(1);
    });
});

describe("ON_RENEWAL_DATE: charge on the renewal date", () => {
    it("UPI: invoice and notice two days early, debited on the renewal date; the renewal adds nothing", async () => {
        const biz = await business();
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz);
        const org = biz.owner.organizationId;

        // Too soon: three days out, nothing yet.
        clock = new Date(who.renewal.getTime() - 3 * DAY);
        expect(await renewals.renewEarly(clock)).toBe(0);

        expect(await earlyPass(who.renewal)).toBe(1);
        const issuedAt = clock;
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        expect(invoice).toMatchObject({ status: "ISSUED" });
        expect(invoice.issuedAt?.getTime()).toBe(issuedAt.getTime());
        // Planned on the intent from the start: the renewal date.
        let [intent] = await intentsOf(invoice.id);
        expect(intent.status).toBe("CREATED");
        expect(intent.debitAfter?.getTime()).toBe(who.renewal.getTime());
        expect(
            (await chargeUnderWayOn(prisma, org, invoice.id))?.at.getTime(),
        ).toBe(who.renewal.getTime());
        // Once per period: the next pass issues nothing.
        clock = new Date(clock.getTime() + HOUR);
        expect(await renewals.renewEarly(clock)).toBe(0);
        expect(
            (await eventsOf(who.subscriptionId)).filter(
                (e) => e.kind === "INVOICED",
            ),
        ).toEqual([
            {
                kind: "INVOICED",
                data: expect.objectContaining({ early: true }),
            },
        ]);

        // The notice goes out now; the order asks for the renewal date.
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        [intent] = await intentsOf(invoice.id);
        expect(intent.debitAfter?.getTime()).toBe(who.renewal.getTime());
        const [debit] = await chargeJobs(org, invoice.id);
        expect(debit.runAt.getTime()).toBe(who.renewal.getTime());
        fake.settlePreDebit(intent.providerIntentId ?? "", "DELIVERED");

        // The renewal date: the period moves, its invoice is the early one.
        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "advanced",
        );
        expect(await invoicesOf(who.subscriptionId, who.renewal)).toHaveLength(
            1,
        );
        expect(await intentsOf(invoice.id)).toHaveLength(1);
        expect(await runDue(org, invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(1);
    });

    it("a card: the same early invoice, and never debited before the renewal date", async () => {
        const biz = await business();
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz, "CARD");
        const org = biz.owner.organizationId;
        expect(await earlyPass(who.renewal)).toBe(1);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        const [intent] = await intentsOf(invoice.id);
        expect(intent).toMatchObject({
            status: "REQUIRES_PAYMENT",
            preDebitStatus: "NOT_NEEDED",
        });
        expect(intent.debitAfter?.getTime()).toBe(who.renewal.getTime());
        const [debit] = await chargeJobs(org, invoice.id);
        expect(debit.runAt.getTime()).toBe(who.renewal.getTime());
        // Even asked early, the debit waits.
        expect(
            await charges.charge({
                organizationId: org,
                intentId: intent.id,
                now: clock,
            }),
        ).toMatchObject({ status: "NOT_YET" });
        expect(calls("charge")).toHaveLength(0);
        clock = new Date(who.renewal.getTime() + HOUR);
        expect(await runDue(org, invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(1);
    });

    it("renewed on the day without an early invoice: debited as soon as the notice allows", async () => {
        const biz = await business();
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz);
        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "renewed",
        );
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const [intent] = await intentsOf(invoice.id);
        expect(intent.debitAfter?.getTime()).toBe(clock.getTime() + 26 * HOUR);
    });
});

describe("ON_DUE_DATE: charge on the due date", () => {
    it("UPI: invoice on the renewal date, debit at the start of its due date, notice two days before", async () => {
        const biz = await business();
        await setTiming(biz, "ON_DUE_DATE");
        const who = await autopayMember(biz);
        const org = biz.owner.organizationId;
        expect(await earlyPass(who.renewal)).toBe(0);
        await renewOnTheDay(who.subscriptionId, who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const due = dayStart(clock, 7, who.timezone);
        const [intent] = await intentsOf(invoice.id);
        expect(intent.debitAfter?.getTime()).toBe(due.getTime());
        const [prepare] = await chargeJobs(org, invoice.id);
        expect(prepare.runAt.getTime()).toBe(
            DateTime.fromJSDate(due, { zone: who.timezone })
                .minus({ days: 2 })
                .toMillis(),
        );
        // Not before its time.
        expect(await runDue(org, invoice.id)).toEqual([]);
        clock = prepare.runAt;
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        const [debit] = await chargeJobs(org, invoice.id);
        expect(debit.runAt.getTime()).toBe(due.getTime());
    });

    it("a card: debited on the due date too, not when it is prepared", async () => {
        const biz = await business();
        await setTiming(biz, "ON_DUE_DATE");
        const who = await autopayMember(biz, "CARD");
        const org = biz.owner.organizationId;
        await renewOnTheDay(who.subscriptionId, who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const due = dayStart(clock, 7, who.timezone);
        clock = new Date(due.getTime() - 2 * DAY);
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        expect(await runDue(org, invoice.id)).toEqual([]);
        const [debit] = await chargeJobs(org, invoice.id);
        expect(debit.runAt.getTime()).toBe(due.getTime());
    });
});

describe("a plan's own timing", () => {
    it("wins over the business's either way", async () => {
        const biz = await business();
        await setTiming(biz, "ON_DUE_DATE");
        const plan = await subscriptions.setPlanChargeTiming(
            biz.owner,
            biz.planId,
            "DAY_AFTER_RENEWAL",
        );
        expect(plan.autopayChargeTiming).toBe("DAY_AFTER_RENEWAL");
        const who = await autopayMember(biz);
        await renewOnTheDay(who.subscriptionId, who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        expect((await intentsOf(invoice.id))[0].debitAfter).toBeNull();

        const other = await business();
        await subscriptions.setPlanChargeTiming(
            other.owner,
            other.planId,
            "ON_RENEWAL_DATE",
        );
        const early = await autopayMember(other);
        expect(await earlyPass(early.renewal)).toBe(1);

        // Back to the business's.
        const cleared = await subscriptions.setPlanChargeTiming(
            other.owner,
            other.planId,
            null,
        );
        expect(cleared.autopayChargeTiming).toBeNull();
    });
});

describe("an early invoice dropped before its period begins", () => {
    async function early(opts: { gst?: boolean } = {}) {
        const biz = await business(opts);
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz);
        expect(await earlyPass(who.renewal)).toBe(1);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        return { biz, who, invoice, org: biz.owner.organizationId };
    }

    it("cancelled at period end: voided, its charge cancelled, never debited; Keep lets the renewal invoice it on the day", async () => {
        const { biz, who, invoice, org } = await early();
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        await subscriptions.cancel(biz.owner, who.subscriptionId, {
            when: "periodEnd",
        });
        expect(
            await prisma.invoice.findUniqueOrThrow({
                where: { id: invoice.id },
            }),
        ).toMatchObject({ status: "VOID", payTokenHash: null });
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
        expect((await eventsOf(who.subscriptionId)).at(-1)).toEqual({
            kind: "EARLY_INVOICE_CANCELLED",
            data: { reason: "CANCELLED", by: "VOIDED" },
        });
        clock = new Date(who.renewal.getTime() + HOUR);
        expect(await runDue(org, invoice.id)).toEqual(["DEBIT"]);
        expect(calls("charge")).toHaveLength(0);

        // Not invoiced early again; kept, the renewal invoices the period.
        await subscriptions.keep(biz.owner, who.subscriptionId);
        expect(await earlyPass(who.renewal)).toBe(0);
        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "renewed",
        );
        const all = await invoicesOf(who.subscriptionId, who.renewal);
        expect(all.map((i) => i.status)).toEqual(["VOID", "ISSUED"]);
    });

    it("paused: voided and its charge cancelled before anything was prepared", async () => {
        const { biz, who, invoice, org } = await early();
        await subscriptions.pause(biz.owner, who.subscriptionId);
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("VOID");
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        expect(calls("prepareCharge")).toHaveLength(0);
    });

    it("a GST business credits it instead, and the renewal can still invoice the period", async () => {
        const { biz, who, invoice } = await early({ gst: true });
        await subscriptions.cancel(biz.owner, who.subscriptionId, {
            when: "periodEnd",
        });
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("CREDITED");
        const note = await prisma.invoice.findFirstOrThrow({
            where: { relatedInvoiceId: invoice.id, kind: "CREDIT_NOTE" },
        });
        expect(note.status).toBe("ISSUED");
        expect((await eventsOf(who.subscriptionId)).at(-1)?.data).toEqual({
            reason: "CANCELLED",
            by: "CREDITED",
        });
        await subscriptions.keep(biz.owner, who.subscriptionId);
        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "renewed",
        );
    });

    it("stopped by a write that didn't drop it: the charge job drops it before any debit", async () => {
        const { who, invoice, org } = await early();
        await prisma.customerSubscription.update({
            where: { id: who.subscriptionId },
            data: { cancelAtPeriodEnd: true },
        });
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        expect(calls("prepareCharge")).toHaveLength(0);
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("VOID");
        expect((await intentsOf(invoice.id))[0].status).toBe("CANCELLED");
    });

    it("a plan change booked after it: voided, the renewal invoices the new plan", async () => {
        const { biz, who, invoice } = await early();
        const bigger = await subscriptions.createPlan(biz.owner, {
            name: `Plus ${next()}`,
            price: "1500",
            currency: "INR",
            interval: "MONTH",
        });
        await subscriptions.changePlan(biz.owner, who.subscriptionId, {
            planId: bigger.id,
        });
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("VOID");
        expect(await renewOnTheDay(who.subscriptionId, who.renewal)).toBe(
            "renewed",
        );
        const live = (await invoicesOf(who.subscriptionId, who.renewal)).find(
            (i) => i.status === "ISSUED",
        );
        expect(live?.total.toString()).toBe("1500");
    });
});

describe("changing the timing", () => {
    it("never moves a charge already queued or prepared", async () => {
        const biz = await business();
        await setTiming(biz, "ON_DUE_DATE");
        const who = await autopayMember(biz);
        const org = biz.owner.organizationId;
        await renewOnTheDay(who.subscriptionId, who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const planned = (await intentsOf(invoice.id))[0].debitAfter;
        await setTiming(biz, "DAY_AFTER_RENEWAL");
        expect((await intentsOf(invoice.id))[0].debitAfter).toEqual(planned);
        clock = new Date((planned?.getTime() ?? 0) - 2 * DAY);
        expect(await runDue(org, invoice.id)).toEqual(["PREPARE"]);
        await setTiming(biz, "ON_RENEWAL_DATE");
        const [intent] = await intentsOf(invoice.id);
        expect(intent.debitAfter).toEqual(planned);
        const [debit] = await chargeJobs(org, invoice.id);
        expect(debit.runAt).toEqual(planned);
    });
});

describe("the settings", () => {
    it("someone who can't change subscriptions can change neither the business's timing nor a plan's", async () => {
        const biz = await business();
        const member: OrganizationContext = { ...biz.owner, role: "MEMBER" };
        await expect(
            subscriptions.updateSettings(member, {
                autopayChargeTiming: "ON_DUE_DATE",
            }),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            subscriptions.setPlanChargeTiming(
                member,
                biz.planId,
                "ON_DUE_DATE",
            ),
        ).rejects.toThrow(ForbiddenException);
        expect(
            (await subscriptions.settings(biz.owner)).autopay.chargeTiming,
        ).toBe("DAY_AFTER_RENEWAL");
    });

    it("a save naming nothing is refused; another business's plan is not found", async () => {
        const biz = await business();
        await expect(
            subscriptions.updateSettings(biz.owner, {}),
        ).rejects.toThrow(BadRequestException);
        const other = await business();
        await expect(
            subscriptions.setPlanChargeTiming(
                biz.owner,
                other.planId,
                "ON_DUE_DATE",
            ),
        ).rejects.toThrow("Plan");
    });

    it("the DTOs take the three timings (and null for a plan), nothing else", async () => {
        const bad = await validate(
            plainToInstance(SubscriptionSettingsDto, {
                autopayChargeTiming: "WHENEVER",
            }),
        );
        expect(bad).toHaveLength(1);
        expect(
            await validate(
                plainToInstance(SubscriptionSettingsDto, {
                    autopayChargeTiming: "ON_DUE_DATE",
                }),
            ),
        ).toHaveLength(0);
        expect(
            await validate(
                plainToInstance(PlanChargeTimingDto, {
                    autopayChargeTiming: null,
                }),
            ),
        ).toHaveLength(0);
        expect(
            await validate(plainToInstance(PlanChargeTimingDto, {})),
        ).toHaveLength(1);
    });

    it("says autopay isn't available without a provider that charges it", async () => {
        const user = await prisma.user.create({
            data: { email: `d13b-none-${next()}@x.com` },
        });
        const org = await prisma.organization.create({
            data: { name: "Plain", slug: `d13b-none-${next()}` },
        });
        const ctx: OrganizationContext = {
            organizationId: org.id,
            userId: user.id,
            role: "OWNER",
        };
        expect((await subscriptions.settings(ctx)).autopay.available).toBe(
            false,
        );
    });
});

describe("the customer is told when autopay next charges", () => {
    async function nextOnTab(member: {
        organizationId: string;
        contactId: string;
        accountId: string;
    }) {
        const tab = await account.tab(member, clock);
        if (!tab.subscriptions.ok) throw new Error("tab failed");
        return tab.subscriptions.value[0].autopayNextCharge?.at ?? null;
    }

    it("the Plan tab: the renewal's charge by the timing, then the queued charge's planned date", async () => {
        const biz = await business();
        const who = await autopayMember(biz);
        clock = new Date();
        // UPI the day after: 26 hours after the renewal date.
        expect(await nextOnTab(who.member)).toBe(
            new Date(who.renewal.getTime() + 26 * HOUR).toISOString(),
        );
        await setTiming(biz, "ON_DUE_DATE");
        expect(await nextOnTab(who.member)).toBe(
            dayStart(who.renewal, 7, who.timezone).toISOString(),
        );
        await setTiming(biz, "ON_RENEWAL_DATE");
        expect(await nextOnTab(who.member)).toBe(who.renewal.toISOString());

        // Queued early: its planned debit.
        await earlyPass(who.renewal);
        expect(await nextOnTab(who.member)).toBe(who.renewal.toISOString());

        // Set to end: nothing more to charge.
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        await subscriptions.cancel(biz.owner, who.subscriptionId, {
            when: "periodEnd",
        });
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("VOID");
        expect(await nextOnTab(who.member)).toBeNull();
    });

    it("the pay page: a queued charge's planned date", async () => {
        const biz = await business();
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz);
        await earlyPass(who.renewal);
        const [invoice] = await invoicesOf(who.subscriptionId, who.renewal);
        const token = `tok_${next()}`;
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { payTokenHash: hashPayToken(token) },
        });
        const page = await publicInvoices.read(token);
        expect(page.autopayNextCharge?.at).toBe(who.renewal.toISOString());
        expect(page.autopayCharging?.at).toBe(who.renewal.toISOString());
    });

    it("the pay page of a paid invoice with autopay on: the next renewal's", async () => {
        const biz = await business();
        await setTiming(biz, "ON_RENEWAL_DATE");
        const who = await autopayMember(biz);
        const paid = await prisma.invoice.findFirstOrThrow({
            where: { subscriptionId: who.subscriptionId, status: "PAID" },
        });
        const token = `tok_${next()}`;
        await prisma.invoice.update({
            where: { id: paid.id },
            data: { payTokenHash: hashPayToken(token) },
        });
        const page = await publicInvoices.read(token);
        expect(page.autopayNextCharge?.at).toBe(who.renewal.toISOString());
    });
});
