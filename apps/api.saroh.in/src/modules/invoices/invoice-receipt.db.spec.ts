/**
 * The automatic receipt (DEC-173, owner 20 Oct; U5 #1117) against a real
 * Postgres: every payment recorded on an invoice's ledger queues one
 * `invoice.receipt` job, held past the Undo window; its handler emails the
 * receipt through the business's own provider with this payment, what is
 * paid so far and what is left; Undo takes it back; a job run twice emails
 * once; with no provider (or no address, or email turned off) nothing is
 * queued and nothing is sent; a cheque's receipt waits for the bank; and
 * online and autopay payments get theirs too.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (for the credential key).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MESSAGE_SEND_TYPE } from "../communications/message-send.handler";
import { recordOnlinePaymentInTx } from "./invoice-ledger";
import { RECEIPT_HOLD_MS } from "./invoice-payment-events";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { INVOICE_RECEIPT_TYPE } from "./invoice-receipt";
import { InvoiceReceiptHandler } from "./invoice-receipt.handler";

const comms = new CommunicationsService();
const payments = new InvoicePaymentsService();
const handler = new InvoiceReceiptHandler(comms);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const DAY = 24 * 60 * 60 * 1000;

let rye: OrganizationContext;
let quiet: OrganizationContext;

async function business(
    name: string,
    email: boolean,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("receipt") },
    });
    const ctx = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    if (email) {
        await comms.connectProvider(ctx, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    return ctx;
}

/** An issued invoice for Vivek, with a contact, for `total`. */
async function issued(
    ctx: OrganizationContext,
    total: string,
    over: { billToEmail?: string | null } = {},
): Promise<{ id: string; contactId: string }> {
    const email = `vivek.nair.${++n}@example.com`;
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            firstName: "Vivek",
            lastName: "Nair",
            email,
        },
    });
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: uniq("RC/26-27"),
            status: "ISSUED",
            currency: "INR",
            subtotal: total,
            total,
            contactId: contact.id,
            billToName: "Vivek Nair",
            billToEmail:
                over.billToEmail === undefined ? email : over.billToEmail,
            issuedAt: new Date(),
            dueAt: new Date(Date.now() + 7 * DAY),
            source: "MANUAL",
        },
        select: { id: true },
    });
    return { id: row.id, contactId: contact.id };
}

const receiptJobs = (organizationId: string) =>
    prisma.job.findMany({
        where: { organizationId, type: INVOICE_RECEIPT_TYPE },
        orderBy: { createdAt: "asc" },
    });

const receiptsFor = (invoiceId: string) =>
    prisma.message.findMany({
        where: { invoiceId, template: "INVOICE_PAYMENT_RECEIVED" },
    });

/** The job for one payment, as the worker would hand it over. */
async function jobOf(organizationId: string, paymentId: string): Promise<Job> {
    const job = (await receiptJobs(organizationId)).find(
        (j) => (j.payload as { paymentId?: string }).paymentId === paymentId,
    );
    if (!job) throw new Error("no receipt job");
    return job;
}

beforeAll(async () => {
    rye = await business("Rye & Co.", true);
    quiet = await business("Pulse Fitness", false);
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("a recorded payment queues its receipt", () => {
    it("holds it past the Undo window, then emails this payment, paid so far and left to pay", async () => {
        const { id } = await issued(rye, "8400.00");
        const before = Date.now();
        const recorded = await payments.record(rye, id, {
            method: "CASH",
            amount: "4000",
        });
        const paymentId = recorded.recorded.paymentId;

        const job = await jobOf(rye.organizationId, paymentId);
        expect(job).toMatchObject({
            status: "PENDING",
            organizationId: rye.organizationId,
            payload: { paymentId },
        });
        expect(job.runAt.getTime()).toBeGreaterThanOrEqual(
            before + RECEIPT_HOLD_MS - 1000,
        );
        // Nothing has gone while the Undo window is open.
        expect(await receiptsFor(id)).toHaveLength(0);

        await handler.handle(job);

        const [receipt] = await receiptsFor(id);
        expect(receipt).toMatchObject({
            status: "QUEUED",
            createdByUserId: null,
        });
        expect(receipt!.toAddress).toMatch(/^vivek\.nair\.\d+@example\.com$/);
        expect(receipt!.subject).toBe("Receipt for ₹4,000 from Rye & Co.");
        expect(receipt!.body).toContain("payment of ₹4,000 in cash");
        expect(receipt!.body).toContain("Paid so far: ₹4,000 of ₹8,400");
        expect(receipt!.body).toContain("Left to pay: ₹4,400");
        // Through the business's provider, with the invoice's PDF.
        const send = await prisma.job.findFirst({
            where: {
                type: MESSAGE_SEND_TYPE,
                organizationId: rye.organizationId,
            },
            orderBy: { createdAt: "desc" },
        });
        expect(send?.payload).toMatchObject({
            messageId: receipt!.id,
            attach: "INVOICE_PDF",
        });
        const payment = await prisma.invoicePayment.findUniqueOrThrow({
            where: { id: paymentId },
        });
        expect(payment.receiptMessageId).toBe(receipt!.id);
    });

    it("says paid in full on the payment that settles it", async () => {
        const { id } = await issued(rye, "2500.00");
        await payments.record(rye, id, { method: "UPI", amount: "1000" });
        const last = await payments.record(rye, id, { method: "UPI" });
        await handler.handle(
            await jobOf(rye.organizationId, last.recorded.paymentId),
        );
        const [receipt] = await receiptsFor(id);
        expect(receipt!.body).toContain("payment of ₹1,500 by UPI");
        expect(receipt!.body).toContain("is now paid in full (₹2,500)");
    });

    it("never emails twice: a retried job, or two runs at once, send one receipt", async () => {
        const { id } = await issued(rye, "1200.00");
        const recorded = await payments.record(rye, id, { method: "CARD" });
        const job = await jobOf(
            rye.organizationId,
            recorded.recorded.paymentId,
        );

        await Promise.all([handler.handle(job), handler.handle(job)]);
        await handler.handle(job);

        expect(await receiptsFor(id)).toHaveLength(1);
    });
});

describe("Undo", () => {
    it("takes the waiting receipt back, and a stale run of it sends nothing", async () => {
        const { id } = await issued(rye, "3000.00");
        const recorded = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        const paymentId = recorded.recorded.paymentId;
        const job = await jobOf(rye.organizationId, paymentId);

        await payments.remove(rye, id, paymentId, {});

        expect(await prisma.job.count({ where: { id: job.id } })).toBe(0);
        // A worker that had already claimed it still sends nothing.
        await handler.handle(job);
        expect(await receiptsFor(id)).toHaveLength(0);
    });

    it("leaves another payment's receipt on the same invoice alone", async () => {
        const { id } = await issued(rye, "3000.00");
        const kept = await payments.record(rye, id, {
            method: "CASH",
            amount: "1000",
        });
        const undone = await payments.record(rye, id, {
            method: "UPI",
            amount: "500",
        });
        await payments.remove(rye, id, undone.recorded.paymentId, {});

        const left = (await receiptJobs(rye.organizationId)).filter(
            (j) =>
                (j.payload as { paymentId?: string }).paymentId ===
                kept.recorded.paymentId,
        );
        expect(left).toHaveLength(1);
    });
});

describe("no provider, no address, email off: nothing is sent", () => {
    it("queues nothing for a business with no email provider, and a stray job sends nothing", async () => {
        const { id } = await issued(quiet, "1500.00");
        const recorded = await payments.record(quiet, id, { method: "CASH" });

        expect(await receiptJobs(quiet.organizationId)).toHaveLength(0);

        const stray = await prisma.job.create({
            data: {
                organizationId: quiet.organizationId,
                type: INVOICE_RECEIPT_TYPE,
                payload: { paymentId: recorded.recorded.paymentId },
            },
        });
        await handler.handle(stray);
        expect(await receiptsFor(id)).toHaveLength(0);
        expect(
            await prisma.message.count({
                where: { organizationId: quiet.organizationId },
            }),
        ).toBe(0);
    });

    it("sends nothing when the provider was disconnected before the job ran", async () => {
        const later = await business("Kavi Dental", true);
        const { id } = await issued(later, "900.00");
        const recorded = await payments.record(later, id, { method: "CASH" });
        const job = await jobOf(
            later.organizationId,
            recorded.recorded.paymentId,
        );

        await prisma.communicationProvider.updateMany({
            where: { organizationId: later.organizationId },
            data: { status: "DISABLED" },
        });
        await handler.handle(job);

        expect(await receiptsFor(id)).toHaveLength(0);
    });

    it("queues nothing with no address to send to", async () => {
        const { id } = await issued(rye, "700.00", { billToEmail: null });
        const before = (await receiptJobs(rye.organizationId)).length;
        await payments.record(rye, id, { method: "CASH" });
        expect(await receiptJobs(rye.organizationId)).toHaveLength(before);
    });

    it("queues nothing when the customer turned email off", async () => {
        const { id, contactId } = await issued(rye, "650.00");
        await prisma.consent.create({
            data: {
                organizationId: rye.organizationId,
                contactId,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
        const before = (await receiptJobs(rye.organizationId)).length;
        await payments.record(rye, id, { method: "CASH" });
        expect(await receiptJobs(rye.organizationId)).toHaveLength(before);
    });
});

describe("a cheque's receipt waits for the bank", () => {
    it("queues nothing while it waits, and sends when it is in the bank", async () => {
        const { id } = await issued(rye, "8400.00");
        const recorded = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004512",
            chequeBank: "HDFC Bank",
        });
        const paymentId = recorded.recorded.paymentId;
        await expect(jobOf(rye.organizationId, paymentId)).rejects.toThrow(
            "no receipt job",
        );

        await payments.cleared(rye, id, paymentId, {});
        await handler.handle(await jobOf(rye.organizationId, paymentId));

        const [receipt] = await receiptsFor(id);
        expect(receipt!.body).toContain("payment of ₹8,400 by cheque");
        expect(receipt!.body).toContain("is now paid in full");
    });

    it("sends nothing for a cheque that bounced", async () => {
        const { id } = await issued(rye, "500.00");
        const recorded = await payments.record(rye, id, {
            method: "CHEQUE",
            chequeNumber: "004513",
            chequeBank: "HDFC Bank",
        });
        await payments.bounced(rye, id, recorded.recorded.paymentId, {});
        expect(
            (await receiptJobs(rye.organizationId)).filter(
                (j) =>
                    (j.payload as { paymentId?: string }).paymentId ===
                    recorded.recorded.paymentId,
            ),
        ).toHaveLength(0);
    });
});

describe("online payments and autopay charges get their receipt too", () => {
    it("queues one for money that came through a payment intent", async () => {
        const { id } = await issued(rye, "1800.00");
        const intent = await prisma.paymentIntent.create({
            data: {
                organizationId: rye.organizationId,
                invoiceId: id,
                provider: "RAZORPAY",
                amountCents: 180000,
                currency: "INR",
                status: "SUCCEEDED",
            },
        });
        const outcome = await prisma.$transaction((tx) =>
            recordOnlinePaymentInTx(tx, rye.organizationId, id, {
                paymentIntentId: intent.id,
                amountCents: 180000,
                reference: "pay_test_1",
                note: "Paid online through Razorpay",
                receivedAt: new Date(),
            }),
        );
        expect(outcome).toMatchObject({ applied: true, paid: true });
        const payment = await prisma.invoicePayment.findUniqueOrThrow({
            where: { paymentIntentId: intent.id },
        });

        await handler.handle(await jobOf(rye.organizationId, payment.id));
        const [receipt] = await receiptsFor(id);
        expect(receipt!.body).toContain("payment of ₹1,800 online");
    });
});
