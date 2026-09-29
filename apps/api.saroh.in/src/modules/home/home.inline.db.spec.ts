/**
 * Home's inline actions (round 2, F4) against a real Postgres: what a row
 * offers follows the record through its own write. Mark sent is offered on
 * an order ready to hand over, gone once the stage write moves it, and back
 * after the stage's Undo; Send reminder is offered from D17's send flag and
 * not again the same day once the reminder went; a paid invoice offers
 * none; Reply says how it reaches someone with no site account.
 *
 * Only the app env is stubbed (the credential key and the account area);
 * providers are the network-free fakes. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
        RENDERER_URL: "https://saroh.app",
        SITE_ACCOUNT_AREA: "on",
    },
}));

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { CommunicationsService } from "../communications/communications.service";
import { InvoiceSendService } from "../invoices/invoice-send.service";
import { InvoicesService } from "../invoices/invoices.service";
import { writeStageMove, writeStageUndo } from "../orders/order-stage-write";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { HomeInlineService } from "./home-inline";
import type { HomeAction, HomeEvidence, HomeInput } from "./home-model";

const tag = `${process.pid}-${Date.now()}`;
const comms = new CommunicationsService();
const invoices = new InvoicesService();
const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const sending = new InvoiceSendService(invoices, comms);
const inline = new HomeInlineService(sending);

let owner: OrganizationContext;
let input: HomeInput;
let contactId = "";
let storeId = "";
let customerId = "";

function ev(id: string, subtitle = "Asha Rao"): HomeEvidence {
    return {
        id,
        title: id,
        subtitle,
        at: null,
        amountMinor: null,
        currency: null,
        href: `/x/${id}`,
    };
}

async function offered(code: string, id: string) {
    const actions: HomeAction[] = [
        {
            code,
            title: code,
            href: "/",
            severity: "OVERDUE",
            count: 1,
            evidence: [ev(id)],
        },
    ];
    await inline.decorate(actions, input, new Date());
    return actions[0].evidence?.[0].inline;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye & Co.", slug: `home-inline-${tag}` },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    input = { organizationId: org.id, organizationRole: "OWNER" };
    contactId = (
        await prisma.contact.create({
            data: {
                organizationId: org.id,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `home-inline-${tag}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: `anika-${tag}@example.in`,
                firstName: "Anika",
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: "whsec",
    });
    await comms.connectProvider(owner, {
        channel: "EMAIL",
        provider: "RESEND",
        fromAddress: "hello@rye.example",
        credentials: { apiKey: "re_test_key" },
    });
});

async function overdueInvoice(): Promise<string> {
    const draft = await invoices.createDraft(owner, {
        contactId,
        currency: "INR",
        lines: [{ description: "X-ray", quantity: 1, unitPrice: "2400" }],
    });
    await invoices.issue(owner, draft.id);
    await prisma.invoice.update({
        where: { id: draft.id },
        data: { dueAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
    });
    return draft.id;
}

describe("Home's inline actions (real database)", () => {
    it("offers Mark sent on a ready shipment, not once it's handed over, and again after Undo", async () => {
        const order = await prisma.order.create({
            data: {
                storeId,
                organizationId: owner.organizationId,
                orderId: `F4-${tag}`,
                customerId,
                subtotal: "610.00",
                total: "610.00",
                currency: "INR",
                status: "PROCESSING",
                paymentStatus: "PAID",
                stage: "READY",
                fulfilment: "SHIPPING",
            },
        });

        const before = await offered("COMMERCE_OPEN_ORDERS", order.id);
        // A store customer with no contact linked: nobody to tell.
        expect(before).toMatchObject({
            kind: "MARK_SENT",
            stage: "HANDED_TO_COURIER",
            target: order.id,
            sends: false,
        });

        const moved = await prisma.$transaction((tx) =>
            writeStageMove(tx, owner, order.id, { to: "HANDED_TO_COURIER" }),
        );
        expect(await offered("COMMERCE_OPEN_ORDERS", order.id)).toBeUndefined();

        await prisma.$transaction((tx) =>
            writeStageUndo(tx, owner, order.id, moved.eventId),
        );
        expect(await offered("COMMERCE_OPEN_ORDERS", order.id)).toMatchObject({
            kind: "MARK_SENT",
        });
    });

    it("offers Send reminder by email, and not again the same day once it went", async () => {
        const id = await overdueInvoice();
        const first = await offered("PAYMENTS_OVERDUE_INVOICES", id);
        expect(first).toMatchObject({
            kind: "SEND_REMINDER",
            target: id,
            sends: true,
            confirm: expect.stringContaining(
                `by email at asha-${tag}@example.com`,
            ),
        });

        await sending.remind(owner, id);
        expect(await offered("PAYMENTS_OVERDUE_INVOICES", id)).toBeUndefined();
    });

    it("offers nothing on an invoice that has been paid", async () => {
        const id = await overdueInvoice();
        await prisma.invoice.update({
            where: { id },
            data: { status: "PAID", paidAt: new Date() },
        });
        expect(await offered("PAYMENTS_OVERDUE_INVOICES", id)).toBeUndefined();
    });

    it("says a reply waits for someone who doesn't sign in on the site", async () => {
        const reply = await offered("CRM_UNANSWERED_MESSAGES", contactId);
        expect(reply).toMatchObject({ kind: "REPLY", target: contactId });
        expect(reply?.confirm).toContain(
            "They'll see your reply when they sign in there.",
        );
    });
});
