/**
 * An invoice's history (automatic notices U9 #1140, DEC-174) against a
 * real Postgres:
 *
 *  - issue, send, remind and void write four events, each with the
 *    person's name, in order;
 *  - an automatic send or reminder is Saroh's, "sent automatically";
 *  - an email the provider refused for good is a failed send, once, and an
 *    attempt that will be retried is not;
 *  - credit, credit and rewrite, reissue, a new link and an invoice issued
 *    by another module each write theirs;
 *  - the history read merges shares and payments, hides amounts without
 *    `payment:read`, tells an older invoice from its own dates and emails,
 *    and refuses another business's invoice.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { NotFoundException } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import {
    readInvoiceEvents,
    readInvoiceHistory,
    recordInvoiceEvent,
    recordInvoiceSendFailed,
} from "./invoice-events";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";

const comms = new CommunicationsService();
const payments = new InvoicePaymentsService();
const invoices = new InvoicesService(payments);
const sending = new InvoiceSendService(invoices, comms);
const GSTIN = "29AAGCR4375J1ZU";
const DAY_MS = 24 * 60 * 60 * 1000;

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;

let ravi: string;
let pulse: OrganizationContext; // not registered: voids
let rye: OrganizationContext; // GST-registered: credits
let pulseContact: string;
let ryeContact: string;

async function business(
    name: string,
    registered: boolean,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("invoice-events") },
    });
    if (registered) {
        await prisma.businessProfile.create({
            data: {
                organizationId: org.id,
                gstRegistered: true,
                gstState: "29",
                taxId: GSTIN,
                invoicePrefix: "RC",
            },
        });
    }
    await giveBusinessDetails(org.id);
    return { organizationId: org.id, userId: ravi, role: "OWNER" };
}

async function contact(ctx: OrganizationContext): Promise<string> {
    const row = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            email: "asha@example.com",
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    return row.id;
}

async function issued(
    ctx: OrganizationContext,
    contactId: string,
): Promise<string> {
    const draft = await invoices.createDraft(ctx, {
        contactId,
        currency: "INR",
        lines: [
            {
                description: "Monthly membership",
                quantity: 1,
                unitPrice: "2400",
                gstRate: "18",
            },
        ],
    });
    await invoices.issue(ctx, draft.id);
    return draft.id;
}

/** Move an invoice's events and emails back, so the next send may go. */
async function backdate(invoiceId: string, days: number): Promise<void> {
    const at = new Date(Date.now() - days * DAY_MS);
    await prisma.invoiceEvent.updateMany({
        where: { invoiceId },
        data: { createdAt: at },
    });
    await prisma.message.updateMany({
        where: { invoiceId },
        data: { createdAt: at },
    });
}

const kindsOf = async (ctx: OrganizationContext, invoiceId: string) =>
    (await readInvoiceEvents(prisma, ctx.organizationId, invoiceId)).map(
        (e) => e.kind,
    );

async function jobFor(messageId: string): Promise<Job> {
    const jobs = await prisma.job.findMany({ where: { type: "message.send" } });
    const job = jobs.find(
        (j) => (j.payload as { messageId?: string }).messageId === messageId,
    );
    if (!job) throw new Error("no job");
    return job;
}

beforeAll(async () => {
    ravi = (
        await prisma.user.create({
            data: { email: `${uniq("ravi")}@example.com`, name: "Ravi Kumar" },
        })
    ).id;
    pulse = await business("Pulse Fitness", false);
    rye = await business("Rye & Co.", true);
    pulseContact = await contact(pulse);
    ryeContact = await contact(rye);
    await comms.connectProvider(pulse, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@pulse.example",
        credentials: { apiKey: "re_test_key" },
    });
});

describe("an invoice's history (real database)", () => {
    it("writes issue, send, remind and void with Ravi's name, in order", async () => {
        const id = await issued(pulse, pulseContact);
        await backdate(id, 3);
        await sending.send(pulse, id);
        await backdate(id, 2);
        await sending.remind(pulse, id);
        await invoices.voidInvoice(pulse, id, { reason: "Billed twice" });

        const events = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            id,
        );
        expect(events.map((e) => e.kind)).toEqual([
            "VOIDED",
            "REMINDED",
            "SENT",
            "ISSUED",
        ]);
        for (const e of events) {
            expect(e.actor).toEqual({
                kind: "USER",
                userId: ravi,
                name: "Ravi Kumar",
            });
        }
        const [voided, reminded, sent] = events;
        expect(voided?.reason).toBe("Billed twice");
        expect(sent).toMatchObject({
            channel: "EMAIL",
            to: "asha@example.com",
            status: "QUEUED",
            thread: false,
        });
        expect(sent?.messageId).toEqual(expect.any(String));
        expect(reminded?.messageId).not.toBe(sent?.messageId);

        // The read: the events tell the sends, so their emails aren't
        // told twice, and the dates aren't either.
        const history = await readInvoiceHistory(pulse, id);
        expect(history.map((h) => `${h.source}:${h.kind}`)).toEqual([
            "EVENT:VOIDED",
            "EVENT:REMINDED",
            "EVENT:SENT",
            "EVENT:ISSUED",
        ]);

        // And the invoice read serves the same events.
        const read = await sending.readFor(pulse.organizationId, id);
        expect(read.events.map((e) => e.kind)).toEqual([
            "VOIDED",
            "REMINDED",
            "SENT",
            "ISSUED",
        ]);
    });

    it("says an automatic send and reminder were Saroh's", async () => {
        const id = await issued(pulse, pulseContact);
        await sending.send(pulse, id, { automatic: true });
        await backdate(id, 2);
        await sending.remind(pulse, id, undefined, { automatic: true });

        const events = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            id,
        );
        expect(events.map((e) => [e.kind, e.actor])).toEqual([
            ["AUTO_REMINDED", { kind: "JOB", userId: null, name: null }],
            ["AUTO_SENT", { kind: "JOB", userId: null, name: null }],
            ["ISSUED", { kind: "USER", userId: ravi, name: "Ravi Kumar" }],
        ]);
    });

    it("writes nothing for a send that was refused", async () => {
        const id = await issued(pulse, pulseContact);
        await sending.send(pulse, id);
        // Sent already: a second Send is a 409, and no second line.
        await expect(sending.send(pulse, id)).rejects.toThrow(/been sent/);
        expect(await kindsOf(pulse, id)).toEqual(["SENT", "ISSUED"]);
    });

    it("tells an email the provider refused for good as a failed send, once", async () => {
        const id = await issued(pulse, pulseContact);
        await sending.send(pulse, id);
        const message = await prisma.message.findFirstOrThrow({
            where: { invoiceId: id },
        });
        const job = await jobFor(message.id);
        const refused = new MessageSendHandler(
            new FakeCommsProviderFactory(
                new FakeCommsProvider("EMAIL", new Error("provider 550")),
            ),
        );

        // An attempt that will be tried again isn't a failed send yet.
        await expect(refused.handle({ ...job, attempts: 0 })).rejects.toThrow();
        expect(await kindsOf(pulse, id)).toEqual(["SENT", "ISSUED"]);

        // The last attempt is, and only once however often it runs.
        const last = { ...job, attempts: job.maxAttempts - 1 };
        await expect(refused.handle(last)).rejects.toThrow();
        await expect(refused.handle(last)).rejects.toThrow();
        const events = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            id,
        );
        expect(events.map((e) => e.kind)).toEqual([
            "SEND_FAILED",
            "SENT",
            "ISSUED",
        ]);
        expect(events[0]).toMatchObject({
            actor: { kind: "JOB" },
            channel: "EMAIL",
            messageId: message.id,
            to: "asha@example.com",
            template: "INVOICE_SENT",
        });
    });

    it("writes nothing for a failed email that isn't an invoice's", async () => {
        const id = await issued(pulse, pulseContact);
        const message = await prisma.message.create({
            data: {
                organizationId: pulse.organizationId,
                channel: "EMAIL",
                toAddress: "asha@example.com",
                body: "See you at 10",
                template: "BOOKING_CONFIRMED",
                status: "FAILED",
                invoiceId: id,
            },
        });
        await recordInvoiceSendFailed(message.id);
        await recordInvoiceSendFailed("msg_does_not_exist");
        expect(await kindsOf(pulse, id)).toEqual(["ISSUED"]);
    });

    it("writes a new link by hand, and says when it only shows the invoice", async () => {
        const id = await issued(pulse, pulseContact);
        await invoices.createViewLink(pulse, id);
        const [made] = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            id,
        );
        expect(made).toMatchObject({
            kind: "LINK_MADE",
            view: true,
            actor: { kind: "USER", name: "Ravi Kumar" },
        });
    });

    it("writes the void and the rewrite of a reissue", async () => {
        const id = await issued(pulse, pulseContact);
        const draft = await invoices.reissue(pulse, id, {
            reason: "Wrong name",
        });
        const events = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            id,
        );
        expect(events.map((e) => e.kind)).toEqual([
            "REISSUED",
            "VOIDED",
            "ISSUED",
        ]);
        expect(events[0]?.draftId).toBe(draft.id);
    });

    it("writes a credit with its credit note, and a credit and rewrite with its draft", async () => {
        const credited = await issued(rye, ryeContact);
        const note = await invoices.credit(rye, credited, {
            reason: "Cancelled order",
        });
        const [credit] = await readInvoiceEvents(
            prisma,
            rye.organizationId,
            credited,
        );
        expect(credit).toMatchObject({
            kind: "CREDITED",
            reason: "Cancelled order",
            creditNoteId: note.id,
            creditNoteNumber: note.number,
            actor: { kind: "USER", name: "Ravi Kumar" },
        });

        const rewritten = await issued(rye, ryeContact);
        const made = await invoices.creditAndRewrite(rye, rewritten, {
            reason: "Wrong rate",
        });
        const events = await readInvoiceEvents(
            prisma,
            rye.organizationId,
            rewritten,
        );
        expect(events.map((e) => e.kind)).toEqual([
            "REISSUED",
            "CREDITED",
            "ISSUED",
        ]);
        expect(events[0]?.draftId).toBe(made.draft.id);
        expect(events[1]?.creditNoteId).toBe(made.creditNote.id);
    });

    it("says an invoice another module issued was issued by its seller, or by Saroh", async () => {
        const [byJob, byPerson] = await prisma.$transaction(async (tx) => [
            await invoices.issueInTx(tx, pulse.organizationId, {
                contactId: pulseContact,
                currency: "INR",
                source: "SUBSCRIPTION",
                lines: [
                    { description: "Renewal", quantity: 1, unitPrice: "900" },
                ],
            }),
            await invoices.issueInTx(tx, pulse.organizationId, {
                contactId: pulseContact,
                currency: "INR",
                source: "PACK",
                createdByUserId: ravi,
                lines: [
                    {
                        description: "10 classes",
                        quantity: 1,
                        unitPrice: "900",
                    },
                ],
            }),
        ]);
        const [job] = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            byJob.id,
        );
        const [person] = await readInvoiceEvents(
            prisma,
            pulse.organizationId,
            byPerson.id,
        );
        expect(job).toMatchObject({ kind: "ISSUED", actor: { kind: "JOB" } });
        expect(person).toMatchObject({
            kind: "ISSUED",
            actor: { kind: "USER", name: "Ravi Kumar" },
        });
    });

    it("merges shares and payments, with amounts only for payment:read", async () => {
        const id = await issued(pulse, pulseContact);
        await prisma.invoiceShare.create({
            data: {
                organizationId: pulse.organizationId,
                invoiceId: id,
                channel: "WHATSAPP",
                kind: "NEW",
                byUserId: ravi,
            },
        });
        await payments.record(pulse, id, { method: "CASH", amount: "1000" });

        const history = await readInvoiceHistory(pulse, id);
        const share = history.find((h) => h.source === "SHARE");
        const paid = history.find((h) => h.source === "PAYMENT");
        expect(share).toMatchObject({
            channel: "WHATSAPP",
            message: "NEW",
            actor: { kind: "USER", name: "Ravi Kumar" },
        });
        expect(paid).toMatchObject({
            kind: "PAYMENT_RECORDED",
            method: "CASH",
            amount: "1000.00",
            currency: "INR",
            actor: { kind: "USER", name: "Ravi Kumar" },
        });
        // No PAID date line beside the ledger's own row.
        expect(history.some((h) => h.source === "DATE")).toBe(false);

        const member = await readInvoiceHistory(
            { ...pulse, role: "MEMBER", actions: new Set(["invoice:read"]) },
            id,
        );
        const memberPaid = member.find((h) => h.source === "PAYMENT");
        expect(memberPaid).toBeDefined();
        expect(memberPaid).not.toHaveProperty("amount");

        // The share on the invoice read names who shared it.
        const read = await sending.readFor(pulse.organizationId, id);
        expect(read.shared[0]).toMatchObject({ byName: "Ravi Kumar" });
    });

    it("tells an older invoice from its own dates, and its emails by who sent them", async () => {
        const issuedAt = new Date("2026-10-02T05:30:00Z");
        const paidAt = new Date("2026-10-09T05:30:00Z");
        const invoice = await prisma.invoice.create({
            data: {
                organizationId: pulse.organizationId,
                number: uniq("INV"),
                status: "PAID",
                currency: "INR",
                subtotal: "2400.00",
                total: "2400.00",
                issuedAt,
                paidAt,
                contactId: pulseContact,
            },
        });
        const email = await prisma.message.create({
            data: {
                organizationId: pulse.organizationId,
                channel: "EMAIL",
                toAddress: "asha@example.com",
                body: "Your invoice",
                template: "INVOICE_SENT",
                status: "SENT",
                invoiceId: invoice.id,
                createdByUserId: ravi,
                createdAt: new Date("2026-10-07T05:12:00Z"),
            },
        });

        const history = await readInvoiceHistory(pulse, invoice.id);
        expect(history).toEqual([
            {
                source: "DATE",
                id: "date:PAID",
                kind: "PAID",
                at: paidAt.toISOString(),
                actor: { kind: "JOB", userId: null, name: null },
            },
            {
                source: "EMAIL",
                id: email.id,
                kind: "SENT",
                at: "2026-10-07T05:12:00.000Z",
                actor: { kind: "USER", userId: ravi, name: "Ravi Kumar" },
                to: "asha@example.com",
                status: "SENT",
            },
            {
                source: "DATE",
                id: "date:ISSUED",
                kind: "ISSUED",
                at: issuedAt.toISOString(),
                actor: { kind: "JOB", userId: null, name: null },
            },
        ]);
    });

    it("refuses another business's invoice, and keeps its events to it", async () => {
        const theirs = await issued(rye, ryeContact);
        await expect(readInvoiceHistory(pulse, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(
            await readInvoiceEvents(prisma, pulse.organizationId, theirs),
        ).toEqual([]);
    });

    it("refuses an event for another business's invoice", async () => {
        const theirs = await issued(rye, ryeContact);
        await expect(
            prisma.$transaction((tx) =>
                recordInvoiceEvent(tx, {
                    organizationId: pulse.organizationId,
                    invoiceId: theirs,
                    kind: "SENT",
                    actor: { kind: "USER", userId: ravi },
                }),
            ),
        ).rejects.toThrow();
    });
});
