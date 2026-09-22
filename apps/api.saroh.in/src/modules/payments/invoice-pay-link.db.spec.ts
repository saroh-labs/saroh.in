/**
 * The invoice pay link end to end against a real Postgres (ADR-007, U13):
 * the token's life (made, replaced, revoked on void and on contact deletion),
 * a payment started for the stored total, and every webhook outcome routed to
 * the invoice — paid, a duplicate, void-then-success and cash-then-success
 * (captured, recorded as owed back), a failure, and a refund.
 *
 * Only the app env is stubbed (for the credential key); the provider and the
 * webhook verifier are the network-free fakes. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { ContactsService } from "../contacts/contacts.service";
import { InvoicesService } from "../invoices/invoices.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicesService } from "./public-invoices.service";

const WEBHOOK_SECRET = "whsec_db_test";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const publicInvoices = new PublicInvoicesService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const invoices = new InvoicesService();
const contacts = new ContactsService();

let owner: OrganizationContext;
let contactId: string;
let eventSeq = 0;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Lotus Yoga", slug: `pay-link-org-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: "asha@example.com",
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_public",
        keyId: "rzp_key",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

async function issued(forContact = contactId): Promise<string> {
    const draft = await invoices.createDraft(owner, {
        contactId: forContact,
        currency: "INR",
        tax: "200",
        lines: [
            {
                description: "Monthly membership",
                quantity: 1,
                unitPrice: "1200",
            },
        ],
    });
    await invoices.issue(owner, draft.id);
    return draft.id;
}

/** A signed webhook for the fake verifier; each call is a new event. */
async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

async function startPaying(token: string, key: string) {
    return publicInvoices.createIntent(token, {
        idempotencyKey: key,
        amount: 1,
    });
}

describe("the pay link token (real database)", () => {
    it("works until replaced, and the old link stops working", async () => {
        const id = await issued();
        const first = (await invoices.createPayLink(owner, id)).token;
        expect((await publicInvoices.read(first)).number).toMatch(/^INV-/);

        const second = (await invoices.createPayLink(owner, id)).token;
        await expect(publicInvoices.read(first)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect((await publicInvoices.read(second)).status).toBe("ISSUED");

        const stored = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { payTokenHash: true },
        });
        expect(stored.payTokenHash).not.toBe(second);
        expect(stored.payTokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is revoked when the invoice is voided", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        await invoices.voidInvoice(owner, id, { reason: "Wrong amount" });
        await expect(publicInvoices.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("is revoked when the contact is deleted, though the invoice stays", async () => {
        const other = await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: "ravi@example.com",
                firstName: "Ravi",
            },
        });
        const id = await issued(other.id);
        const { token } = await invoices.createPayLink(owner, id);
        await contacts.remove(owner, other.id);

        await expect(publicInvoices.read(token)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        const kept = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { status: true, billToName: true, payTokenHash: true },
        });
        expect(kept).toEqual({
            status: "ISSUED",
            billToName: "Ravi",
            payTokenHash: null,
        });
    });
});

describe("paying an invoice online (real database)", () => {
    it("charges the stored total and a success webhook marks it PAID, once", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);

        const intent = await startPaying(token, "tab-1");
        expect(intent.amountCents).toBe(140000);
        expect(intent.currency).toBe("INR");
        // The same key on the same invoice replays the first intent.
        expect((await startPaying(token, "tab-1")).paymentIntentId).toBe(
            intent.paymentIntentId,
        );

        const success = {
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_live_1",
        };
        expect(await webhook(success)).toEqual({
            status: "processed",
            changed: true,
        });
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: {
                status: true,
                paidAt: true,
                paymentMethod: true,
                paymentReference: true,
                paymentNote: true,
            },
        });
        expect(paid).toEqual({
            status: "PAID",
            paidAt: expect.any(Date),
            paymentMethod: "ONLINE",
            paymentReference: "pay_live_1",
            paymentNote: "Paid online through Razorpay",
        });

        // Razorpay's second event for the same payment changes nothing and
        // is not mistaken for a second payment.
        expect(await webhook({ ...success, eventType: "order.paid" })).toEqual({
            status: "ignored",
            changed: false,
        });
        const view = await invoices.get(owner, id);
        expect(view.online?.payments).toEqual([
            expect.objectContaining({ applied: true, refund: "NONE" }),
        ]);

        // The page now reads paid, and no new payment can start.
        expect((await publicInvoices.read(token)).status).toBe("PAID");
        await expect(startPaying(token, "tab-2")).rejects.toThrow(
            "This invoice is already paid.",
        );
    });

    it("a duplicate delivery of the same event is a no-op", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "dup");
        const raw = Buffer.from(
            JSON.stringify({
                providerEventId: "evt_dup_fixed",
                eventType: "payment.captured",
                outcome: "SUCCEEDED",
                providerIntentId: intent.providerIntentId,
            }),
        );
        const headers = {
            "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
                .update(raw)
                .digest("hex"),
        };
        await webhooks.handle("razorpay", owner.organizationId, raw, headers);
        expect(
            await webhooks.handle(
                "razorpay",
                owner.organizationId,
                raw,
                headers,
            ),
        ).toEqual({ status: "duplicate", changed: false });
    });

    it("void-then-success keeps the invoice void and records the money as owed back", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "late");
        await invoices.voidInvoice(owner, id, { reason: "Sent twice" });

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_late",
        });

        const inv = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { status: true, paymentMethod: true },
        });
        expect(inv).toEqual({ status: "VOID", paymentMethod: null });
        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
            include: { attempts: true },
        });
        expect(row.status).toBe("SUCCEEDED");
        expect(row.attempts.map((a) => a.status)).toContain(
            "CAPTURED_NEEDS_REFUND",
        );
        const owed = await invoices.get(owner, id);
        expect(owed.online?.payments).toEqual([
            expect.objectContaining({ applied: false, refund: "NONE" }),
        ]);

        // The provider reports the refund: recorded, and no longer owed.
        expect(
            await webhook({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerIntentId: intent.providerIntentId,
                providerRefundId: "rfnd_late",
            }),
        ).toEqual({ status: "processed", changed: true });
        const refunded = await invoices.get(owner, id);
        expect(refunded.online?.payments).toEqual([
            expect.objectContaining({ applied: false, refund: "REFUNDED" }),
        ]);
        expect(refunded.status).toBe("VOID");
    });

    it("cash-then-success keeps the hand-recorded payment and records the money as owed back", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "cash");
        await invoices.recordPayment(owner, id, { method: "CASH" });

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
        });

        const inv = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { status: true, paymentMethod: true },
        });
        expect(inv).toEqual({ status: "PAID", paymentMethod: "CASH" });
        expect((await invoices.get(owner, id)).online?.payments).toEqual([
            expect.objectContaining({ applied: false, refund: "NONE" }),
        ]);
    });

    it("a failure touches only the intent", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "fail");

        await webhook({
            eventType: "payment.failed",
            outcome: "FAILED",
            providerIntentId: intent.providerIntentId,
        });

        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
            select: { status: true, orderId: true, invoiceId: true },
        });
        expect(row).toEqual({ status: "FAILED", orderId: null, invoiceId: id });
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id },
                    select: { status: true },
                })
            ).status,
        ).toBe("ISSUED");
        // The customer can try again from the same link.
        expect((await startPaying(token, "fail-retry")).amountCents).toBe(
            140000,
        );
    });

    it("finds the intent by the invoice reference alone (the Cashfree shape)", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        await startPaying(token, "by-ref");

        await webhook({
            eventType: "PAYMENT_SUCCESS_WEBHOOK",
            outcome: "SUCCEEDED",
            orderRef: id,
        });

        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id },
                    select: { status: true },
                })
            ).status,
        ).toBe("PAID");
    });
});
