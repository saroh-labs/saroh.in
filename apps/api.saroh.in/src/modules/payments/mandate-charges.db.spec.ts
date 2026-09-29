/**
 * Charging an autopay mandate, two steps (round-2 D11), with the fake
 * provider against a real Postgres: the order with its pre-debit notice,
 * the notice's webhook, the debit only after it, and the payment's webhook
 * settling the invoice. Every refusal writes no charge, and a cancelled
 * mandate is never charged, however its cancel was answered.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { createHmac } from "node:crypto";

import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { InvoicesService } from "../invoices/invoices.service";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import {
    earliestDebitAt,
    MandateChargesService,
} from "./mandate-charges.service";
import { MandateSetupService } from "./mandate-setup.service";
import { MandatesService } from "./mandates.service";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";

const WEBHOOK_SECRET = "whsec_d11_charge";
const HOUR = 60 * 60 * 1000;

const fake = new FakeMerchantProvider("RAZORPAY");
const factory = new FakeProviderFactory(fake);
const payments = new PaymentsService(factory);
const mandates = new MandatesService(factory);
const setups = new MandateSetupService(factory);
const charges = new MandateChargesService(factory);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const subscriptions = new SubscriptionsService(new InvoicesService());

const tag = `${process.pid}-${Date.now()}`;
let n = 0;
const next = () => `${tag}-${++n}`;

let owner: OrganizationContext;
let planId: string;
let clock = new Date();

beforeAll(async () => {
    const user = await prisma.user.create({
        data: { email: `d11c-owner-${tag}@x.com` },
    });
    const org = await prisma.organization.create({
        data: { name: "Pulse", slug: `d11c-${tag}` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
    planId = (
        await subscriptions.createPlan(owner, {
            name: "Monthly",
            price: "1200",
            currency: "INR",
            interval: "MONTH",
        })
    ).id;
    fake.now = () => clock;
});

beforeEach(() => {
    clock = new Date();
    fake.mandateCalls.length = 0;
    fake.preDebitMethods.clear();
    fake.preDebitMethods.add("UPI");
});

async function webhook(event: Record<string, unknown>) {
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_${next()}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A member with ACTIVE autopay (limit ₹1,800), authorised through the webhook. */
async function autopayMember(method: "UPI" | "CARD" = "UPI") {
    const contactId = (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `c-${next()}@example.in`,
                firstName: "Ravi",
            },
        })
    ).id;
    const { id: subscriptionId } = await subscriptions.subscribe(owner, {
        contactId,
        planId,
    });
    const view = await setups.createSetup({
        organizationId: owner.organizationId,
        subscriptionId,
        method,
        maxAmountCents: 180_000,
    });
    const setup = fake.authorise(`fake_setup_${view.mandateId}`);
    await webhook({
        eventType: "token.confirmed",
        outcome: "MANDATE",
        mandate: {
            status: "ACTIVE",
            setupReference: setup.setupReference,
            providerMandateId: setup.providerMandateId,
            method,
        },
    });
    return { contactId, subscriptionId, mandateId: view.mandateId };
}

async function invoiceFor(
    who: { contactId: string; subscriptionId: string },
    total = "1200",
    status = "ISSUED",
) {
    return prisma.invoice.create({
        data: {
            organizationId: owner.organizationId,
            contactId: who.contactId,
            subscriptionId: who.subscriptionId,
            status,
            currency: "INR",
            subtotal: total,
            total,
            issuedAt: new Date(),
            dueAt: new Date(Date.now() + 7 * 24 * HOUR),
        },
    });
}

const prepare = (
    mandateId: string,
    invoiceId: string,
    key = `inv_${invoiceId}_1`,
) =>
    charges.prepareCharge({
        organizationId: owner.organizationId,
        mandateId,
        invoiceId,
        key,
        debitAt: earliestDebitAt(clock),
    });

const intentOf = (id: string) =>
    prisma.paymentIntent.findUniqueOrThrow({ where: { id } });

const debitCalls = () => fake.mandateCalls.filter((c) => c.op === "charge");

describe("the two-step charge", () => {
    it("order with notice → notice delivered → debit → captured → invoice PAID", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);

        const prepared = await prepare(who.mandateId, invoice.id);
        expect(prepared).toMatchObject({
            status: "PREPARED",
            preDebitStatus: "PENDING",
        });
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        let intent = await intentOf(prepared.intentId);
        expect(intent).toMatchObject({
            invoiceId: invoice.id,
            viaMandateId: who.mandateId,
            amountCents: 120_000,
            status: "REQUIRES_PAYMENT",
            preDebitStatus: "PENDING",
            providerIntentId: prepared.providerIntentId,
        });
        expect(intent.debitAfter?.getTime()).toBeGreaterThanOrEqual(
            clock.getTime() + 25 * HOUR,
        );

        // Before the notice is delivered: not yet, and the provider isn't asked.
        clock = new Date(clock.getTime() + 27 * HOUR);
        fake.failNextMandateCall("getPreDebit", "UNKNOWN");
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "NOT_YET" });
        expect(debitCalls()).toHaveLength(0);

        // The notice's webhook.
        fake.settlePreDebit(prepared.providerIntentId, "DELIVERED");
        expect(
            await webhook({
                eventType: "order.notification.delivered",
                outcome: "PRE_DEBIT",
                providerIntentId: prepared.providerIntentId,
                preDebitStatus: "DELIVERED",
            }),
        ).toEqual({ status: "processed", changed: true });

        const charged = await charges.charge({
            organizationId: owner.organizationId,
            intentId: prepared.intentId,
            now: clock,
        });
        expect(charged).toEqual({
            status: "CHARGING",
            intentId: prepared.intentId,
            providerPaymentRef: `fake_mandate_pay_inv_${invoice.id}_1`,
        });
        intent = await intentOf(prepared.intentId);
        expect(intent.status).toBe("PROCESSING");

        // Asked again: nothing is sent twice.
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "ALREADY", intentStatus: "PROCESSING" });
        expect(debitCalls()).toHaveLength(1);

        // The payment's webhook settles it as any pay link's.
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: prepared.providerIntentId,
            providerPaymentRef: `fake_mandate_pay_inv_${invoice.id}_1`,
        });
        expect((await intentOf(prepared.intentId)).status).toBe("SUCCEEDED");
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: invoice.id },
                })
            ).status,
        ).toBe("PAID");
    });

    it("a lost notice webhook: the charge asks the provider once it's due", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        fake.settlePreDebit(prepared.providerIntentId, "DELIVERED");

        clock = new Date(clock.getTime() + 27 * HOUR);
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "CHARGING" });
        expect((await intentOf(prepared.intentId)).preDebitStatus).toBe(
            "DELIVERED",
        );
    });

    it("not before debitAfter, even with the notice delivered", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        await webhook({
            eventType: "order.notification.delivered",
            outcome: "PRE_DEBIT",
            providerIntentId: prepared.providerIntentId,
            preDebitStatus: "DELIVERED",
        });
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "NOT_YET" });
        expect(debitCalls()).toHaveLength(0);
        expect((await intentOf(prepared.intentId)).status).toBe(
            "REQUIRES_PAYMENT",
        );
    });

    it("a failed notice: no debit, the charge is closed for the pay link", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        await webhook({
            eventType: "order.notification.failed",
            outcome: "PRE_DEBIT",
            providerIntentId: prepared.providerIntentId,
            preDebitStatus: "FAILED",
        });
        clock = new Date(clock.getTime() + 27 * HOUR);
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "REFUSED", reason: "NOTICE_FAILED" });
        expect(debitCalls()).toHaveLength(0);
        expect((await intentOf(prepared.intentId)).status).toBe("CANCELLED");
    });

    it("a method that needs no notice is charged at once", async () => {
        fake.preDebitMethods.clear();
        const who = await autopayMember("CARD");
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        expect(prepared).toMatchObject({
            status: "PREPARED",
            preDebitStatus: "NOT_NEEDED",
        });
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "CHARGING" });
    });

    it("the same key answers with the charge already prepared", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const first = await prepare(who.mandateId, invoice.id);
        const again = await prepare(who.mandateId, invoice.id);
        expect(again).toEqual(first);
        expect(
            await prisma.paymentIntent.count({
                where: { invoiceId: invoice.id },
            }),
        ).toBe(1);
        // A second key while the first is open is refused.
        expect(
            await prepare(who.mandateId, invoice.id, `inv_${invoice.id}_2`),
        ).toMatchObject({ status: "REFUSED", reason: "CHARGE_IN_PROGRESS" });
    });

    it("a debit asked sooner than the notice allows is refused by the provider", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const result = await charges.prepareCharge({
            organizationId: owner.organizationId,
            mandateId: who.mandateId,
            invoiceId: invoice.id,
            key: `inv_${invoice.id}_1`,
            debitAt: new Date(clock.getTime() + 2 * HOUR),
        });
        expect(result).toMatchObject({
            status: "REFUSED",
            reason: "PROVIDER_REFUSED",
        });
        if (result.status !== "REFUSED" || !result.intentId) {
            throw new Error("expected a refused intent");
        }
        expect((await intentOf(result.intentId)).status).toBe("FAILED");
    });

    it("no answer to step one: the intent waits, and asking again prepares it", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        fake.failNextMandateCall("prepareCharge", "UNKNOWN");
        const first = await prepare(who.mandateId, invoice.id);
        expect(first.status).toBe("UNKNOWN");
        const again = await prepare(who.mandateId, invoice.id);
        expect(again).toMatchObject({ status: "PREPARED" });
        expect(
            await prisma.paymentIntent.count({
                where: { invoiceId: invoice.id },
            }),
        ).toBe(1);
    });

    it("no answer to the debit: it stays in progress, never failed", async () => {
        fake.preDebitMethods.clear();
        const who = await autopayMember("CARD");
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        if (prepared.status !== "PREPARED") throw new Error("not prepared");
        fake.failNextMandateCall("charge", "UNKNOWN", { madeAnyway: true });
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "UNKNOWN" });
        expect((await intentOf(prepared.intentId)).status).toBe("PROCESSING");
    });
});

describe("what is never charged", () => {
    it("an invoice from another subscription: refused, no intent", async () => {
        const who = await autopayMember();
        const other = await autopayMember();
        const invoice = await invoiceFor(other);
        expect(await prepare(who.mandateId, invoice.id)).toEqual({
            status: "REFUSED",
            reason: "OTHER_SUBSCRIPTION",
        });
        expect(
            await prisma.paymentIntent.count({
                where: { invoiceId: invoice.id },
            }),
        ).toBe(0);
        expect(
            fake.mandateCalls.filter((c) => c.op === "prepareCharge"),
        ).toHaveLength(0);
    });

    it("an invoice above the limit: refused before the provider", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who, "1850");
        expect(await prepare(who.mandateId, invoice.id)).toEqual({
            status: "REFUSED",
            reason: "ABOVE_LIMIT",
        });
        expect(
            await prisma.paymentIntent.count({
                where: { invoiceId: invoice.id },
            }),
        ).toBe(0);
    });

    it("an invoice that isn't ISSUED: refused", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who, "1200", "PAID");
        expect(await prepare(who.mandateId, invoice.id)).toEqual({
            status: "REFUSED",
            reason: "INVOICE_NOT_PAYABLE",
        });
    });

    it("a cancel that times out: CANCELLED, unconfirmed, and never charged", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        const prepared = await prepare(who.mandateId, invoice.id);
        if (prepared.status !== "PREPARED") throw new Error("not prepared");

        fake.failNextMandateCancel("UNKNOWN");
        await mandates.cancelFor(
            {
                organizationId: owner.organizationId,
                subscriptionId: who.subscriptionId,
            },
            "CUSTOMER",
        );
        expect(
            await prisma.paymentMandate.findUniqueOrThrow({
                where: { id: who.mandateId },
            }),
        ).toMatchObject({ status: "CANCELLED", cancelConfirmedAt: null });

        // The charge prepared before the cancel is closed, not debited.
        fake.settlePreDebit(prepared.providerIntentId, "DELIVERED");
        clock = new Date(clock.getTime() + 27 * HOUR);
        expect(
            await charges.charge({
                organizationId: owner.organizationId,
                intentId: prepared.intentId,
                now: clock,
            }),
        ).toMatchObject({ status: "REFUSED", reason: "MANDATE_NOT_ACTIVE" });
        expect(debitCalls()).toHaveLength(0);
        expect((await intentOf(prepared.intentId)).status).toBe("CANCELLED");

        // And no new charge can be prepared on it.
        const later = await invoiceFor(who);
        expect(await prepare(who.mandateId, later.id)).toEqual({
            status: "REFUSED",
            reason: "MANDATE_NOT_ACTIVE",
        });
    });

    it("a mandate of another business is not found", async () => {
        const who = await autopayMember();
        const invoice = await invoiceFor(who);
        expect(
            await charges.prepareCharge({
                organizationId: "org_elsewhere",
                mandateId: who.mandateId,
                invoiceId: invoice.id,
                key: "k",
                debitAt: earliestDebitAt(clock),
            }),
        ).toEqual({ status: "REFUSED", reason: "MANDATE_NOT_ACTIVE" });
    });
});
