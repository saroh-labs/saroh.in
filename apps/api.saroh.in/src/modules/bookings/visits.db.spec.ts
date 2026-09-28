/**
 * Visits end to end against a real Postgres (round 2, E9; DEC-050, DEC-051,
 * DEC-023): a treatment of more than one visit is sold once, as one order
 * whose line bills the Service, with a booking per visit.
 *
 * - paid in full at booking: one order, one service line, one invoice (the
 *   order's), visit 1 booked; later visits are never invoiced;
 * - paid by a 50% deposit: the deposit invoice at booking, one balance
 *   invoice when the rest is recorded, the two totalling the price;
 * - visits booked in order, never past the last, one at a time;
 * - the store customer found or made by the booking's email, and linked;
 * - no storefront: refused before any hold; another business's order: 404;
 * - a visit never refunds on its own (the E8 handoff);
 * - a hold let go before it was paid cancels the unsold treatment;
 * - the order's readers accept a service line; the database refuses a line
 *   that bills both or neither.
 *
 * Only the app env is stubbed; the provider and the webhook verifier are
 * the network-free fakes. Runs in the integration project.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { OrderKitchenService } from "../orders/order-kitchen.service";
import { listOrderRows } from "../orders/order-list";
import { OrdersService } from "../orders/orders.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { holdLines } from "../stock/reserve";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import {
    TREATMENT_NEEDS_EMAIL,
    TREATMENT_NOT_ONLINE,
    treatmentProgressInTx,
} from "./visits";

const WEBHOOK_SECRET = "whsec_visits";
const tag = `${process.pid}-${Date.now()}`;

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
const kitchen = new OrderKitchenService(payments);
const flags = {
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const orders = new OrdersService(new StoresService(flags));

let owner: OrganizationContext;
let storeId: string;
/** Three visits, 50% deposit. */
let rootCanal: string;
/** Two visits, no deposit: paid in full, or at the desk. */
let whitening: string;
let eventSeq = 0;
let keySeq = 0;
let dayOut = 3;

/** A start `dayOut` days from now at 10:00 UTC; each call a new day. */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

const EVERY_DAY = (organizationId: string) => ({
    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        organizationId,
        dayOfWeek,
        startMinute: 9 * 60,
        endMinute: 18 * 60,
    })),
});

async function service(
    organizationId: string,
    data: { name: string; visits: number; depositMode?: string },
): Promise<string> {
    return (
        await prisma.service.create({
            data: {
                organizationId,
                name: data.name,
                durationMinutes: 60,
                capacity: 1,
                priceCents: 1_200_000,
                currency: "INR",
                gstRate: "0",
                sacCode: "9993",
                timezone: "UTC",
                visits: data.visits,
                depositMode: data.depositMode ?? "NONE",
                availabilityRules: EVERY_DAY(organizationId),
            },
        })
    ).id;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `visits-${tag}` },
    });
    const user = await prisma.user.create({
        data: { email: `visits-${tag}@example.in` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await prisma.bookingRules.create({
        data: { organizationId: org.id, freeCancelHours: 24 },
    });
    storeId = (
        await prisma.store.create({
            data: {
                name: "Indiranagar clinic",
                slug: `visits-store-${tag}`,
                organizationId: org.id,
            },
        })
    ).id;
    rootCanal = await service(org.id, {
        name: "Root canal treatment",
        visits: 3,
        depositMode: "PERCENT_50",
    });
    whitening = await service(org.id, { name: "Teeth whitening", visits: 2 });
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_Visits1",
        keyId: "rzp_test_Visits1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_v_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** Book a treatment on the booking page, and pay what it asks online. */
async function bookedAndPaid(
    serviceId: string,
    email: string,
    pay: "NOW" | "DEPOSIT",
) {
    keySeq += 1;
    const { booking, payToken } = await publicBookings.bookOnline(
        serviceId,
        {
            startAt: nextStart().toISOString(),
            bookerName: "Rahul Verma",
            bookerEmail: email,
            idempotencyKey: `visit_${keySeq}`,
            pay,
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(payToken ?? "", {});
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intent.providerIntentId,
        providerPaymentRef: `pay_v_${keySeq}`,
    });
    return booking;
}

function visit(orderId: string, visitNumber: number) {
    return bookings.bookVisit(owner, orderId, {
        visitNumber,
        startAt: nextStart().toISOString(),
    });
}

describe("a treatment sold as one order (E9, real database)", () => {
    it("paid in full: one order, one service line, one invoice, visit 1 booked; later visits are never invoiced", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "rahul@example.in",
            "NOW",
        );
        expect(booking.orderId).not.toBeNull();
        expect(booking.visitNumber).toBe(1);
        const orderId = booking.orderId ?? "";

        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
            include: { items: true, customer: true },
        });
        expect(order).toMatchObject({
            storeId,
            organizationId: owner.organizationId,
            fulfilment: "APPOINTMENT_IN_PERSON",
            paymentStatus: "PAID",
            status: "PENDING",
            currency: "INR",
        });
        expect(String(order.total)).toBe("12000");
        expect(order.items).toHaveLength(1);
        expect(order.items[0]).toMatchObject({
            serviceId: whitening,
            productId: null,
            variantId: null,
            quantity: 1,
            stockRow: "NONE",
            heldQuantity: 0,
        });
        expect(order.customer.email).toBe("rahul@example.in");

        // The booking's pay-now invoice is the order's one invoice.
        const invoices = await prisma.invoice.findMany({
            where: { orderId },
            include: { lines: true },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]).toMatchObject({
            kind: "INVOICE",
            status: "PAID",
            source: "BOOKING",
            bookingId: booking.id,
        });
        expect(String(invoices[0].total)).toBe("12000");
        expect(invoices[0].lines[0].orderItemId).toBe(order.items[0].id);

        // Visit 2, booked later by the desk: no new invoice.
        const second = await visit(orderId, 2);
        expect(second).toMatchObject({
            orderId,
            visitNumber: 2,
            status: "CONFIRMED",
            paidWith: null,
        });
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
        expect(
            await prisma.invoice.count({ where: { bookingId: second.id } }),
        ).toBe(0);

        const progress = await treatmentProgressInTx(prisma, orderId);
        expect(progress).toEqual({
            visits: 2,
            booked: 2,
            attended: 0,
            done: false,
        });
    });

    it("paid by a 50% deposit: the deposit invoice at booking, one balance invoice when the rest is recorded; the two total the price", async () => {
        const booking = await bookedAndPaid(
            rootCanal,
            "farah@example.in",
            "DEPOSIT",
        );
        const orderId = booking.orderId ?? "";
        const before = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(before.paymentStatus).toBe("UNPAID");
        const deposit = await prisma.invoice.findFirstOrThrow({
            where: { orderId, kind: "INVOICE" },
        });
        expect(deposit).toMatchObject({ status: "PAID", source: "BOOKING" });
        expect(String(deposit.total)).toBe("6000");

        // Order Detail counts the deposit as paid, the rest due.
        const read = await kitchen.read(owner, orderId);
        expect(read.money).toMatchObject({
            total: "12000.00",
            paid: "6000.00",
            due: "6000.00",
        });
        expect(read.items[0]).toMatchObject({
            kind: "service",
            name: "Root canal treatment",
            productId: null,
            serviceId: rootCanal,
        });
        expect(read.next.editable).toBe(false);

        // The balance, recorded at the clinic.
        await orders.updateStatus(storeId, orderId, owner.userId, {
            paymentStatus: "PAID",
        });
        const paper = await prisma.invoice.findMany({
            where: { orderId },
            orderBy: { createdAt: "asc" },
            include: { lines: true },
        });
        expect(paper.map((i) => [i.kind, i.status])).toEqual([
            ["INVOICE", "PAID"],
            ["SUPPLEMENTARY", "PAID"],
        ]);
        const balance = paper[1];
        expect(balance.relatedInvoiceId).toBe(deposit.id);
        expect(String(balance.total)).toBe("6000");
        expect(balance.lines[0].description).toBe(
            "Balance for Root canal treatment",
        );
        expect(Number(deposit.total) + Number(balance.total)).toBe(12_000);

        // Recording it again writes nothing more.
        await orders.updateStatus(storeId, orderId, owner.userId, {
            paymentStatus: "PAID",
        });
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(2);

        const after = await kitchen.read(owner, orderId);
        expect(after.money).toMatchObject({ paid: "12000.00", due: "0.00" });
    });

    it("paid at the desk: the order's one invoice when it is paid, at the service's rate and SAC", async () => {
        keySeq += 1;
        const { booking } = await publicBookings.bookOnline(
            whitening,
            {
                startAt: nextStart().toISOString(),
                bookerName: "Leela Menon",
                bookerEmail: "leela@example.in",
                idempotencyKey: `visit_${keySeq}`,
                pay: "DESK",
            },
            "ip_1",
        );
        const orderId = booking.orderId ?? "";
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(0);

        await orders.updateStatus(storeId, orderId, owner.userId, {
            paymentStatus: "PAID",
        });
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId },
            include: { lines: true },
        });
        expect(invoice).toMatchObject({ source: "ORDER", status: "PAID" });
        expect(invoice.lines).toHaveLength(1);
        expect(invoice.lines[0]).toMatchObject({
            description: "Teeth whitening",
            quantity: 1,
        });
        expect(String(invoice.lines[0].amount)).toBe("12000");
    });

    it("refuses visit 4 of 3, and visit 3 before visit 2", async () => {
        const booking = await bookedAndPaid(
            rootCanal,
            "vikram@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";

        await expect(visit(orderId, 3)).rejects.toThrow("Book visit 2 first.");
        await expect(visit(orderId, 1)).rejects.toThrow(
            "Visit 1 is already booked.",
        );
        await visit(orderId, 2);
        await expect(visit(orderId, 4)).rejects.toThrow(
            "This treatment has 3 visits.",
        );
        await visit(orderId, 3);
        const refused = visit(orderId, 4);
        await expect(refused).rejects.toBeInstanceOf(ConflictException);
        await expect(visit(orderId, 4)).rejects.toThrow(
            "All 3 visits are booked.",
        );
        // Still one invoice for the whole treatment.
        expect(await prisma.invoice.count({ where: { orderId } })).toBe(1);
    });

    it("two people booking visit 2 at once: one wins, the other is told it's booked", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "race@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";
        const results = await Promise.allSettled([
            visit(orderId, 2),
            visit(orderId, 2),
        ]);
        const won = results.filter((r) => r.status === "fulfilled");
        const lost = results.filter(
            (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(won).toHaveLength(1);
        expect(lost).toHaveLength(1);
        expect(lost[0].reason).toBeInstanceOf(ConflictException);
        expect(
            await prisma.booking.count({
                where: {
                    orderId,
                    visitNumber: 2,
                    status: { not: "CANCELLED" },
                },
            }),
        ).toBe(1);
    });

    it("reuses the store customer an email already has at the storefront, and links them", async () => {
        const known = await prisma.customer.create({
            data: {
                storeId,
                organizationId: owner.organizationId,
                email: "Priya.Nair@Example.in",
                firstName: "Priya",
            },
        });
        const booking = await bookedAndPaid(
            whitening,
            "priya.nair@example.in",
            "NOW",
        );
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: booking.orderId ?? "" },
        });
        expect(order.customerId).toBe(known.id);
        const links = await prisma.customerIdentityLink.findMany({
            where: { customerId: known.id },
        });
        expect(links).toEqual([
            expect.objectContaining({
                contactId: booking.contactId,
                reason: "BOOKING",
            }),
        ]);
    });

    it("a visit never refunds on its own, in time or not, whoever cancels it", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "cancel@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";
        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money.treatmentOrderId).toBe(orderId);
        expect(detail.money.refundableCents).toBe(0);

        // Days before its start (well inside the free window), by the owner,
        // who may refund, asking for the money back.
        const cancelled = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(),
            { returnCredit: true },
        );
        expect(cancelled.status).toBe("CANCELLED");
        expect(cancelled.money).toEqual({
            refund: null,
            kept: null,
            treatmentOrderId: orderId,
        });
        expect(
            await prisma.paymentRefund.count({
                where: { organizationId: owner.organizationId },
            }),
        ).toBe(0);
        // The order is left as it was: paid, not cancelled.
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: orderId },
        });
        expect(order).toMatchObject({
            status: "PENDING",
            paymentStatus: "PAID",
        });
        // Its slot is free: the visit can be booked again.
        const again = await visit(orderId, 1);
        expect(again.visitNumber).toBe(1);
    });

    it("paid in full at booking: the order's refund hands the booking payment back, and its credit note lands on the booking invoice", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "refund-now@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";
        const bookingInvoice = await prisma.invoice.findFirstOrThrow({
            where: { orderId, kind: "INVOICE", source: "BOOKING" },
        });

        const result = await payments.initiateRefund(owner, orderId, {
            idempotencyKey: `treat-refund-${tag}-now`,
        });
        expect(result.refunds).toHaveLength(1);
        const row = await prisma.paymentRefund.findUniqueOrThrow({
            where: { id: result.refunds[0].id },
            include: { paymentIntent: true },
        });
        expect(row.amountCents).toBe(1_200_000);
        expect(row.paymentIntent.invoiceId).toBe(bookingInvoice.id);

        // The same key again is the same refund, not a second one.
        const again = await payments.initiateRefund(owner, orderId, {
            idempotencyKey: `treat-refund-${tag}-now`,
        });
        expect(again.refunds.map((r) => r.id)).toEqual([row.id]);

        // Its credit note offsets the booking invoice that took the money.
        const note = await prisma.invoice.findFirstOrThrow({
            where: { kind: "CREDIT_NOTE", paymentRefundId: row.id },
        });
        expect(note.relatedInvoiceId).toBe(bookingInvoice.id);
        expect(String(note.total)).toBe("12000");

        // Nothing is left: a second refund is refused.
        await expect(
            payments.initiateRefund(owner, orderId, {
                idempotencyKey: `treat-refund-${tag}-now-2`,
            }),
        ).rejects.toThrow("Nothing is left to refund on this order");
    });

    it("a deposit at booking and the balance by hand: the order's refund hands back only the deposit it received", async () => {
        const booking = await bookedAndPaid(
            rootCanal,
            "refund-deposit@example.in",
            "DEPOSIT",
        );
        const orderId = booking.orderId ?? "";
        await orders.updateStatus(storeId, orderId, owner.userId, {
            paymentStatus: "PAID",
        });

        const result = await payments.initiateRefund(owner, orderId, {
            idempotencyKey: `treat-refund-${tag}-deposit`,
        });
        expect(result.refunds).toHaveLength(1);
        expect(result.refunds[0].amountCents).toBe(600_000);
        const total = await prisma.paymentRefund.aggregate({
            where: { paymentIntent: { invoice: { orderId } } },
            _sum: { amountCents: true },
        });
        expect(total._sum.amountCents).toBe(600_000);

        // Another amount past what came in is refused.
        await expect(
            payments.initiateRefund(owner, orderId, {
                kind: "goodwill",
                amountCents: 100,
                reason: "Sorry",
                idempotencyKey: `treat-refund-${tag}-deposit-2`,
            }),
        ).rejects.toThrow();
    });

    it("a pay-now hold let go before it was paid cancels the unsold treatment", async () => {
        keySeq += 1;
        const { booking, payToken } = await publicBookings.bookOnline(
            whitening,
            {
                startAt: nextStart().toISOString(),
                bookerName: "Arjun",
                bookerEmail: "arjun@example.in",
                idempotencyKey: `visit_${keySeq}`,
                pay: "NOW",
            },
            "ip_1",
        );
        expect(booking.status).toBe("PENDING");
        await publicBookings.releasePublicHold(payToken ?? "", "ip_1");
        const order = await prisma.order.findUniqueOrThrow({
            where: { id: booking.orderId ?? "" },
        });
        expect(order.status).toBe("CANCELLED");
        const events = await prisma.orderEvent.findMany({
            where: { orderId: order.id },
        });
        expect(events).toEqual([
            expect.objectContaining({ kind: "STATUS", toStatus: "CANCELLED" }),
        ]);
    });

    it("another business's order is a 404", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "other@example.in",
            "NOW",
        );
        const org = await prisma.organization.create({
            data: { name: "Elsewhere", slug: `visits-other-${tag}` },
        });
        const stranger: OrganizationContext = {
            organizationId: org.id,
            userId: owner.userId,
            role: "OWNER",
        };
        await expect(
            bookings.bookVisit(stranger, booking.orderId ?? "", {
                visitNumber: 2,
                startAt: nextStart().toISOString(),
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("the order's readers accept a service line: the list, and stock that holds nothing", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "reader@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";
        const list = await listOrderRows(
            owner.organizationId,
            {},
            { money: true, contact: true },
        );
        const row = list.rows.find((r) => r.id === orderId);
        expect(row).toMatchObject({
            productNames: ["Teeth whitening"],
            unpaidAmount: "0.00",
        });
        // Stock never holds a service line.
        const item = await prisma.orderItem.findFirstOrThrow({
            where: { orderId },
        });
        await prisma.$transaction((tx) => holdLines(tx, [item.id]));
        const after = await prisma.orderItem.findUniqueOrThrow({
            where: { id: item.id },
        });
        expect(after).toMatchObject({
            stockRow: "NONE",
            stockLevelId: null,
            heldQuantity: 0,
        });
    });
});

describe("a treatment refused before anything is held (E9)", () => {
    it("with no storefront, the booking page says so and holds nothing", async () => {
        const org = await prisma.organization.create({
            data: { name: "No Shop Dental", slug: `visits-noshop-${tag}` },
        });
        const serviceId = await service(org.id, {
            name: "Root canal treatment",
            visits: 3,
        });
        await expect(
            publicBookings.bookOnline(
                serviceId,
                {
                    startAt: nextStart().toISOString(),
                    bookerName: "Anil",
                    bookerEmail: "anil@example.in",
                    pay: "DESK",
                },
                "ip_2",
            ),
        ).rejects.toThrow(TREATMENT_NOT_ONLINE);
        expect(await prisma.booking.count({ where: { serviceId } })).toBe(0);
        expect(
            await prisma.order.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("with Commerce switched off, where its order would live, it is refused too", async () => {
        const org = await prisma.organization.create({
            data: { name: "Shop Off Dental", slug: `visits-shopoff-${tag}` },
        });
        await prisma.store.create({
            data: {
                name: "Clinic",
                slug: `visits-shopoff-store-${tag}`,
                organizationId: org.id,
            },
        });
        await prisma.organizationModule.create({
            data: {
                organizationId: org.id,
                moduleKey: "COMMERCE",
                status: "DISABLED",
            },
        });
        const serviceId = await service(org.id, {
            name: "Teeth whitening",
            visits: 2,
        });
        await expect(
            publicBookings.bookOnline(
                serviceId,
                {
                    startAt: nextStart().toISOString(),
                    bookerName: "Anil",
                    bookerEmail: "anil@example.in",
                    pay: "DESK",
                },
                "ip_2",
            ),
        ).rejects.toThrow(TREATMENT_NOT_ONLINE);
        expect(await prisma.booking.count({ where: { serviceId } })).toBe(0);
    });

    it("a staff booking for a contact with no real email asks for one", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: `removed+${tag}@removed.invalid`,
                firstName: "Gone",
            },
        });
        await expect(
            bookings.bookByHand(owner, whitening, {
                startAt: nextStart().toISOString(),
                contactId: contact.id,
            }),
        ).rejects.toThrow(TREATMENT_NEEDS_EMAIL);
    });
});

describe("an order line bills exactly one thing (E9, the CHECK)", () => {
    // `prisma db push` never runs a migration, so the suite adds the
    // migration's CHECK when it isn't there (RLS mode replays the chain and
    // already has it).
    beforeAll(async () => {
        const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*) AS n FROM pg_constraint
            WHERE conname = 'OrderItem_bills_one_thing'`;
        if (Number(n) === 0) {
            await prisma.$executeRawUnsafe(
                `ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_bills_one_thing" CHECK (num_nonnulls("productId", "serviceId") = 1)`,
            );
        }
    });

    it("refuses a line with both a product and a service, or neither", async () => {
        const booking = await bookedAndPaid(
            whitening,
            "check@example.in",
            "NOW",
        );
        const orderId = booking.orderId ?? "";
        const product = await prisma.product.create({
            data: {
                storeId,
                organizationId: owner.organizationId,
                name: "Mouthwash",
                slug: `mouthwash-${tag}`,
                price: "200.00",
            },
        });
        await expect(
            prisma.orderItem.create({
                data: {
                    orderId,
                    productId: product.id,
                    serviceId: whitening,
                    quantity: 1,
                    price: "1.00",
                },
            }),
        ).rejects.toThrow();
        await expect(
            prisma.orderItem.create({
                data: { orderId, quantity: 1, price: "1.00" },
            }),
        ).rejects.toThrow();
    });
});
