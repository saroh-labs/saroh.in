/**
 * Invoices without Payments (DEC-070, K6) against a real Postgres: a
 * business with Payments switched off and no provider creates, issues and
 * sends an invoice (the email carries a view link, not a pay link) and
 * records it paid in cash. A pay link is refused, and on the customer's
 * page the invoice shows with `payOnline: false` while a payment start is a
 * 409. A pay link sent while Payments was on opens as a view link once it
 * is switched off, and never errors.
 *
 * Only the app env is stubbed (for the credential key); the email and
 * payment providers are the network-free fakes.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { MessageSendHandler } from "../communications/message-send.handler";
import {
    FakeCommsProvider,
    FakeCommsProviderFactory,
} from "../communications/providers/fake.provider";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";
import { hashPayToken } from "./pay-token";

const comms = new CommunicationsService();
const invoices = new InvoicesService();
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const publicInvoices = new PublicInvoicesService(payments);
const sending = new InvoiceSendService(invoices, comms);

let seq = 0;

interface Business {
    owner: OrganizationContext;
    contactId: string;
}

async function business(name: string): Promise<Business> {
    const org = await prisma.organization.create({
        data: { name, slug: `no-payments-${++seq}-${process.pid}` },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: "user_1",
        role: "OWNER",
    };
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@studio.example",
        credentials: { apiKey: "re_test_key" },
    });
    return { owner, contactId };
}

async function paymentsOff(organizationId: string): Promise<void> {
    await prisma.organizationModule.upsert({
        where: {
            organizationId_moduleKey: { organizationId, moduleKey: "PAYMENTS" },
        },
        create: { organizationId, moduleKey: "PAYMENTS", status: "DISABLED" },
        update: { status: "DISABLED" },
    });
}

async function issued({ owner, contactId }: Business): Promise<string> {
    const draft = await invoices.createDraft(owner, {
        contactId,
        currency: "INR",
        lines: [{ description: "Logo design", quantity: 1, unitPrice: "8000" }],
    });
    await invoices.issue(owner, draft.id);
    return draft.id;
}

/** Hand the queued email to the fake provider; answer with what it sent. */
async function deliver(organizationId: string, invoiceId: string) {
    const message = await prisma.message.findFirstOrThrow({
        where: { invoiceId },
        orderBy: { createdAt: "desc" },
    });
    const jobs = await prisma.job.findMany({
        where: { organizationId, type: "message.send" },
    });
    const job = jobs.find(
        (j) => (j.payload as { messageId?: string }).messageId === message.id,
    );
    if (!job) throw new Error("no job");
    const fake = new FakeCommsProvider("EMAIL");
    await new MessageSendHandler(new FakeCommsProviderFactory(fake)).handle(
        job,
    );
    const body = fake.calls[0]?.body ?? "";
    const token = /https:\/\/saroh\.app\/pay\/([A-Za-z0-9_-]{43})/.exec(
        body,
    )?.[1];
    if (!token) throw new Error("no link in the email");
    return { body, token };
}

async function conflict(p: Promise<unknown>): Promise<string | null> {
    try {
        await p;
        return null;
    } catch (e) {
        if (!(e instanceof ConflictException)) throw e;
        const res = e.getResponse() as { message?: string } | string;
        return typeof res === "string" ? res : (res.message ?? "");
    }
}

describe("invoices without Payments (DEC-070)", () => {
    it("creates, issues, sends a view link and records a cash payment", async () => {
        const b = await business("Just Me Design");
        await paymentsOff(b.owner.organizationId);
        const id = await issued(b);

        const { send } = await sending.readFor(b.owner.organizationId, id);
        expect(send).toEqual({
            channels: ["email"],
            emailTo: "asha@example.com",
            payOnline: false,
            nextReminderAt: null,
        });

        await sending.send(b.owner, id);
        const { body, token } = await deliver(b.owner.organizationId, id);
        expect(body).toContain("view it and download a copy");
        expect(body).not.toContain("pay it by UPI or card");
        const row = await prisma.invoice.findUniqueOrThrow({ where: { id } });
        expect(row.payTokenHash).toBe(hashPayToken(token));

        // The customer's page: the invoice, and no way to pay online.
        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({
            number: row.number,
            status: "ISSUED",
            payOnline: false,
        });
        expect(page.autopay).toBeUndefined();
        expect(await conflict(publicInvoices.createIntent(token, {}))).toBe(
            "This business doesn't take payment online.",
        );

        // A pay link is still Payments'.
        expect(await conflict(invoices.createPayLink(b.owner, id))).toMatch(
            /Payments is switched off/,
        );

        const paid = await invoices.recordPayment(b.owner, id, {
            method: "CASH",
        });
        expect(paid.status).toBe("PAID");
        expect((await publicInvoices.read(token)).status).toBe("PAID");
    });

    it("with no provider, even with Payments on, sends a view link and makes no pay link", async () => {
        const b = await business("No Provider Studio");
        const id = await issued(b);
        const { send } = await sending.readFor(b.owner.organizationId, id);
        expect(send.payOnline).toBe(false);
        expect(send.channels).toEqual(["email"]);
        await sending.send(b.owner, id);
        const { token } = await deliver(b.owner.organizationId, id);
        expect((await publicInvoices.read(token)).payOnline).toBe(false);
        expect(await conflict(invoices.createPayLink(b.owner, id))).toBe(
            "Connect a payment provider to send a pay link.",
        );
    });

    it("a pay link sent with Payments on opens as a view link once Payments is off", async () => {
        const b = await business("Pay Then Off Studio");
        await payments.connectProvider(b.owner, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_Public1",
            keyId: "rzp_test_Public1",
            keySecret: "rzp_secret",
            webhookSecret: "whsec",
        });
        const id = await issued(b);
        const { send } = await sending.readFor(b.owner.organizationId, id);
        expect(send.payOnline).toBe(true);
        await sending.send(b.owner, id);
        const { body, token } = await deliver(b.owner.organizationId, id);
        expect(body).toContain("pay it by UPI or card");
        expect((await publicInvoices.read(token)).payOnline).toBe(true);

        await paymentsOff(b.owner.organizationId);
        const page = await publicInvoices.read(token);
        expect(page.payOnline).toBe(false);
        expect(page.status).toBe("ISSUED");
        expect(await conflict(publicInvoices.createIntent(token, {}))).toBe(
            "This business doesn't take payment online.",
        );
    });
});
