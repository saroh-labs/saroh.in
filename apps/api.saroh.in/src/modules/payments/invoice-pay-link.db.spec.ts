/**
 * The invoice pay link end to end against a real Postgres (ADR-007, U13):
 * the token's life (made, replaced, revoked on void, kept when deleting the
 * contact is refused),
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

import { ConflictException, NotFoundException } from "@nestjs/common";
import { backfillInvoicePayments, prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
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
    await giveBusinessDetails(org.id);
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
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
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

    it("keeps when each link was made, clears it on void, and the read never carries the token (#870)", async () => {
        const id = await issued();
        const first = await invoices.createPayLink(owner, id);
        const second = await invoices.createPayLink(owner, id);
        expect(second.payLinkCreatedAt.getTime()).toBeGreaterThanOrEqual(
            first.payLinkCreatedAt.getTime(),
        );
        const view = await invoices.get(owner, id);
        expect(view.online?.payLinkMadeAt).toBe(
            second.payLinkCreatedAt.toISOString(),
        );
        expect(JSON.stringify(view)).not.toContain(second.token);

        await invoices.voidInvoice(owner, id, { reason: "Wrong amount" });
        const stored = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { payTokenHash: true, payLinkCreatedAt: true },
        });
        expect(stored).toEqual({ payTokenHash: null, payLinkCreatedAt: null });
    });

    it("keeps working when deleting the contact is refused (DEC-042)", async () => {
        const other = await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: "ravi@example.com",
                firstName: "Ravi",
            },
        });
        const id = await issued(other.id);
        const { token } = await invoices.createPayLink(owner, id);
        // Someone with an invoice keeps their record: the delete is
        // refused, and their pay link is untouched.
        await expect(contacts.remove(owner, other.id)).rejects.toBeInstanceOf(
            ConflictException,
        );

        expect((await publicInvoices.read(token)).status).toBe("ISSUED");
        const kept = await prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { status: true, contactId: true },
        });
        expect(kept).toEqual({ status: "ISSUED", contactId: other.id });
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

describe("the pay link and the payments ledger (DEC-173, real database)", () => {
    const ledgerOf = (invoiceId: string) =>
        prisma.invoicePayment.findMany({
            where: { invoiceId },
            orderBy: { createdAt: "asc" },
            select: {
                amountCents: true,
                method: true,
                reference: true,
                paymentIntentId: true,
                recordedById: true,
                removedAt: true,
            },
        });
    const stateOf = (id: string) =>
        prisma.invoice.findUniqueOrThrow({
            where: { id },
            select: { status: true, paidCents: true, paymentMethod: true },
        });

    it("writes one ONLINE payment for the intent, and a replay never doubles it", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "ledger-1");
        const success = {
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_ledger_1",
        };
        await webhook(success);
        // Razorpay's second event for the same payment, and the first again.
        await webhook({ ...success, eventType: "order.paid" });
        await webhook(success);

        expect(await ledgerOf(id)).toEqual([
            {
                amountCents: 140000,
                method: "ONLINE",
                reference: "pay_ledger_1",
                paymentIntentId: intent.paymentIntentId,
                recordedById: null,
                removedAt: null,
            },
        ]);
        expect(await stateOf(id)).toEqual({
            status: "PAID",
            paidCents: 140000,
            paymentMethod: "ONLINE",
        });
        // Noted on the invoice's history, as Saroh's.
        const audit = await prisma.auditEvent.findFirstOrThrow({
            where: {
                targetType: "invoice",
                targetId: id,
                action: "invoice.payment.recorded",
            },
            select: { actorUserId: true },
        });
        expect(audit.actorUserId).toBe("system:online-payment");
    });

    it("charges only what is left on a partly paid invoice, and that payment settles it", async () => {
        const id = await issued();
        await invoices.recordPayment(owner, id, {
            method: "CASH",
            amount: "1000.00",
        });
        const { token } = await invoices.createPayLink(owner, id);

        const page = await publicInvoices.read(token);
        expect(page).toMatchObject({
            total: "1400.00",
            paidSoFar: "1000.00",
            leftToPay: "400.00",
            status: "ISSUED",
        });

        const intent = await startPaying(token, "rest-1");
        expect(intent.amountCents).toBe(40000);
        expect(
            await prisma.paymentIntent.findUniqueOrThrow({
                where: { id: intent.paymentIntentId },
                select: { amountCents: true },
            }),
        ).toEqual({ amountCents: 40000 });

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_rest_1",
        });
        expect(
            (await ledgerOf(id)).map((p) => [p.method, p.amountCents]),
        ).toEqual([
            ["CASH", 100000],
            ["ONLINE", 40000],
        ]);
        expect(await stateOf(id)).toEqual({
            status: "PAID",
            paidCents: 140000,
            paymentMethod: "ONLINE",
        });
        const paid = await publicInvoices.read(token);
        expect(paid).toMatchObject({
            status: "PAID",
            paidSoFar: "1400.00",
            leftToPay: "0.00",
        });
    });

    it("owes back a checkout opened for the whole total when part was paid by hand meanwhile, with no second payment", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "whole-1");
        expect(intent.amountCents).toBe(140000);
        await invoices.recordPayment(owner, id, {
            method: "UPI",
            amount: "1000.00",
        });

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_whole_1",
        });

        expect((await ledgerOf(id)).map((p) => p.method)).toEqual(["UPI"]);
        expect(await stateOf(id)).toEqual({
            status: "ISSUED",
            paidCents: 100000,
            paymentMethod: null,
        });
        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
            include: { attempts: true },
        });
        expect(row.status).toBe("SUCCEEDED");
        expect(
            row.attempts.find((a) => a.status === "CAPTURED_NEEDS_REFUND")
                ?.rawResponse,
        ).toEqual({ invoiceStatus: "MORE_THAN_LEFT" });
    });

    it("a payment arriving after the invoice was settled by hand is owed back, and not added", async () => {
        const id = await issued();
        const { token } = await invoices.createPayLink(owner, id);
        const intent = await startPaying(token, "late-cash");
        await invoices.recordPayment(owner, id, { method: "CASH" });

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
        });

        expect((await ledgerOf(id)).map((p) => p.method)).toEqual(["CASH"]);
        expect(await stateOf(id)).toEqual({
            status: "PAID",
            paidCents: 140000,
            paymentMethod: "CASH",
        });
    });
});

describe("the ledger backfill after the new paths (DEC-173)", () => {
    it("finds every invoice paid online or by hand here already has its payments, and writes nothing", async () => {
        const paid = await prisma.invoice.count({
            where: { organizationId: owner.organizationId, status: "PAID" },
        });
        // The cases above paid several, online and by hand.
        expect(paid).toBeGreaterThan(0);
        const report = await backfillInvoicePayments(prisma, {
            organizationIds: [owner.organizationId],
            dryRun: true,
        });
        expect(report.written).toBe(0);
        expect(report.skipped).toEqual([]);
    });
});
