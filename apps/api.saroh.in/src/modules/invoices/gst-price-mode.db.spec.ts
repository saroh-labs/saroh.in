/**
 * How a business's prices carry GST, against a real Postgres (12 Oct 2026,
 * amending ADR-008): every business starts with prices that include GST;
 * the setting is a registered business's alone; a product or a service can
 * be priced the other way; an order and a booking made under "GST is
 * added" charge the price plus its GST, record what they were charged
 * under, and are invoiced for exactly that; and after the business changes
 * its mind, paper already out and the credit notes against it keep what was
 * charged while new sales follow the new choice.
 *
 * The sums, at 18%: ₹1,000 added is ₹1,180 (₹1,000 taxable, ₹180 GST);
 * a 25% deposit of it is ₹295 (₹250 taxable, ₹45 GST).
 *
 * Only the app env is stubbed (for the credential key); the provider and
 * the webhook verifier are the network-free fakes. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { BookingsService } from "../bookings/bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { MediaService } from "../media/media.service";
import type { CreateOrderDto } from "../orders/dto";
import { OrdersService } from "../orders/orders.service";
import { OrganizationSettingsService } from "../organizations/organization-settings.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { ProductsService } from "../products/products.service";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { creditRestOfOrder } from "./order-invoicing";

const WEBHOOK_SECRET = "whsec_price_mode";
const HOUR = 3_600_000;
const tag = `${process.pid}-${Date.now()}`;

const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const orders = new OrdersService(stores);
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const publicInvoices = new PublicInvoicesService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const bookings = new BookingsService(undefined, payments);
const settings = new OrganizationSettingsService(
    { record: () => Promise.resolve() } as unknown as AuditService,
    {} as MediaService,
);

/** Glow Studio: GST-registered in Karnataka. */
let owner: OrganizationContext;
/** A business that charges no GST. */
let unregistered: OrganizationContext;
let ownerId = "";
let storeId = "";
/** ₹1,000 at 18%. */
let serum = "";
/** ₹1,000 at 18%, 25% deposit. */
let facial = "";
let eventSeq = 0;
let keySeq = 0;
let dayOut = 3;

/** A start a day further out each time, at 10:00 UTC, inside the hours. */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_pm_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A walk-in buys `quantity` of the serum, paid in cash. */
const sell = (quantity: number, received: string) =>
    orders.create(storeId, ownerId, {
        items: [{ productId: serum, quantity }],
        fulfilment: "PICKUP",
        walkIn: { name: "Asha" },
        payment: { kind: "CASH", received },
    } as CreateOrderDto);

/** The order as it was stored: its total, its line and its paper. */
const stored = (id: string) =>
    prisma.order.findUniqueOrThrow({
        where: { id },
        select: {
            total: true,
            items: {
                select: {
                    quantity: true,
                    price: true,
                    listPrice: true,
                    gstPriceMode: true,
                },
            },
            invoices: {
                orderBy: { createdAt: "asc" },
                select: {
                    kind: true,
                    subtotal: true,
                    tax: true,
                    total: true,
                    cgst: true,
                    sgst: true,
                    lines: {
                        select: {
                            unitPrice: true,
                            amount: true,
                            taxableValue: true,
                            cgst: true,
                            sgst: true,
                            gstRate: true,
                            gstPriceMode: true,
                        },
                    },
                },
            },
        },
    });

const setMode = (priceMode: "INCLUDED" | "ADDED") =>
    settings.update(owner, { tax: { priceMode } });

beforeAll(async () => {
    ownerId = (
        await prisma.user.create({
            data: { email: `price-mode-${tag}@example.com` },
        })
    ).id;
    const org = await prisma.organization.create({
        data: { name: "Glow Studio", slug: `price-mode-${tag}` },
    });
    const plain = await prisma.organization.create({
        data: { name: "Plain Studio", slug: `price-mode-plain-${tag}` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: ownerId, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: ownerId, role: "OWNER" };
    unregistered = {
        organizationId: plain.id,
        userId: ownerId,
        role: "OWNER",
    };
    await prisma.businessProfile.create({
        data: {
            organizationId: org.id,
            taxId: "29AAGCR4375J1ZU",
            gstRegistered: true,
            gstState: "29",
            invoicePrefix: "GS",
            timezone: "UTC",
            addressLine1: "14 Hill Road",
            city: "Bengaluru",
            postalCode: "560038",
        },
    });
    await prisma.bookingRules.create({
        data: { organizationId: org.id, freeCancelHours: 24 },
    });
    storeId = (
        await stores.createForUser(ownerId, org.id, {
            name: "Hill Road",
            slug: `price-mode-store-${tag}`,
        })
    ).id;
    await prisma.storeSettings.upsert({
        where: { storeId },
        create: {
            storeId,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    serum = (
        await products.create(storeId, ownerId, {
            name: "Face serum",
            price: "1000",
            gstRate: "18",
        })
    ).id;
    facial = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Facial",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 100_000,
                currency: "INR",
                gstRate: "18",
                timezone: "UTC",
                depositMode: "PERCENT_25",
                availabilityRules: {
                    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                        organizationId: org.id,
                        dayOfWeek,
                        startMinute: 9 * 60,
                        endMinute: 18 * 60,
                    })),
                },
            },
        })
    ).id;
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_PriceMode1",
        keyId: "rzp_test_PriceMode1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

describe("the business's choice (real database)", () => {
    it("starts as prices that include GST, and an order charges the typed price", async () => {
        const profile = await prisma.businessProfile.findUniqueOrThrow({
            where: { organizationId: owner.organizationId },
            select: { gstPriceMode: true },
        });
        expect(profile.gstPriceMode).toBe("INCLUDED");

        const order = await stored((await sell(2, "2000")).id);
        expect(order.total.toString()).toBe("2000");
        expect(order.items).toHaveLength(1);
        expect(order.items[0]!.price.toString()).toBe("1000");
        expect(order.items[0]!.listPrice?.toString()).toBe("1000");
        expect(order.items[0]!.gstPriceMode).toBe("INCLUDED");
        // ₹2,000 including 18%: ₹1,694.92 taxable, ₹305.08 GST.
        const invoice = order.invoices[0]!;
        expect(invoice.total.toString()).toBe("2000");
        expect(invoice.subtotal.toString()).toBe("1694.92");
        expect(invoice.tax.toString()).toBe("305.08");
        expect(invoice.lines[0]!.gstPriceMode).toBe("INCLUDED");
    });

    it("is refused for a business that is not GST-registered", async () => {
        await expect(
            settings.update(unregistered, { tax: { priceMode: "ADDED" } }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(
            await prisma.businessProfile.findUnique({
                where: { organizationId: unregistered.organizationId },
                select: { gstPriceMode: true },
            }),
        ).toBeNull();
    });

    it("saves 'GST is added' and reads it back", async () => {
        const saved = await setMode("ADDED");
        expect(saved.tax.priceMode).toBe("ADDED");
        const profile = await prisma.businessProfile.findUniqueOrThrow({
            where: { organizationId: owner.organizationId },
            select: { gstPriceMode: true },
        });
        expect(profile.gstPriceMode).toBe("ADDED");
    });
});

describe("an order under 'GST is added' (real database)", () => {
    let orderId = "";

    it("charges the price plus its GST, and records what it was charged under", async () => {
        orderId = (await sell(2, "2360")).id;
        const order = await stored(orderId);
        // 2 × (₹1,000 + ₹180) = ₹2,360.
        expect(order.total.toString()).toBe("2360");
        expect(order.items[0]!.price.toString()).toBe("1180");
        expect(order.items[0]!.listPrice?.toString()).toBe("1000");
        expect(order.items[0]!.gstPriceMode).toBe("ADDED");

        const invoice = order.invoices[0]!;
        expect(invoice.kind).toBe("INVOICE");
        expect(invoice.total.toString()).toBe("2360");
        expect(invoice.subtotal.toString()).toBe("2000");
        expect(invoice.tax.toString()).toBe("360");
        expect(invoice.cgst.toString()).toBe("180");
        expect(invoice.sgst.toString()).toBe("180");
        expect(invoice.lines).toHaveLength(1);
        const line = invoice.lines[0]!;
        expect(line.unitPrice.toString()).toBe("1180");
        expect(line.amount.toString()).toBe("2360");
        expect(line.taxableValue?.toString()).toBe("2000");
        expect(line.cgst.toString()).toBe("180");
        expect(line.sgst.toString()).toBe("180");
        expect(line.gstRate?.toString()).toBe("18");
        expect(line.gstPriceMode).toBe("ADDED");
    });

    it("a product priced the other way keeps its own way", async () => {
        await prisma.product.update({
            where: { id: serum },
            data: { gstPriceMode: "INCLUDED" },
        });
        try {
            const order = await stored((await sell(1, "1000")).id);
            expect(order.total.toString()).toBe("1000");
            expect(order.items[0]!.price.toString()).toBe("1000");
            expect(order.items[0]!.gstPriceMode).toBe("INCLUDED");
        } finally {
            await prisma.product.update({
                where: { id: serum },
                data: { gstPriceMode: null },
            });
        }
    });

    it("after the business changes its mind, the order and its credit note keep what was charged", async () => {
        await setMode("INCLUDED");
        try {
            // A new sale follows the new choice.
            const fresh = await stored((await sell(1, "1000")).id);
            expect(fresh.total.toString()).toBe("1000");
            expect(fresh.items[0]!.gstPriceMode).toBe("INCLUDED");

            // The order already placed is untouched.
            const before = await stored(orderId);
            expect(before.total.toString()).toBe("2360");
            expect(before.items[0]!.price.toString()).toBe("1180");
            expect(before.items[0]!.gstPriceMode).toBe("ADDED");
            expect(before.invoices).toHaveLength(1);
            expect(before.invoices[0]!.total.toString()).toBe("2360");

            // Refunded in full: the credit note reverses ₹2,000 + ₹360.
            await prisma.$transaction((tx) =>
                creditRestOfOrder(tx, orderId, "Refund", null),
            );
            const after = await stored(orderId);
            const note = after.invoices.find((i) => i.kind === "CREDIT_NOTE");
            expect(note).toBeDefined();
            expect(note!.total.toString()).toBe("2360");
            expect(note!.subtotal.toString()).toBe("2000");
            expect(note!.tax.toString()).toBe("360");
            expect(note!.cgst.toString()).toBe("180");
            expect(note!.sgst.toString()).toBe("180");
            expect(note!.lines[0]!.gstPriceMode).toBe("ADDED");
            // The invoice itself still says what it said.
            const invoice = after.invoices.find((i) => i.kind === "INVOICE");
            expect(invoice!.total.toString()).toBe("2360");
            expect(invoice!.tax.toString()).toBe("360");
        } finally {
            await setMode("ADDED");
        }
    });
});

describe("a service under 'GST is added' (real database)", () => {
    it("the team reads what a customer pays, and its own way when it has one", async () => {
        const view = await bookings.getService(owner, facial);
        expect(view).toMatchObject({
            priceCents: 100_000,
            payCents: 118_000,
            // 25% of ₹1,180, not of ₹1,000.
            depositCents: 29_500,
            gstPriceMode: null,
            gst: {
                mode: "ADDED",
                rate: "18",
                listCents: 100_000,
                gstCents: 18_000,
                payCents: 118_000,
            },
        });

        const own = await bookings.updateService(owner, facial, {
            gstPriceMode: "INCLUDED",
        });
        expect(own).toMatchObject({
            gstPriceMode: "INCLUDED",
            payCents: 100_000,
            depositCents: 25_000,
            gst: { mode: "INCLUDED", gstCents: 15_254, payCents: 100_000 },
        });

        const back = await bookings.updateService(owner, facial, {
            gstPriceMode: null,
        });
        expect(back).toMatchObject({
            gstPriceMode: null,
            payCents: 118_000,
            depositCents: 29_500,
        });
    });

    it("a booking takes 25% of ₹1,180 as its deposit, and a cancel hands back exactly that after the mode changes", async () => {
        keySeq += 1;
        const startAt = nextStart();
        const { booking, payToken } = await publicBookings.bookOnline(
            facial,
            {
                startAt: startAt.toISOString(),
                bookerName: "Meera Iyer",
                bookerEmail: "meera@example.com",
                idempotencyKey: `pm_${keySeq}`,
                pay: "DEPOSIT",
            },
            "ip_1",
        );
        const intent = await publicInvoices.createIntent(payToken ?? "", {});
        // The provider is asked for the deposit of the amount to pay.
        await expect(
            prisma.paymentIntent.findFirstOrThrow({
                where: { providerIntentId: intent.providerIntentId },
                select: { amountCents: true },
            }),
        ).resolves.toEqual({ amountCents: 29_500 });
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `pay_pm_${keySeq}`,
        });

        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row).toMatchObject({ status: "CONFIRMED", paidWith: "PAID" });
        expect(row.snapshot).toMatchObject({
            service: {
                priceCents: 118_000,
                listPriceCents: 100_000,
                gstPriceMode: "ADDED",
            },
            deposit: { cents: 29_500 },
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id, kind: "INVOICE" },
            include: { lines: true },
        });
        expect(invoice.status).toBe("PAID");
        expect(invoice.total.toString()).toBe("295");
        expect(invoice.subtotal.toString()).toBe("250");
        expect(invoice.tax.toString()).toBe("45");
        expect(invoice.lines[0]!.taxableValue?.toString()).toBe("250");
        expect(invoice.lines[0]!.cgst.toString()).toBe("22.5");
        expect(invoice.lines[0]!.sgst.toString()).toBe("22.5");
        expect(invoice.lines[0]!.gstPriceMode).toBe("ADDED");

        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money).toMatchObject({
            priceCents: 118_000,
            paidOnlineCents: 29_500,
            deposit: true,
            // ₹1,180 less the ₹295 paid.
            dueCents: 88_500,
        });

        // The business goes back to prices that include GST.
        await setMode("INCLUDED");
        try {
            const still = await bookings.getBooking(owner, booking.id);
            expect(still.money).toMatchObject({
                priceCents: 118_000,
                dueCents: 88_500,
            });

            await bookings.cancelBooking(
                owner,
                booking.id,
                new Date(startAt.getTime() - 48 * HOUR),
            );
            const refund = await prisma.paymentRefund.findFirstOrThrow({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            });
            expect(refund.amountCents).toBe(29_500);
            await webhook({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerIntentId: intent.providerIntentId,
                providerRefundId: refund.providerRefundId,
                refundReference: refund.id,
                refundAmountCents: 29_500,
            });
            const note = await prisma.invoice.findFirstOrThrow({
                where: { paymentRefundId: refund.id },
                include: { lines: true },
            });
            expect(note.kind).toBe("CREDIT_NOTE");
            expect(note.total.toString()).toBe("295");
            expect(note.subtotal.toString()).toBe("250");
            expect(note.tax.toString()).toBe("45");
            expect(note.lines[0]!.gstPriceMode).toBe("ADDED");
        } finally {
            await setMode("ADDED");
        }
    });
});
