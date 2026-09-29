/**
 * The business details every invoice needs (DEC-068), against a real
 * Postgres: **refused before money, recorded and flagged after it.**
 *
 * A merchant's action that writes an invoice or opens a way to be paid —
 * Issue, Send, a pay link (an invoice's or an order's), subscribing someone,
 * restarting a subscription, a pack sale still to be paid, a course
 * enrolment, connecting a payment provider — is a 409 whose details name
 * what is missing, and writes nothing. Paper written after money has moved
 * — an order paid online (the webhook), a renewal (the job), a pack paid at
 * the desk — is written anyway, and Home's Needs you says the details are
 * missing to whoever can add them.
 *
 * Runs in the integration project (TEST_DATABASE_URL). The provider and the
 * webhook verifier are the network-free fakes.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import type { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ClassPacksService } from "../class-packs/class-packs.service";
import { CoursesService } from "../courses/courses.service";
import { businessDetailsGap } from "../home/home-business-details";
import { flattenNeeds } from "../home/home-needs";
import { HomeService } from "../home/home.service";
import { OrderPayLinkService } from "../orders/order-pay-link.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BUSINESS_DETAILS_MISSING } from "./business-details";
import { InvoiceSendService } from "./invoice-send.service";
import { InvoicesService } from "./invoices.service";

const WEBHOOK_SECRET = "whsec_dec068";
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const invoices = new InvoicesService();
// The refusal comes before anything is sent: no channel is ever asked.
const send = new InvoiceSendService(invoices, {} as never);
const subscriptions = new SubscriptionsService(invoices);
const packs = new ClassPacksService(invoices);
const courses = new CoursesService(new BookingsService(), invoices);
const orderPayLinks = new OrderPayLinkService();

const tag = `${process.pid}-${Date.now()}`;
let owner: OrganizationContext;
let storeId: string;
let customerId: string;
let productId: string;
let seq = 0;

/** No address: what DEC-068 asks for before the first invoice. */
async function clearDetails() {
    await prisma.businessProfile.update({
        where: { organizationId: owner.organizationId },
        data: {
            addressLine1: null,
            city: null,
            postalCode: null,
            gstState: null,
            gstRegistered: false,
            taxId: null,
        },
    });
}

async function contact(): Promise<string> {
    seq += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `asha${seq}-${tag}@example.in`,
                firstName: "Asha",
                lastName: "Rao",
            },
        })
    ).id;
}

async function plan(): Promise<string> {
    seq += 1;
    return (
        await prisma.subscriptionPlan.create({
            data: {
                organizationId: owner.organizationId,
                name: `Loaf a week ${seq}`,
                price: "1800",
                currency: "INR",
                interval: "MONTH",
            },
        })
    ).id;
}

async function pack(): Promise<string> {
    seq += 1;
    return (
        await prisma.classPack.create({
            data: {
                organizationId: owner.organizationId,
                name: `Five classes ${seq}`,
                credits: 5,
                validityDays: 60,
                price: "1500",
                currency: "INR",
            },
        })
    ).id;
}

/** An unpaid order for one loaf, with a pending online payment. */
async function unpaidOrder(): Promise<{ id: string; intent: string }> {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: owner.organizationId,
            customerId,
            orderId: `ORD-M3-${seq}`,
            currency: "INR",
            subtotal: "180.00",
            total: "180.00",
            items: {
                create: [{ productId, quantity: 1, price: "180.00" }],
            },
        },
    });
    const intent = `prov_${order.id}`;
    await prisma.paymentIntent.create({
        data: {
            organizationId: owner.organizationId,
            orderId: order.id,
            provider: "RAZORPAY",
            providerIntentId: intent,
            amountCents: 18000,
            currency: "INR",
            status: "REQUIRES_PAYMENT",
        },
    });
    return { id: order.id, intent };
}

async function deliver(event: Record<string, unknown>) {
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_m3_${++seq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** The refusal: a 409 naming what is missing, in the shape the app reads. */
async function refused(
    work: Promise<unknown>,
    missing: string[] = ["address"],
): Promise<void> {
    const err = await work.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({
        details: { reason: BUSINESS_DETAILS_MISSING, missing },
    });
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Hill Road Bakes", slug: `dec068-${tag}` },
    });
    const user = await prisma.user.create({
        data: { email: `dec068-${tag}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    storeId = (
        await prisma.store.create({
            data: {
                name: "Hill Road",
                slug: `dec068-store-${tag}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: `meera-${tag}@example.in`,
                firstName: "Meera",
            },
        })
    ).id;
    productId = (
        await prisma.product.create({
            data: {
                storeId,
                organizationId: org.id,
                name: "Sourdough",
                slug: `sourdough-${tag}`,
                price: "180.00",
            },
        })
    ).id;
    // Connected while the address was on file; then it is taken away, as
    // a business connected before DEC-068 may have none.
    await giveBusinessDetails(org.id);
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Public1",
        keyId: "rzp_test_Public1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

beforeEach(clearDetails);

describe("refused before money (DEC-068)", () => {
    it("Issue: a 409 naming the address; the draft keeps no number", async () => {
        const draft = await invoices.createDraft(owner, {
            contactId: await contact(),
            currency: "INR",
            lines: [{ description: "Cake", quantity: 1, unitPrice: "900" }],
        });
        await refused(invoices.issue(owner, draft.id));
        const after = await prisma.invoice.findUniqueOrThrow({
            where: { id: draft.id },
        });
        expect(after.status).toBe("DRAFT");
        expect(after.number).toBeNull();

        // Added in place, and the same Issue goes through.
        await giveBusinessDetails(owner.organizationId);
        const issued = await invoices.issue(owner, draft.id);
        expect(issued.status).toBe("ISSUED");
        expect(issued.number).not.toBeNull();
    });

    it("a GST-registered business without its GSTIN is asked for it", async () => {
        await giveBusinessDetails(owner.organizationId);
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: { gstRegistered: true, taxId: null },
        });
        const draft = await invoices.createDraft(owner, {
            contactId: await contact(),
            currency: "INR",
            lines: [{ description: "Cake", quantity: 1, unitPrice: "900" }],
        });
        await refused(invoices.issue(owner, draft.id), ["gstin"]);
    });

    it("a pay link, and Send, on an invoice already out", async () => {
        // Issued by a renewal after money: the paper exists without them.
        const issued = await prisma.$transaction(async (tx) =>
            invoices.issueInTx(tx, owner.organizationId, {
                contactId: await contact(),
                currency: "INR",
                lines: [
                    { description: "Loaf", quantity: 1, unitPrice: "1800" },
                ],
                source: "SUBSCRIPTION",
            }),
        );
        await refused(invoices.createPayLink(owner, issued.id));
        await refused(send.send(owner, issued.id));
        await refused(send.remind(owner, issued.id));
        const row = await prisma.invoice.findUniqueOrThrow({
            where: { id: issued.id },
        });
        expect(row.payTokenHash).toBeNull();

        // A member's own "Pay now" on their account is never refused.
        const mine = await invoices.payLinkForCustomer(
            prisma,
            owner.organizationId,
            issued.id,
        );
        expect(mine.token).toEqual(expect.any(String));
    });

    it("an order's pay link", async () => {
        const order = await unpaidOrder();
        await refused(orderPayLinks.make(owner, order.id));
        const row = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(row.payTokenHash).toBeNull();
    });

    it("subscribing someone: no subscription, no invoice", async () => {
        const planId = await plan();
        const contactId = await contact();
        await refused(subscriptions.subscribe(owner, { contactId, planId }));
        expect(
            await prisma.customerSubscription.count({ where: { planId } }),
        ).toBe(0);
    });

    it("restarting a paused subscription past its period, by hand", async () => {
        await giveBusinessDetails(owner.organizationId);
        const planId = await plan();
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(),
            planId,
        });
        await clearDetails();
        // Paused long enough that a restart starts a new, invoiced period.
        const past = new Date(Date.now() - 90 * 86_400_000);
        await prisma.customerSubscription.update({
            where: { id: sub.id },
            data: {
                status: "PAUSED",
                pausedAt: past,
                currentPeriodStart: past,
                currentPeriodEnd: new Date(past.getTime() + 30 * 86_400_000),
            },
        });
        await refused(subscriptions.resume(owner, sub.id));
        expect(
            (
                await prisma.customerSubscription.findUniqueOrThrow({
                    where: { id: sub.id },
                })
            ).status,
        ).toBe("PAUSED");
    });

    it("a pack sold still to be paid; a course enrolment", async () => {
        const packId = await pack();
        const contactId = await contact();
        await refused(packs.sell(owner, packId, { contactId }));
        await refused(packs.sell(owner, packId, { contactId, paidBy: "NONE" }));
        expect(await prisma.packPurchase.count({ where: { packId } })).toBe(0);
        // Refused before the course is even read: nothing is booked.
        await refused(courses.enrol(owner, "no-such-course", { contactId }));
    });

    it("connecting a payment provider", async () => {
        await refused(
            payments.connectProvider(owner, {
                provider: "CASHFREE",
                keyId: "cf_app",
                keySecret: "cf_secret",
                webhookSecret: "cf_whsec",
            }),
        );
        expect(
            await prisma.merchantPaymentProvider.count({
                where: {
                    organizationId: owner.organizationId,
                    provider: "CASHFREE",
                },
            }),
        ).toBe(0);
    });
});

describe("recorded after money, and flagged (DEC-068)", () => {
    it("an order paid online is invoiced PAID without the address", async () => {
        const order = await unpaidOrder();
        await expect(
            deliver({
                eventType: "payment.captured",
                outcome: "SUCCEEDED",
                providerIntentId: order.intent,
                providerPaymentRef: `pay_${order.id}`,
            }),
        ).resolves.toEqual({ status: "processed", changed: true });
        const paper = await prisma.invoice.findFirstOrThrow({
            where: { orderId: order.id, kind: "INVOICE" },
        });
        expect(paper.status).toBe("PAID");
        expect(paper.number).not.toBeNull();
        expect(paper.sellerAddress).toBeNull();
    });

    it("a renewal is invoiced by the job without the address", async () => {
        await giveBusinessDetails(owner.organizationId);
        const sub = await subscriptions.subscribe(owner, {
            contactId: await contact(),
            planId: await plan(),
        });
        await clearDetails();
        const row = await prisma.customerSubscription.findUniqueOrThrow({
            where: { id: sub.id },
        });
        const later = new Date(row.currentPeriodEnd.getTime() + 3_600_000);
        await subscriptions.renewOne(sub.id, later);
        const renewal = await prisma.invoice.findFirst({
            where: {
                subscriptionId: sub.id,
                periodStart: row.currentPeriodEnd,
            },
        });
        expect(renewal?.status).toBe("ISSUED");
        expect(renewal?.number).not.toBeNull();
    });

    it("a pack the desk was paid for in cash is sold and invoiced", async () => {
        const packId = await pack();
        const sold = await packs.sell(owner, packId, {
            contactId: await contact(),
            paidBy: "CASH",
        });
        const paper = await prisma.invoice.findFirst({
            where: { packPurchaseId: sold.id },
        });
        expect(paper?.number).not.toBeNull();
    });

    it("Home says so to whoever can add them, until they are added", async () => {
        const gap = await businessDetailsGap(prisma, owner.organizationId);
        expect(gap).toMatchObject({
            code: "PAYMENTS_BUSINESS_DETAILS",
            title: "Add your registered address — invoices go out without it",
            href: "/settings/organization?tab=address",
            severity: "ATTENTION",
        });
        const { needs } = flattenNeeds(gap ? [gap] : [], "Asia/Kolkata");
        expect(needs).toEqual([
            expect.objectContaining({
                code: "PAYMENTS_BUSINESS_DETAILS",
                tag: "Missing",
                tone: "bad",
                sub: expect.stringMatching(/^Payments are still recorded/),
            }),
        ]);

        const availability = {
            listViews: jest.fn().mockResolvedValue([]),
        } as unknown as ModuleAvailabilityService;
        const home = new HomeService(availability);
        const codes = async (organizationRole: "OWNER" | "MEMBER") =>
            (
                await home.build({
                    organizationId: owner.organizationId,
                    userId: owner.userId,
                    organizationRole,
                })
            ).actions.map((a) => a.code);
        expect(await codes("OWNER")).toContain("PAYMENTS_BUSINESS_DETAILS");
        // A Member can't add them: the row isn't theirs.
        expect(await codes("MEMBER")).not.toContain(
            "PAYMENTS_BUSINESS_DETAILS",
        );

        await giveBusinessDetails(owner.organizationId);
        expect(
            await businessDetailsGap(prisma, owner.organizationId),
        ).toBeNull();
    });

    it("names the GSTIN when that is what is missing", async () => {
        await giveBusinessDetails(owner.organizationId);
        await prisma.businessProfile.update({
            where: { organizationId: owner.organizationId },
            data: { gstRegistered: true, taxId: null },
        });
        expect(
            await businessDetailsGap(prisma, owner.organizationId),
        ).toMatchObject({
            title: "Add your GSTIN — invoices go out without it",
            href: "/settings/organization?tab=tax",
        });
    });

    it("says nothing to a business with no paper yet", async () => {
        const fresh = await prisma.organization.create({
            data: { name: "Not yet", slug: `dec068-fresh-${tag}` },
        });
        expect(await businessDetailsGap(prisma, fresh.id)).toBeNull();
    });
});
