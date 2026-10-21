/**
 * eMandate autopay tells the customer before each debit, or doesn't debit
 * (DEC-180, #1175), against a real Postgres with the fake payment, webhook
 * and email providers and the clock moved by hand:
 *
 * - the charge, once prepared, queues `AUTOPAY_PRE_DEBIT` (keyed to the
 *   charge) 26 hours before its debit, never less than that after;
 * - sent through the business's own provider, it says "₹1,200.00 will be
 *   taken from your bank account on ‹day›", and the debit follows;
 * - an email that went late moves the debit to a day after it;
 * - not sent (no provider, no address, email turned off, never gone): no
 *   debit that period, NOT_CHARGED_NO_NOTICE with why, the renewal invoice
 *   sent as without autopay, and no "payment failed" anywhere;
 * - a job run twice sends once and debits once;
 * - card and UPI are as before: no Saroh email.
 *
 * Only the app env is stubbed (for the credential key and the renderer).
 * Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { prisma } from "@saroh/database";

import { HOUR, renewalHarness } from "../../../test/fixtures/renewal-notices";
import { dayWords } from "../../common/words-format";
import { businessTimezone } from "../bookings/staff-availability";
import { INVOICE_AUTO_SEND_TYPE } from "../invoices/invoice-auto-send";
import { chargeUnderWayOn } from "../payments/charge-under-way";
import type { MandateMethod } from "../payments/providers/provider.port";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import type { ChargeJobPayload } from "./charge-job";

const h = renewalHarness();

beforeEach(() => h.reset());

type Biz = Awaited<ReturnType<typeof h.business>>;

const noticeJobs = (org: string, invoiceId: string) =>
    h.jobsAbout(org, CUSTOMER_NOTIFY_TYPE, invoiceId);

const charges = () => h.fake.mandateCalls.filter((c) => c.op === "charge");

const intentOf = (invoiceId: string) =>
    prisma.paymentIntent.findFirstOrThrow({
        where: { invoiceId, viaMandateId: { not: null } },
        orderBy: { createdAt: "desc" },
    });

const eventsOf = (subscriptionId: string) =>
    prisma.subscriptionEvent.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: "asc" },
    });

/** A member paying by `method`, renewed, and the charge prepared. */
async function prepared(biz: Biz, method: MandateMethod = "EMANDATE") {
    const org = biz.owner.organizationId;
    const who = await h.autopayMember(biz, 180_000, method);
    const { invoice } = await h.renew(who);
    const invoiceId = invoice!.id;
    const preparedAt = h.clock.now;
    expect(await h.runCharges(org, invoiceId)).toEqual(["PREPARE"]);
    const intent = await intentOf(invoiceId);
    return { org, who, invoiceId, intent, preparedAt };
}

/** Run the waiting pre-debit notice now, and hand its email over. */
async function sendNotice(org: string, invoiceId: string) {
    const jobs = await noticeJobs(org, invoiceId);
    for (const job of jobs) await h.runJob(job, h.notices.handle);
    await h.deliverEmails(org);
    return jobs;
}

const preDebitMessages = (org: string) =>
    prisma.message.findMany({
        where: { organizationId: org, template: "AUTOPAY_PRE_DEBIT" },
    });

/** The clock to the planned debit, and the debit step run. */
async function atDebit(org: string, invoiceId: string, debitAfter: Date) {
    h.clock.now = new Date(debitAfter.getTime() + 60_000);
    return h.runCharges(org, invoiceId);
}

describe("an eMandate charge is announced by Saroh (DEC-180)", () => {
    it("queues one notice a day ahead, keyed to the charge, and debits after it went", async () => {
        const biz = await h.business();
        const { org, who, invoiceId, intent, preparedAt } = await prepared(biz);

        // Never sooner than 26 hours after the prepare, though the
        // provider would take it at once.
        expect(intent.preDebitStatus).toBe("NOT_NEEDED");
        expect(intent.debitAfter!.getTime()).toBeGreaterThanOrEqual(
            preparedAt.getTime() + 26 * HOUR,
        );
        const [job] = await noticeJobs(org, invoiceId);
        expect(job.payload).toEqual({
            kind: "AUTOPAY_PRE_DEBIT",
            eventKey: `pre-debit:${intent.id}`,
            invoiceId,
            paymentIntentId: intent.id,
        });
        expect(job.runAt.getTime()).toBe(
            intent.debitAfter!.getTime() - 26 * HOUR,
        );

        await sendNotice(org, invoiceId);
        const [message] = await preDebitMessages(org);
        const zone = await businessTimezone(prisma, org);
        const day = dayWords(intent.debitAfter!, zone, { weekday: true });
        expect(message).toMatchObject({
            status: "SENT",
            contactId: who.contactId,
            invoiceId,
            subject: `₹1,200 will be taken from your bank account on ${day}`,
        });
        expect(message.body).toContain(
            `₹1,200 will be taken from your bank account on ${day} for Monthly yoga`,
        );
        expect(message.body).toContain("ask Pulse &amp; Co. before then.");
        expect(h.email.calls.at(-1)?.to).toBe(message.toAddress);

        // Not before the planned debit…
        h.clock.now = new Date(intent.debitAfter!.getTime() - HOUR);
        expect(await h.runCharges(org, invoiceId)).toEqual([]);
        // …then debited.
        expect(await atDebit(org, invoiceId, intent.debitAfter!)).toEqual([
            "DEBIT",
        ]);
        expect(charges()).toHaveLength(1);
        expect((await intentOf(invoiceId)).status).toBe("PROCESSING");
        expect(
            (await eventsOf(who.subscriptionId)).map((e) => e.kind),
        ).not.toContain("NOT_CHARGED_NO_NOTICE");
    });

    it("an email that went late moves the debit a full day after it", async () => {
        const biz = await h.business();
        const { org, invoiceId, intent } = await prepared(biz);
        await sendNotice(org, invoiceId);
        const [message] = await preDebitMessages(org);
        const sentAt = new Date(intent.debitAfter!.getTime() - 2 * HOUR);
        await prisma.message.update({
            where: { id: message.id },
            data: { updatedAt: sentAt },
        });

        expect(await atDebit(org, invoiceId, intent.debitAfter!)).toEqual([
            "DEBIT",
        ]);
        expect(charges()).toHaveLength(0);
        const [waiting] = await h.jobsAbout(
            org,
            "subscription.charge",
            invoiceId,
        );
        expect(waiting.runAt.getTime()).toBe(sentAt.getTime() + 24 * HOUR);
        expect((await intentOf(invoiceId)).status).toBe("REQUIRES_PAYMENT");

        h.clock.now = new Date(sentAt.getTime() + 24 * HOUR);
        expect(await h.runCharges(org, invoiceId)).toEqual(["DEBIT"]);
        expect(charges()).toHaveLength(1);
    });

    it("a job run twice queues one notice, sends one email and debits once", async () => {
        const biz = await h.business();
        const { org, invoiceId, intent } = await prepared(biz);
        const payload = (
            await h.jobsAbout(org, "subscription.charge", invoiceId)
        )[0]!.payload as unknown as ChargeJobPayload;
        // PREPARE delivered again: the order is found, nothing doubles.
        await h.chargeHandler.run(
            org,
            { ...payload, step: "PREPARE" },
            h.clock.now,
        );
        expect(await noticeJobs(org, invoiceId)).toHaveLength(1);

        // The notice's job run twice: one email.
        const [job] = await noticeJobs(org, invoiceId);
        await h.runJob(job, h.notices.handle);
        await h.notices.handle(job);
        await h.deliverEmails(org);
        expect(await preDebitMessages(org)).toHaveLength(1);
        expect(h.email.calls).toHaveLength(1);

        // The debit run twice: one debit.
        h.clock.now = new Date(intent.debitAfter!.getTime() + 60_000);
        await h.chargeHandler.run(org, payload, h.clock.now);
        await h.chargeHandler.run(org, payload, h.clock.now);
        expect(charges()).toHaveLength(1);
    });
});

describe("no notice, no debit (DEC-180)", () => {
    /** The charge's debit came with no notice gone: what it left. */
    async function notTold(
        biz: Biz,
        prepare?: (who: { contactId: string }) => Promise<void>,
    ) {
        const org = biz.owner.organizationId;
        const who = await h.autopayMember(biz, 180_000, "EMANDATE");
        await prepare?.(who);
        const { invoice } = await h.renew(who);
        const invoiceId = invoice!.id;
        expect(await h.runCharges(org, invoiceId)).toEqual(["PREPARE"]);
        const intent = await intentOf(invoiceId);
        await sendNotice(org, invoiceId);
        expect(await atDebit(org, invoiceId, intent.debitAfter!)).toEqual([
            "DEBIT",
        ]);
        expect(charges()).toHaveLength(0);
        const after = await intentOf(invoiceId);
        expect(after.status).toBe("CANCELLED");
        expect(await chargeUnderWayOn(prisma, org, invoiceId)).toBeNull();
        const events = await eventsOf(who.subscriptionId);
        const kinds = events.map((e) => e.kind);
        // Not a decline: no "payment failed" for the team or the customer.
        expect(kinds).not.toContain("RENEWAL_FAILED");
        expect(
            await prisma.job.count({
                where: {
                    organizationId: org,
                    type: "team.alert",
                    payload: {
                        path: ["paymentIntentId"],
                        equals: intent.id,
                    },
                },
            }),
        ).toBe(0);
        expect(
            (await noticeJobs(org, invoiceId)).filter(
                (j) =>
                    (j.payload as { kind: string }).kind === "AUTOPAY_FAILED",
            ),
        ).toHaveLength(0);
        const told = events.filter((e) => e.kind === "NOT_CHARGED_NO_NOTICE");
        expect(told).toHaveLength(1);
        expect(told[0]).toMatchObject({ actorKind: "JOB", invoiceId });
        const sends = await h.jobsAbout(org, INVOICE_AUTO_SEND_TYPE, invoiceId);
        return { org, who, invoiceId, intent, reason: told[0].data, sends };
    }

    it("no email provider: not debited, the team sees why, and the renewal invoice takes U10's path", async () => {
        const biz = await h.business({ email: false });
        const { reason, sends } = await notTold(biz);
        expect(reason).toEqual({ reason: "NO_EMAIL_PROVIDER" });
        expect(sends).toHaveLength(1);
        // U10's send runs, and can't email either: noted on the invoice.
        expect(
            await h.autoSend.run(
                biz.owner.organizationId,
                sends[0].payload as never,
            ),
        ).toBe("REFUSED");
    });

    it("a notice that never went (provider connected): the renewal invoice is emailed to them to pay", async () => {
        const biz = await h.business();
        const org = biz.owner.organizationId;
        const who = await h.autopayMember(biz, 180_000, "EMANDATE");
        const { invoice } = await h.renew(who);
        const invoiceId = invoice!.id;
        await h.runCharges(org, invoiceId);
        const intent = await intentOf(invoiceId);
        // The worker never got to it.
        expect(await atDebit(org, invoiceId, intent.debitAfter!)).toEqual([
            "DEBIT",
        ]);
        expect(charges()).toHaveLength(0);
        expect(
            (await eventsOf(who.subscriptionId)).find(
                (e) => e.kind === "NOT_CHARGED_NO_NOTICE",
            )?.data,
        ).toEqual({ reason: "NOT_SENT" });
        // Taken back: it would announce a debit that won't happen.
        expect(await noticeJobs(org, invoiceId)).toHaveLength(0);

        const [send] = await h.jobsAbout(
            org,
            INVOICE_AUTO_SEND_TYPE,
            invoiceId,
        );
        expect(await h.autoSend.run(org, send.payload as never)).toBe("SENT");
        await h.deliverEmails(org);
        expect(
            await prisma.message.count({
                where: {
                    organizationId: org,
                    invoiceId,
                    template: "INVOICE_SENT",
                    status: "SENT",
                },
            }),
        ).toBe(1);
    });

    it("the customer turned email off: not debited, EMAIL_OFF", async () => {
        const biz = await h.business();
        const { reason, sends } = await notTold(biz, async (who) => {
            await prisma.consent.create({
                data: {
                    organizationId: biz.owner.organizationId,
                    contactId: who.contactId,
                    channel: "EMAIL",
                    status: "REVOKED",
                },
            });
        });
        expect(reason).toEqual({ reason: "EMAIL_OFF" });
        expect(sends).toHaveLength(1);
        const [message] = await preDebitMessages(biz.owner.organizationId);
        expect(message.status).toBe("SUPPRESSED");
    });

    it("no email address: not debited, NO_EMAIL_ADDRESS", async () => {
        const biz = await h.business();
        const { reason } = await notTold(biz, async (who) => {
            await prisma.contact.update({
                where: { id: who.contactId },
                data: { email: "" },
            });
        });
        expect(reason).toEqual({ reason: "NO_EMAIL_ADDRESS" });
    });

    it("renewal invoices switched off: not debited, and nothing is sent instead", async () => {
        const biz = await h.business({ email: false });
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: biz.owner.organizationId,
                kind: "RENEWAL_INVOICE",
                enabled: false,
            },
        });
        const { sends } = await notTold(biz);
        expect(sends).toHaveLength(0);
    });

    it("the debit step run again writes nothing more", async () => {
        const biz = await h.business({ email: false });
        const { org, who, invoiceId, intent } = await notTold(biz);
        await h.chargeHandler.run(
            org,
            {
                invoiceId,
                mandateId: who.mandateId,
                key: intent.idempotencyKey!,
                step: "DEBIT",
                tries: 0,
            },
            h.clock.now,
        );
        expect(
            (await eventsOf(who.subscriptionId)).filter(
                (e) => e.kind === "NOT_CHARGED_NO_NOTICE",
            ),
        ).toHaveLength(1);
        expect(
            await h.jobsAbout(org, INVOICE_AUTO_SEND_TYPE, invoiceId),
        ).toHaveLength(1);
        expect(charges()).toHaveLength(0);
    });
});

describe("card and UPI are unchanged (DEC-180)", () => {
    it("UPI: Razorpay's notice, no Saroh email", async () => {
        const biz = await h.business();
        const { org, invoiceId, intent } = await prepared(biz, "UPI");
        expect(intent.preDebitStatus).toBe("PENDING");
        expect(await noticeJobs(org, invoiceId)).toHaveLength(0);
    });

    it("card: debited as soon as it is prepared, no Saroh email", async () => {
        const biz = await h.business();
        const { org, invoiceId } = await prepared(biz, "CARD");
        expect(await noticeJobs(org, invoiceId)).toHaveLength(0);
        expect(await h.runCharges(org, invoiceId)).toEqual(["DEBIT"]);
        expect(charges()).toHaveLength(1);
        expect(await preDebitMessages(org)).toHaveLength(0);
    });
});
