/**
 * Remind many, by channel (DEC-173, U5 #1117) against a real Postgres: the
 * preview says how each picked invoice's reminder goes (email when it can,
 * else WhatsApp with a phone, wait when reminded today, else no way, named
 * with why); Send emails the email ones each as `remind` does and sends
 * nothing else; another business's invoices are never touched; a business
 * with no email provider gets WhatsApp or nothing, never Saroh's address;
 * and the limits (100 a call, duplicates once, `invoice:write`).
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

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { reservedPhoneEmail } from "../contacts/contact-email";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceRemindersService } from "./invoice-reminders.service";
import { InvoiceSendService } from "./invoice-send.service";
import { BULK_REMINDER_MAX, BulkRemindersDto } from "./invoice-share.dto";
import { InvoiceShareService } from "./invoice-share.service";
import { InvoicesService } from "./invoices.service";

const comms = new CommunicationsService();
const ledger = new InvoicePaymentsService();
const invoices = new InvoicesService(ledger);
const sending = new InvoiceSendService(invoices, comms);
const reminders = new InvoiceRemindersService(sending);
const shares = new InvoiceShareService(invoices, sending, comms);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const OVERDUE = new Date("2026-10-07T06:30:00.000Z");

async function business(
    name: string,
    email: boolean,
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("remind-many") },
    });
    await giveBusinessDetails(org.id);
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

/** An overdue invoice for a customer with the email and phone given. */
async function owed(
    ctx: OrganizationContext,
    who: {
        first: string;
        email?: string | null;
        phone?: string | null;
        emailOff?: boolean;
        status?: string;
        orderId?: string;
    },
): Promise<string> {
    const email =
        who.email === undefined
            ? `${who.first.toLowerCase()}.${++n}@example.com`
            : who.email;
    // A contact without an email holds a placeholder (DEC-049): no email.
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            firstName: who.first,
            email: email ?? reservedPhoneEmail(),
            phone: who.phone ?? null,
        },
    });
    if (who.emailOff) {
        await prisma.consent.create({
            data: {
                organizationId: ctx.organizationId,
                contactId: contact.id,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
    }
    const status = who.status ?? "ISSUED";
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: status === "DRAFT" ? null : uniq("RC"),
            status,
            currency: "INR",
            subtotal: "2240.00",
            total: "2240.00",
            contactId: contact.id,
            billToName: who.first,
            billToEmail: email,
            issuedAt: status === "DRAFT" ? null : new Date(),
            dueAt: OVERDUE,
            orderId: who.orderId ?? null,
            source: who.orderId ? "ORDER" : "MANUAL",
            ...(status === "PAID"
                ? { paidAt: new Date(), paymentMethod: "CASH" }
                : {}),
        },
        select: { id: true },
    });
    return row.id;
}

const remindersOf = (invoiceId: string) =>
    prisma.message.findMany({
        where: { invoiceId, template: "INVOICE_REMINDER" },
    });

let rye: OrganizationContext;
let pulse: OrganizationContext;
let quiet: OrganizationContext;

beforeAll(async () => {
    rye = await business("Rye & Co.", true);
    pulse = await business("Pulse Fitness", true);
    quiet = await business("Kavi Dental", false);
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("the preview: how each one goes", () => {
    it("6 picked: 3 by email, 2 on WhatsApp (no email; email turned off), 1 waits until tomorrow", async () => {
        const asha = await owed(rye, { first: "Asha" });
        const bina = await owed(rye, { first: "Bina", phone: "+919845011111" });
        const chetan = await owed(rye, { first: "Chetan" });
        const vivek = await owed(rye, {
            first: "Vivek",
            email: null,
            phone: "+919845011234",
        });
        const meera = await owed(rye, {
            first: "Meera",
            phone: "+919845022222",
            emailOff: true,
        });
        const ravi = await owed(rye, { first: "Ravi", phone: "+919845033333" });
        await shares.share(rye, ravi, {
            channel: "WHATSAPP",
            kind: "REMINDER",
        });

        const { invoices: rows } = await reminders.preview(rye, {
            invoiceIds: [asha, bina, chetan, vivek, meera, ravi],
        });

        expect(rows.map((r) => [r.invoiceId, r.way, r.reason])).toEqual([
            [asha, "EMAIL", null],
            [bina, "EMAIL", null],
            [chetan, "EMAIL", null],
            [vivek, "WHATSAPP", "NO_EMAIL_ADDRESS"],
            [meera, "WHATSAPP", "EMAIL_OFF"],
            [ravi, "WAIT", "REMINDED_TODAY"],
        ]);
        expect(rows[0]).toMatchObject({
            email: expect.stringMatching(/^asha\.\d+@example\.com$/),
            name: "Asha",
            leftToPay: "2240.00",
            currency: "INR",
        });
        expect(rows[3]!.phone).toBe("+919845011234");
        expect(rows[5]!.retryAt).toEqual(expect.any(String));
    });

    it("names who can't be reached by any channel, and refuses what isn't owed, each with a reason", async () => {
        const nobody = await owed(rye, { first: "Nobody", email: null });
        const draft = await owed(rye, { first: "Draft", status: "DRAFT" });
        const paid = await owed(rye, { first: "Paid", status: "PAID" });
        const voided = await owed(rye, { first: "Gone", status: "VOID" });
        const store = await prisma.store.create({
            data: {
                organizationId: rye.organizationId,
                name: "Counter",
                slug: uniq("store"),
            },
        });
        const order = await prisma.order.create({
            data: {
                storeId: store.id,
                organizationId: rye.organizationId,
                orderId: uniq("ORD"),
                subtotal: "2240.00",
                total: "2240.00",
                currency: "INR",
            },
        });
        const ofOrder = await owed(rye, { first: "Order", orderId: order.id });

        const { invoices: rows } = await reminders.preview(rye, {
            invoiceIds: [nobody, draft, paid, voided, ofOrder],
        });

        expect(rows.map((r) => [r.way, r.reason])).toEqual([
            ["NONE", "UNREACHABLE"],
            ["NONE", "DRAFT"],
            ["NONE", "PAID"],
            ["NONE", "NOT_OWED"],
            ["NONE", "ORDER"],
        ]);
        expect(rows[0]).toMatchObject({
            name: "Nobody",
            emailBlocked: "NO_EMAIL_ADDRESS",
        });
    });

    it("asks a partly paid invoice for what is left", async () => {
        const id = await owed(rye, { first: "Part" });
        await ledger.record(rye, id, { method: "CASH", amount: "1000" });
        const { invoices: rows } = await reminders.preview(rye, {
            invoiceIds: [id],
        });
        expect(rows[0]!.leftToPay).toBe("1240.00");
    });
});

describe("Send", () => {
    it("emails the email ones, each with its own reminder Message, and sends nothing else", async () => {
        const a = await owed(rye, { first: "Anil" });
        const b = await owed(rye, { first: "Bela" });
        const c = await owed(rye, { first: "Chitra" });
        const w = await owed(rye, {
            first: "Wasim",
            email: null,
            phone: "+919845044444",
        });
        const later = await owed(rye, { first: "Later" });
        await sending.remind(rye, later);

        const { invoices: rows } = await reminders.send(rye, {
            invoiceIds: [a, b, c, w, later],
        });

        expect(rows.map((r) => [r.way, r.outcome])).toEqual([
            ["EMAIL", "EMAILED"],
            ["EMAIL", "EMAILED"],
            ["EMAIL", "EMAILED"],
            ["WHATSAPP", "NOT_SENT"],
            ["WAIT", "NOT_SENT"],
        ]);
        for (const id of [a, b, c]) {
            expect(await remindersOf(id)).toHaveLength(1);
        }
        expect(await remindersOf(w)).toHaveLength(0);
        // The one reminded earlier today still has only that one.
        expect(await remindersOf(later)).toHaveLength(1);
        // Nothing was opened on WhatsApp for them: the business does that.
        expect(
            await prisma.invoiceShare.count({ where: { invoiceId: w } }),
        ).toBe(0);

        // And a second Send the same day waits for all of them.
        const again = await reminders.send(rye, { invoiceIds: [a, b, c] });
        expect(again.invoices.map((r) => r.way)).toEqual([
            "WAIT",
            "WAIT",
            "WAIT",
        ]);
        for (const id of [a, b, c]) {
            expect(await remindersOf(id)).toHaveLength(1);
        }
    });

    it("never touches another business's invoices: not found, never sent (RLS on too)", async () => {
        const theirs = await owed(pulse, { first: "Tara" });
        const mine = await owed(rye, { first: "Mohan" });

        const preview = await reminders.preview(rye, {
            invoiceIds: [theirs, mine],
        });
        expect(preview.invoices[0]).toEqual({
            invoiceId: theirs,
            way: "NONE",
            reason: "NOT_FOUND",
        });

        const { invoices: rows } = await reminders.send(rye, {
            invoiceIds: [theirs, mine],
        });
        expect(rows.map((r) => [r.reason, r.outcome])).toEqual([
            ["NOT_FOUND", "NOT_SENT"],
            [null, "EMAILED"],
        ]);
        expect(await remindersOf(theirs)).toHaveLength(0);
        expect(
            await prisma.message.count({
                where: {
                    organizationId: rye.organizationId,
                    invoiceId: theirs,
                },
            }),
        ).toBe(0);
    });

    it("with no email provider, every one is WhatsApp or nothing, and nothing is sent from Saroh's address", async () => {
        const withPhone = await owed(quiet, {
            first: "Ira",
            phone: "+919845055555",
        });
        const noPhone = await owed(quiet, { first: "Om" });

        const { invoices: rows } = await reminders.send(quiet, {
            invoiceIds: [withPhone, noPhone],
        });

        expect(rows.map((r) => [r.way, r.reason, r.outcome])).toEqual([
            ["WHATSAPP", "NO_EMAIL_PROVIDER", "NOT_SENT"],
            ["NONE", "UNREACHABLE", "NOT_SENT"],
        ]);
        expect(rows[1]!.emailBlocked).toBe("NO_EMAIL_PROVIDER");
        expect(
            await prisma.message.count({
                where: { organizationId: quiet.organizationId },
            }),
        ).toBe(0);
    });
});

describe("limits", () => {
    it("takes at most 100 at a time, and at least one", async () => {
        const many = plainToInstance(BulkRemindersDto, {
            invoiceIds: Array.from(
                { length: BULK_REMINDER_MAX + 1 },
                (_, i) => `inv_${i}`,
            ),
        });
        const none = plainToInstance(BulkRemindersDto, { invoiceIds: [] });
        const enough = plainToInstance(BulkRemindersDto, {
            invoiceIds: Array.from(
                { length: BULK_REMINDER_MAX },
                (_, i) => `inv_${i}`,
            ),
        });
        expect((await validate(many))[0]?.constraints).toHaveProperty(
            "arrayMaxSize",
        );
        expect((await validate(none))[0]?.constraints).toHaveProperty(
            "arrayMinSize",
        );
        expect(await validate(enough)).toEqual([]);
    });

    it("reminds an invoice picked twice once", async () => {
        const id = await owed(rye, { first: "Twice" });
        const { invoices: rows } = await reminders.send(rye, {
            invoiceIds: [id, id],
        });
        expect(rows).toHaveLength(1);
        expect(await remindersOf(id)).toHaveLength(1);
    });

    it("a Member, who holds no money permission, can neither preview nor send", async () => {
        const id = await owed(rye, { first: "Member" });
        const member = { ...rye, role: "MEMBER" };
        await expect(
            reminders.preview(member, { invoiceIds: [id] }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            reminders.send(member, { invoiceIds: [id] }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(await remindersOf(id)).toHaveLength(0);
    });
});
