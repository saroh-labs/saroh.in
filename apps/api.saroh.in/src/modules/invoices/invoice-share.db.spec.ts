/**
 * Sharing one invoice by hand (DEC-173, U5 #1117) against a real Postgres:
 * WhatsApp answers the message and the `wa.me` link with a fresh link (the
 * old one stops working), every share is logged, a WhatsApp reminder counts
 * towards one reminder a day both ways, a partly paid invoice asks for what
 * is left, PDF and print mint nothing, a receipt goes by WhatsApp text or by
 * the business's own email (never without a provider), and every refusal:
 * a draft, an order's invoice, a paid invoice reminded, nothing paid yet,
 * another business's invoice (404), a Member.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`. Only the
 * app env is stubbed (for the credential key and the pay link's host).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { HttpException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { InvoicePaymentsService } from "./invoice-payments.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoiceShareService } from "./invoice-share.service";
import { InvoicesService } from "./invoices.service";
import { hashPayToken } from "./pay-token";

const comms = new CommunicationsService();
const ledger = new InvoicePaymentsService();
const invoices = new InvoicesService(ledger);
const sending = new InvoiceSendService(invoices, comms);
const shares = new InvoiceShareService(invoices, sending, comms);
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);

let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${++n}`;
const DAY = 24 * 60 * 60 * 1000;
const TOKEN = /\/pay\/([A-Za-z0-9_-]{43})$/;

let rye: OrganizationContext;
let quiet: OrganizationContext;
let pulse: OrganizationContext;

async function business(
    name: string,
    opts: { email: boolean; payments: boolean },
): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("share") },
    });
    await giveBusinessDetails(org.id);
    const ctx = { organizationId: org.id, userId: "user_owner", role: "OWNER" };
    if (opts.payments) {
        await payments.connectProvider(ctx, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_Public1",
            keyId: "rzp_test_Public1",
            keySecret: "rzp_secret",
            webhookSecret: "whsec",
        });
    }
    if (opts.email) {
        await comms.connectProvider(ctx, {
            channel: "EMAIL",
            provider: "RESEND",
            fromAddress: "hello@rye.example",
            credentials: { apiKey: "re_test_key" },
        });
    }
    return ctx;
}

/** An issued invoice for Vivek Nair, overdue since 7 Oct unless told. */
async function issued(
    ctx: OrganizationContext,
    total: string,
    over: {
        status?: string;
        dueAt?: Date;
        orderId?: string;
        phone?: string | null;
        number?: string;
    } = {},
): Promise<string> {
    const status = over.status ?? "ISSUED";
    const email = `vivek.nair.${++n}@example.com`;
    const contact = await prisma.contact.create({
        data: {
            organizationId: ctx.organizationId,
            firstName: "Vivek",
            lastName: "Nair",
            email,
            phone: over.phone === undefined ? "+919845011234" : over.phone,
        },
    });
    const row = await prisma.invoice.create({
        data: {
            organizationId: ctx.organizationId,
            number: status === "DRAFT" ? null : (over.number ?? uniq("RC")),
            status,
            currency: "INR",
            subtotal: total,
            total,
            contactId: contact.id,
            billToName: "Vivek Nair",
            billToEmail: email,
            issuedAt: status === "DRAFT" ? null : new Date(),
            dueAt: over.dueAt ?? new Date("2026-10-07T06:30:00.000Z"),
            orderId: over.orderId ?? null,
            source: over.orderId ? "ORDER" : "MANUAL",
            ...(status === "PAID"
                ? { paidAt: new Date(), paymentMethod: "CASH" }
                : {}),
        },
        select: { id: true },
    });
    return row.id;
}

async function caught(p: Promise<unknown>): Promise<HttpException> {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    if (!(err instanceof HttpException)) {
        throw new Error(`expected an HttpException, got ${String(err)}`);
    }
    return err;
}

const sharesOf = (invoiceId: string) =>
    prisma.invoiceShare.findMany({
        where: { invoiceId },
        orderBy: { createdAt: "asc" },
    });

const tokenHash = async (id: string) =>
    (
        await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { payTokenHash: true },
        })
    ).payTokenHash;

beforeAll(async () => {
    rye = await business("Rye & Co.", { email: true, payments: true });
    quiet = await business("Kavi Dental", { email: false, payments: false });
    pulse = await business("Pulse Fitness", { email: true, payments: true });
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("sharing on WhatsApp", () => {
    it("answers the reminder in the business's voice with a fresh pay link, and logs it", async () => {
        const id = await issued(rye, "8400.00", { number: uniq("RC/26-27") });
        const old = await invoices.createPayLink(rye, id);

        const shared = await shares.share(rye, id, {
            channel: "WHATSAPP",
            kind: "REMINDER",
        });

        const number = (
            await prisma.invoice.findUniqueOrThrow({ where: { id } })
        ).number;
        expect(shared.text).toBe(
            `Hi Vivek, this is Rye & Co. Your invoice ${number} for ₹8,400 was due on 7 Oct. You can see it and pay here: ${shared.url} Thank you.`,
        );
        expect(shared).toMatchObject({
            channel: "WHATSAPP",
            kind: "REMINDER",
            phone: "+919845011234",
            payOnline: true,
            email: null,
        });
        // The link is the business's pay link, fresh: the old one stops.
        const token = TOKEN.exec(shared.url ?? "")?.[1];
        expect(token).toBeDefined();
        expect(await tokenHash(id)).toBe(hashPayToken(token!));
        expect(await tokenHash(id)).not.toBe(hashPayToken(old.token));
        // wa.me with the message typed in.
        expect(shared.whatsappUrl).toMatch(
            /^https:\/\/wa\.me\/919845011234\?text=/,
        );
        expect(new URL(shared.whatsappUrl!).searchParams.get("text")).toBe(
            shared.text,
        );

        const log = await sharesOf(id);
        expect(log).toEqual([
            expect.objectContaining({
                organizationId: rye.organizationId,
                channel: "WHATSAPP",
                kind: "REMINDER",
                byUserId: "user_owner",
            }),
        ]);
        const read = await sending.readFor(rye.organizationId, id);
        expect(read.shared).toEqual([
            expect.objectContaining({ channel: "WHATSAPP", kind: "REMINDER" }),
        ]);
    });

    it("asks a partly paid invoice for what is left: ₹1,500 left of ₹2,500", async () => {
        const id = await issued(rye, "2500.00");
        await ledger.record(rye, id, { method: "CASH", amount: "1000" });

        const shared = await shares.share(rye, id, {
            channel: "WHATSAPP",
            kind: "REMINDER",
        });
        expect(shared.text).toContain("₹1,500 left of ₹2,500");
    });

    it("picks the invoice's own message when none is named: a reminder once overdue, new before", async () => {
        const overdue = await issued(rye, "500.00");
        const notYet = await issued(rye, "500.00", {
            dueAt: new Date(Date.now() + 7 * DAY),
        });
        expect(
            (await shares.share(rye, overdue, { channel: "WHATSAPP" })).kind,
        ).toBe("REMINDER");
        const fresh = await shares.share(rye, notYet, { channel: "WHATSAPP" });
        expect(fresh.kind).toBe("NEW");
        expect(fresh.text).toContain("Here is your invoice");
    });

    it("with no phone, answers the message to copy and no wa.me link", async () => {
        const id = await issued(rye, "600.00", { phone: null });
        const shared = await shares.share(rye, id, {
            channel: "WHATSAPP",
            kind: "NEW",
        });
        expect(shared.phone).toBeNull();
        expect(shared.whatsappUrl).toBeNull();
        expect(shared.text).toContain("Here is your invoice");
    });

    it("sends a view link, not a pay link, for a business that can't take money online", async () => {
        const id = await issued(quiet, "1200.00");
        const shared = await shares.share(quiet, id, {
            channel: "WHATSAPP",
            kind: "NEW",
        });
        expect(shared.payOnline).toBe(false);
        expect(shared.text).toContain("You can see it and how to pay here:");
    });
});

describe("one reminder a day, whichever way", () => {
    it("a WhatsApp reminder today, then an email reminder: 429 with retryAt", async () => {
        const id = await issued(rye, "900.00");
        await shares.share(rye, id, { channel: "WHATSAPP", kind: "REMINDER" });

        const err = await caught(sending.remind(rye, id));
        expect(err.getStatus()).toBe(429);
        expect(
            (err.getResponse() as { details: { retryAt: string } }).details
                .retryAt,
        ).toEqual(expect.any(String));
        const read = await sending.readFor(rye.organizationId, id);
        expect(read.send.nextReminderAt).not.toBeNull();
    });

    it("an email reminder today, then a WhatsApp one: 429, and nothing logged", async () => {
        const id = await issued(rye, "950.00");
        await sending.remind(rye, id);

        const err = await caught(
            shares.share(rye, id, { channel: "WHATSAPP", kind: "REMINDER" }),
        );
        expect(err.getStatus()).toBe(429);
        expect(await sharesOf(id)).toHaveLength(0);
    });

    it("a reminder from yesterday no longer counts", async () => {
        const id = await issued(rye, "975.00");
        await prisma.invoiceShare.create({
            data: {
                organizationId: rye.organizationId,
                invoiceId: id,
                channel: "WHATSAPP",
                kind: "REMINDER",
                createdAt: new Date(Date.now() - DAY - 60_000),
            },
        });
        await expect(
            shares.share(rye, id, { channel: "WHATSAPP", kind: "REMINDER" }),
        ).resolves.toMatchObject({ kind: "REMINDER" });
    });

    it("copying a link, a PDF or printing doesn't count as a reminder", async () => {
        const id = await issued(rye, "990.00");
        await shares.share(rye, id, { channel: "LINK", kind: "REMINDER" });
        await shares.share(rye, id, { channel: "PDF" });
        await shares.share(rye, id, { channel: "PRINT" });
        await expect(sending.remind(rye, id)).resolves.toMatchObject({
            channels: ["email"],
        });
    });
});

describe("link, PDF and print", () => {
    it("Link mints a fresh link and answers the message too", async () => {
        const id = await issued(rye, "1100.00");
        const first = await shares.share(rye, id, { channel: "LINK" });
        const second = await shares.share(rye, id, { channel: "LINK" });
        expect(first.url).not.toBe(second.url);
        expect(second.text).toContain(second.url!);
        expect(await tokenHash(id)).toBe(
            hashPayToken(TOKEN.exec(second.url!)![1]!),
        );
    });

    it("PDF and Print mint nothing and are only logged", async () => {
        const id = await issued(rye, "1300.00");
        const link = await invoices.createPayLink(rye, id);

        const pdf = await shares.share(rye, id, { channel: "PDF" });
        const print = await shares.share(rye, id, { channel: "PRINT" });

        expect(pdf).toMatchObject({ url: null, text: null, whatsappUrl: null });
        expect(print.url).toBeNull();
        expect(await tokenHash(id)).toBe(hashPayToken(link.token));
        expect((await sharesOf(id)).map((s) => s.channel)).toEqual([
            "PDF",
            "PRINT",
        ]);
    });
});

describe("receipts", () => {
    it("on WhatsApp, thanks them with paid so far and left to pay", async () => {
        const id = await issued(rye, "8400.00");
        await ledger.record(rye, id, { method: "CASH", amount: "4000" });

        const shared = await shares.share(rye, id, {
            channel: "WHATSAPP",
            kind: "RECEIPT",
        });
        expect(shared.text).toContain(
            "Thank you for your payment of ₹4,000 in cash",
        );
        expect(shared.text).toContain(
            "Paid so far: ₹4,000 of ₹8,400. Left to pay: ₹4,400.",
        );
    });

    it("a paid invoice shares its receipt by default, with a view link", async () => {
        const id = await issued(rye, "2000.00");
        await ledger.record(rye, id, { method: "UPI" });

        const shared = await shares.share(rye, id, { channel: "WHATSAPP" });
        expect(shared.kind).toBe("RECEIPT");
        expect(shared.payOnline).toBe(false);
        expect(shared.text).toContain("It is now paid in full.");
        expect(shared.url).toMatch(TOKEN);
    });

    it("by email, queues the receipt through the business's provider, once for the payment", async () => {
        const id = await issued(rye, "3000.00");
        const recorded = await ledger.record(rye, id, { method: "CASH" });

        const shared = await shares.share(rye, id, {
            channel: "EMAIL",
            kind: "RECEIPT",
        });
        expect(shared.email).toMatchObject({ status: "QUEUED" });
        const messages = await prisma.message.findMany({
            where: { invoiceId: id, template: "INVOICE_PAYMENT_RECEIVED" },
        });
        expect(messages).toHaveLength(1);
        expect(messages[0]!.createdByUserId).toBe("user_owner");
        // The automatic one, still waiting, sees it went and stays quiet.
        const payment = await prisma.invoicePayment.findUniqueOrThrow({
            where: { id: recorded.recorded.paymentId },
        });
        expect(payment.receiptMessageId).toBe(messages[0]!.id);
        // Email isn't logged as a share: its Message is the record.
        expect(await sharesOf(id)).toHaveLength(0);
    });

    it("by email with no provider is a 409, and nothing is sent", async () => {
        const id = await issued(quiet, "800.00");
        await ledger.record(quiet, id, { method: "CASH" });

        const err = await caught(
            shares.share(quiet, id, { channel: "EMAIL", kind: "RECEIPT" }),
        );
        expect(err.getStatus()).toBe(409);
        expect(err.message).toMatch(/share the receipt on WhatsApp/);
        expect(await prisma.message.count({ where: { invoiceId: id } })).toBe(
            0,
        );
        // WhatsApp still works.
        await expect(
            shares.share(quiet, id, { channel: "WHATSAPP", kind: "RECEIPT" }),
        ).resolves.toMatchObject({ kind: "RECEIPT" });
    });

    it("email takes only a receipt: a new invoice or reminder goes by Send", async () => {
        const id = await issued(rye, "400.00");
        const err = await caught(
            shares.share(rye, id, { channel: "EMAIL", kind: "REMINDER" }),
        );
        expect(err.getStatus()).toBe(409);
    });
});

describe("refusals", () => {
    it.each([
        ["a draft", { status: "DRAFT" }, "REMINDER", 409],
        ["a void invoice", { status: "VOID" }, "REMINDER", 409],
        ["a paid invoice, reminded", { status: "PAID" }, "REMINDER", 409],
        ["a receipt with nothing paid", {}, "RECEIPT", 409],
    ] as const)("refuses %s", async (_what, over, kind, code) => {
        const id = await issued(rye, "1000.00", over);
        const err = await caught(
            shares.share(rye, id, { channel: "WHATSAPP", kind }),
        );
        expect(err.getStatus()).toBe(code);
        expect(await sharesOf(id)).toHaveLength(0);
    });

    it("refuses an order's invoice: the order is shared", async () => {
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
                subtotal: "1200.00",
                total: "1200.00",
                currency: "INR",
            },
        });
        const id = await issued(rye, "1200.00", { orderId: order.id });
        const err = await caught(shares.share(rye, id, { channel: "LINK" }));
        expect(err.getStatus()).toBe(409);
    });

    it("another business's invoice is a 404, and nothing is minted or logged", async () => {
        const theirs = await issued(pulse, "1500.00");
        const link = await invoices.createPayLink(pulse, theirs);

        for (const channel of ["WHATSAPP", "LINK", "PDF", "EMAIL"] as const) {
            const err = await caught(
                shares.share(rye, theirs, {
                    channel,
                    ...(channel === "EMAIL"
                        ? { kind: "RECEIPT" as const }
                        : {}),
                }),
            );
            expect(err.getStatus()).toBe(404);
        }
        expect(await tokenHash(theirs)).toBe(hashPayToken(link.token));
        expect(await sharesOf(theirs)).toHaveLength(0);
    });

    it("a Member, who holds no money permission, is refused", async () => {
        const id = await issued(rye, "700.00");
        const err = await caught(
            shares.share({ ...rye, role: "MEMBER" }, id, { channel: "LINK" }),
        );
        expect(err.getStatus()).toBe(403);
    });
});
