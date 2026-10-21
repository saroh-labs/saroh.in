import { createHmac } from "node:crypto";

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../src/common/types/organization-context";
import { CommunicationsService } from "../../src/modules/communications/communications.service";
import { MessageSendHandler } from "../../src/modules/communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../../src/modules/communications/providers/fake.provider";
import { InvoiceAutoSendHandler } from "../../src/modules/invoices/invoice-auto-send.handler";
import { InvoiceSendService } from "../../src/modules/invoices/invoice-send.service";
import { InvoicesService } from "../../src/modules/invoices/invoices.service";
import { MandateChargesService } from "../../src/modules/payments/mandate-charges.service";
import { MandateSetupService } from "../../src/modules/payments/mandate-setup.service";
import { PaymentsService } from "../../src/modules/payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../../src/modules/payments/providers/fake.provider";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../../src/modules/site-accounts/customer-notify.handler";
import type { AutopayChargeTiming } from "../../src/modules/subscriptions/autopay-timing";
import { SUBSCRIPTION_CHARGE_TYPE } from "../../src/modules/subscriptions/charge-job";
import { SubscriptionChargeHandler } from "../../src/modules/subscriptions/subscription-charge.handler";
import { SubscriptionRenewHandler } from "../../src/modules/subscriptions/subscription-renew.handler";
import { SubscriptionsService } from "../../src/modules/subscriptions/subscriptions.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../../src/modules/webhooks/providers/fake.webhook";
import { WebhooksService } from "../../src/modules/webhooks/webhooks.service";
import { giveBusinessDetails } from "../business-details";

/**
 * Renewals and their customer notices (automatic notices U10), against a
 * real Postgres with the fake payment, webhook and email providers and the
 * clock moved by hand: a business per test, a member with or without
 * autopay, the renewal, the charge's steps, and the jobs a renewal or a
 * failed charge leaves for the customer, run as the worker would.
 *
 * The spec that imports it stubs the app env (`PAYMENTS_ENC_KEY`,
 * `RENDERER_URL`) with `jest.mock("../../env")` first.
 */

const WEBHOOK_SECRET = "whsec_u10_renewals";
export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

export function renewalHarness() {
    const fake = new FakeMerchantProvider("RAZORPAY");
    const factory = new FakeProviderFactory(fake);
    const payments = new PaymentsService(factory);
    const setups = new MandateSetupService(factory);
    const charges = new MandateChargesService(factory);
    const invoices = new InvoicesService();
    const comms = new CommunicationsService();
    const subscriptions = new SubscriptionsService(
        invoices,
        undefined,
        charges,
    );
    const chargeHandler = new SubscriptionChargeHandler(charges);
    const renewals = new SubscriptionRenewHandler(subscriptions);
    const webhooks = new WebhooksService(
        new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
        payments,
    );
    const sending = new InvoiceSendService(invoices, comms);
    const autoSend = new InvoiceAutoSendHandler(sending);
    const notices = new CustomerNotifyHandler(new CustomerNotifyService(comms));
    const email = new FakeCommsProvider("EMAIL");
    const mail = new MessageSendHandler(new FakeCommsProviderFactory(email));

    const tag = `${process.pid}-${Date.now()}`;
    let n = 0;
    const next = () => `${tag}-${++n}`;
    const clock = { now: new Date() };
    fake.now = () => clock.now;

    /** Before each test: the clock now, the fakes forgotten. */
    function reset() {
        clock.now = new Date();
        fake.mandateCalls.length = 0;
        fake.preDebitMethods.clear();
        fake.preDebitMethods.add("UPI");
        email.calls.length = 0;
    }

    /**
     * A business with Razorpay connected, a monthly plan, and its own email
     * provider unless `email: false`.
     */
    async function business(opts: { email?: boolean } = {}) {
        const user = await prisma.user.create({
            data: { email: `u10-${next()}@example.com` },
        });
        const org = await prisma.organization.create({
            data: { name: "Pulse & Co.", slug: `u10-${next()}` },
        });
        const owner: OrganizationContext = {
            organizationId: org.id,
            userId: user.id,
            role: "OWNER",
        };
        await giveBusinessDetails(org.id);
        await payments.connectProvider(owner, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_Public1",
            keyId: "rzp_test_Public1",
            keySecret: "rzp_secret",
            webhookSecret: WEBHOOK_SECRET,
        });
        if (opts.email !== false) {
            await comms.connectProvider(owner, {
                channel: "EMAIL",
                provider: "RESEND",
                fromAddress: "hello@pulse.example.com",
                credentials: { apiKey: "re_test_key" },
            });
        }
        const planId = (
            await subscriptions.createPlan(owner, {
                name: `Monthly yoga ${next()}`,
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

    /** A member on the plan, its first period paid; no autopay. */
    async function member(biz: Biz) {
        const contactId = (
            await prisma.contact.create({
                data: {
                    organizationId: biz.owner.organizationId,
                    email: `member-${next()}@example.com`,
                    firstName: "Ravi",
                },
            })
        ).id;
        const { id: subscriptionId } = await subscriptions.subscribe(
            biz.owner,
            { contactId, planId: biz.planId },
        );
        await prisma.invoice.updateMany({
            where: { subscriptionId },
            data: { status: "PAID", paidAt: new Date() },
        });
        const sub = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: subscriptionId },
        });
        return { contactId, subscriptionId, renewal: sub.currentPeriodEnd };
    }

    /** {@link member} with ACTIVE UPI autopay up to `limitCents`. */
    async function autopayMember(biz: Biz, limitCents = 180_000) {
        const who = await member(biz);
        const view = await setups.createSetup({
            organizationId: biz.owner.organizationId,
            subscriptionId: who.subscriptionId,
            method: "UPI",
            maxAmountCents: limitCents,
        });
        const setup = fake.authorise(`fake_setup_${view.mandateId}`);
        await webhook(biz.owner, {
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: {
                status: "ACTIVE",
                setupReference: setup.setupReference,
                providerMandateId: setup.providerMandateId,
                method: "UPI",
            },
        });
        return who;
    }

    function setTiming(biz: Biz, timing: AutopayChargeTiming) {
        return subscriptions.updateSettings(biz.owner, {
            autopayChargeTiming: timing,
        });
    }

    /** The renewal day: the job renews it an hour after the period ends. */
    async function renew(who: { subscriptionId: string; renewal: Date }) {
        clock.now = new Date(who.renewal.getTime() + HOUR);
        const outcome = await subscriptions.renewOne(
            who.subscriptionId,
            clock.now,
        );
        const invoice = await prisma.invoice.findFirst({
            where: {
                subscriptionId: who.subscriptionId,
                periodStart: who.renewal,
                status: { notIn: ["VOID", "CREDITED"] },
            },
        });
        return { outcome, invoice };
    }

    /** Two days before (plus an hour): the job's early pass. */
    function earlyPass(renewal: Date) {
        clock.now = new Date(renewal.getTime() - 2 * DAY + HOUR);
        return renewals.renewEarly(clock.now);
    }

    /** The waiting jobs of `type` about `invoiceId` (payload `invoiceId`). */
    function jobsAbout(
        organizationId: string,
        type: string,
        invoiceId: string,
    ) {
        return prisma.job.findMany({
            where: {
                organizationId,
                type,
                status: "PENDING",
                payload: { path: ["invoiceId"], equals: invoiceId },
            },
            orderBy: { createdAt: "asc" },
        });
    }

    /** Run the charge's steps due by the clock, as the worker would. */
    async function runCharges(organizationId: string, invoiceId: string) {
        const due = (
            await jobsAbout(organizationId, SUBSCRIPTION_CHARGE_TYPE, invoiceId)
        ).filter((j) => j.runAt.getTime() <= clock.now.getTime());
        for (const job of due) {
            await prisma.job.update({
                where: { id: job.id },
                data: { status: "DONE" },
            });
            await chargeHandler.run(
                organizationId,
                job.payload as never,
                clock.now,
            );
        }
        return due.map((j) => (j.payload as { step: string }).step);
    }

    /** Prepare, deliver the notice, debit: the charge as far as the bank. */
    async function chargeToBank(biz: Biz, invoiceId: string) {
        const org = biz.owner.organizationId;
        await runCharges(org, invoiceId);
        const intent = await prisma.paymentIntent.findFirstOrThrow({
            where: { invoiceId, viaMandateId: { not: null } },
            orderBy: { createdAt: "desc" },
        });
        const orderId = intent.providerIntentId ?? "";
        fake.settlePreDebit(orderId, "DELIVERED");
        await webhook(biz.owner, {
            eventType: "order.notification.delivered",
            outcome: "PRE_DEBIT",
            providerIntentId: orderId,
            preDebitStatus: "DELIVERED",
        });
        clock.now = new Date(clock.now.getTime() + 27 * HOUR);
        await runCharges(org, invoiceId);
        return { intentId: intent.id, orderId };
    }

    /** Mark a job taken and run it with `run`, as the worker would. */
    async function runJob(job: Job, run: (job: Job) => Promise<void>) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
        await run(job);
    }

    /** Hand every waiting email of the business to the fake provider. */
    async function deliverEmails(organizationId: string) {
        const jobs = await prisma.job.findMany({
            where: {
                organizationId,
                type: "message.send",
                status: "PENDING",
            },
            orderBy: { createdAt: "asc" },
        });
        for (const job of jobs) await runJob(job, mail.handle);
        return jobs;
    }

    return {
        fake,
        email,
        clock,
        comms,
        invoices,
        sending,
        subscriptions,
        autoSend,
        notices,
        reset,
        business,
        member,
        autopayMember,
        setTiming,
        renew,
        earlyPass,
        webhook,
        jobsAbout,
        runCharges,
        chargeToBank,
        runJob,
        deliverEmails,
    };
}
