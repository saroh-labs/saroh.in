/**
 * Deposits end to end against a real Postgres (round 2, E8; DEC-051,
 * DEC-026, DEC-023): a deposit paid online through the pay-now path and
 * confirmed by the webhook with the rest due; a cancel in time refunding it
 * once — PENDING, then SUCCEEDED with a credit note when the provider
 * confirms — and a late one keeping it; the free-cancel deadline fixed at
 * booking, so a move never makes a late cancel free; an unsure provider
 * holding the refund; and two cancels racing for one refund. And the
 * business's own refund policy for cancels in time (E30, DEC-058).
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

import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { StaffService } from "../staff/staff.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { ReleaseHoldsHandler } from "./release-holds.handler";

const WEBHOOK_SECRET = "whsec_deposits";
const HOUR = 3_600_000;

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
const sweep = new ReleaseHoldsHandler();

let owner: OrganizationContext;
/** Someone at the desk: changes bookings, never refunds money. */
let desk: OrganizationContext;
let rootCanal: string;
let eventSeq = 0;
let keySeq = 0;
let dayOut = 3;

/**
 * A start `days` from now at 10:00 UTC — inside the clinic's hours, every
 * day. Each booking takes a day of its own, so none clash.
 */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `deposits-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `deposits-${process.pid}@example.in` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    desk = {
        ...owner,
        role: "MEMBER",
        actions: new Set(["booking:read", "booking:write"]),
    };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    // Free to cancel until 24 hours before the start.
    await prisma.bookingRules.create({
        data: { organizationId: org.id, freeCancelHours: 24 },
    });
    rootCanal = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Root canal",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
                depositMode: "PERCENT_50",
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
        publicKey: "rzp_test_Deposit1",
        keyId: "rzp_test_Deposit1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

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

/** Book the root canal paying its deposit, and pay it through the webhook. */
async function depositPaid(email: string, startAt = nextStart()) {
    keySeq += 1;
    const { booking, payToken } = await publicBookings.bookOnline(
        rootCanal,
        {
            startAt: startAt.toISOString(),
            bookerName: "Meera Iyer",
            bookerEmail: email,
            idempotencyKey: `dep_${keySeq}`,
            pay: "DEPOSIT",
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(payToken ?? "", {});
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intent.providerIntentId,
        providerPaymentRef: `pay_${keySeq}`,
    });
    return { booking, intent, startAt };
}

describe("a deposit at booking (E8, real database)", () => {
    it("takes the deposit online; the webhook confirms the booking with the rest due", async () => {
        const { booking, startAt } = await depositPaid("meera@example.in");

        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row).toMatchObject({ status: "CONFIRMED", paidWith: "PAID" });
        // The deadline fixed now: the start less 24 hours.
        expect(row.freeCancelUntil?.toISOString()).toBe(
            new Date(startAt.getTime() - 24 * HOUR).toISOString(),
        );
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id },
        });
        expect(invoice).toMatchObject({ status: "PAID", source: "BOOKING" });
        expect(String(invoice.total)).toBe("400");

        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money).toEqual({
            priceCents: 80_000,
            currency: "INR",
            paidOnlineCents: 40_000,
            deposit: true,
            dueCents: 40_000,
            refund: null,
            refundableCents: 40_000,
            refundInTimeCancels: true,
            treatmentOrderId: null,
            // The rest is taken at the desk (P2); a link never bills a balance.
            paidAtDeskCents: 0,
            deskMethod: null,
            take: { cents: 40_000, byLink: false },
        });
    });

    it("the booking page serves the deposit, and books it only online", async () => {
        const site = await prisma.site.create({
            data: {
                organizationId: owner.organizationId,
                name: "Kavi Dental",
                slug: `kavi-${process.pid}`,
            },
        });
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: owner.organizationId,
                snapshot: {},
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
        const page = await publicBookings.publicBookingPage(site.id);
        expect(page.services).toEqual([
            expect.objectContaining({ id: rootCanal, depositCents: 40_000 }),
        ]);
        await expect(
            publicBookings.bookOnline(
                rootCanal,
                {
                    startAt: nextStart().toISOString(),
                    bookerEmail: "desk@example.in",
                    pay: "DESK",
                },
                "ip_1",
            ),
        ).rejects.toThrow("This takes a deposit when you book.");
    });
});

describe("cancelling a booking with a deposit (E8, DEC-051, real database)", () => {
    it("in time: one refund, PENDING, then SUCCEEDED with a credit note once the provider confirms", async () => {
        const { booking, intent, startAt } =
            await depositPaid("in-time@example.in");
        const calls = fake.refundCalls.length;

        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(startAt.getTime() - 48 * HOUR),
        );
        expect(out.money).toEqual({
            refund: { amountCents: 40_000, currency: "INR", status: "SENT" },
            kept: null,
        });
        expect(fake.refundCalls.length).toBe(calls + 1);
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { idempotencyKey: `deposit-refund:${booking.id}` },
        });
        expect(refund).toMatchObject({
            status: "PENDING",
            amountCents: 40_000,
        });
        // Saroh's reference is the row's id (DEC-026).
        expect(fake.refundCalls.at(-1)?.reference).toBe(refund.id);
        // No credit note until the provider confirms it (DEC-023).
        expect(
            await prisma.invoice.count({
                where: { paymentRefundId: refund.id },
            }),
        ).toBe(0);

        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: intent.providerIntentId,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.id,
            refundAmountCents: 40_000,
        });
        await expect(
            prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).resolves.toMatchObject({ status: "SUCCEEDED" });
        const note = await prisma.invoice.findFirstOrThrow({
            where: { paymentRefundId: refund.id },
        });
        expect(note).toMatchObject({ kind: "CREDIT_NOTE", status: "ISSUED" });
        expect(String(note.total)).toBe("400");
        await expect(
            prisma.invoice.findFirstOrThrow({
                where: { bookingId: booking.id, kind: "INVOICE" },
            }),
        ).resolves.toMatchObject({ status: "CREDITED" });

        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money.refund).toEqual({
            amountCents: 40_000,
            status: "SUCCEEDED",
            beingConfirmed: false,
        });
        expect(detail.money.dueCents).toBeNull();

        // The same confirmation again changes nothing, and makes no note.
        await webhook({
            eventType: "refund.processed",
            outcome: "REFUNDED",
            providerIntentId: intent.providerIntentId,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.id,
            refundAmountCents: 40_000,
        });
        expect(
            await prisma.invoice.count({
                where: { paymentRefundId: refund.id },
            }),
        ).toBe(1);
    });

    it("after the window: no refund, the deposit kept and said so", async () => {
        const { booking, startAt } = await depositPaid("late@example.in");
        const calls = fake.refundCalls.length;

        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(startAt.getTime() - 2 * HOUR),
        );
        expect(out.money).toEqual({
            refund: null,
            kept: { amountCents: 40_000, currency: "INR" },
        });
        expect(out.cancelledLate).toBe(true);
        expect(fake.refundCalls.length).toBe(calls);
        expect(
            await prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            }),
        ).toBe(0);
    });

    it("made 3 days out with a 24-hour window, moved a week later, cancelled after the first deadline: late, the deposit kept", async () => {
        const { booking, startAt } = await depositPaid("moved@example.in");
        const deadline = new Date(startAt.getTime() - 24 * HOUR);

        // A week later, in the afternoon: no other test books then.
        const later = new Date(startAt.getTime() + (7 * 24 + 5) * HOUR);
        const moved = await bookings.rescheduleBooking(owner, booking.id, {
            startAt: later.toISOString(),
        });
        expect(moved.startAt.toISOString()).toBe(later.toISOString());
        // The move keeps the deadline it was given.
        expect(moved.freeCancelUntil?.toISOString()).toBe(
            deadline.toISOString(),
        );

        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(deadline.getTime() + HOUR),
        );
        expect(out.cancelledLate).toBe(true);
        expect(out.money.kept).toEqual({
            amountCents: 40_000,
            currency: "INR",
        });
        expect(out.money.refund).toBeNull();
    });

    it("a booking made before the column is judged by its start, as before", async () => {
        const { booking, startAt } = await depositPaid("before@example.in");
        await prisma.booking.update({
            where: { id: booking.id },
            data: { freeCancelUntil: null },
        });
        // 30 hours before the start: in time by the start and today's rule.
        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(startAt.getTime() - 30 * HOUR),
        );
        expect(out.cancelledLate).toBe(false);
        expect(out.money.refund).toMatchObject({ amountCents: 40_000 });
    });

    it("the provider timing out holds the refund PENDING, being confirmed, and a retried cancel sends nothing more", async () => {
        const { booking, startAt } = await depositPaid("unsure@example.in");
        fake.failNextRefund("UNKNOWN");
        const calls = fake.refundCalls.length;
        const when = new Date(startAt.getTime() - 48 * HOUR);

        const out = await bookings.cancelBooking(owner, booking.id, when);
        expect(out.status).toBe("CANCELLED");
        expect(out.money.refund).toMatchObject({ status: "CONFIRMING" });
        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money.refund).toEqual({
            amountCents: 40_000,
            status: "PENDING",
            beingConfirmed: true,
        });

        // The same cancel, retried after the timeout: the same row, and no
        // second provider call.
        const again = await bookings.cancelBooking(owner, booking.id, when);
        expect(again.status).toBe("CANCELLED");
        expect(fake.refundCalls.length).toBe(calls + 1);
        expect(
            await prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            }),
        ).toBe(1);
    });

    it("a definite refusal marks the refund FAILED and says so", async () => {
        const { booking, startAt } = await depositPaid("refused@example.in");
        fake.failNextRefund("REFUSED");
        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(startAt.getTime() - 48 * HOUR),
        );
        expect(out.money.refund).toMatchObject({ status: "REFUSED" });
        await expect(
            prisma.paymentRefund.findFirstOrThrow({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            }),
        ).resolves.toMatchObject({ status: "FAILED" });
    });

    it("the business calling it off late: refunded for someone who may refund, kept for the desk", async () => {
        const first = await depositPaid("override-owner@example.in");
        const byOwner = await bookings.cancelBooking(
            owner,
            first.booking.id,
            new Date(first.startAt.getTime() - 2 * HOUR),
            { returnCredit: true },
        );
        expect(byOwner.money.refund).toMatchObject({ amountCents: 40_000 });

        const second = await depositPaid("override-desk@example.in");
        const byDesk = await bookings.cancelBooking(
            desk,
            second.booking.id,
            new Date(second.startAt.getTime() - 2 * HOUR),
            { returnCredit: true },
        );
        expect(byDesk.status).toBe("CANCELLED");
        expect(byDesk.money).toEqual({
            refund: null,
            kept: { amountCents: 40_000, currency: "INR" },
        });
    });

    it("a staff cancel and a customer's at the same moment: one cancel, one refund, one provider call", async () => {
        const { booking, startAt } = await depositPaid("race@example.in");
        const calls = fake.refundCalls.length;
        const when = new Date(startAt.getTime() - 48 * HOUR);

        const both = await Promise.allSettled([
            bookings.cancelBooking(owner, booking.id, when),
            bookings.cancelBooking(desk, booking.id, when),
        ]);
        expect(both.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
        expect(
            await prisma.bookingEvent.count({
                where: { bookingId: booking.id, type: "CANCELLED" },
            }),
        ).toBe(1);
        expect(
            await prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            }),
        ).toBe(1);
        expect(fake.refundCalls.length).toBe(calls + 1);
    });

    it("a refund racing an expiring hold's release doesn't deadlock", async () => {
        const { booking, startAt } = await depositPaid("sweep-race@example.in");
        // Another booker's hold, run out, for the sweep to let go.
        keySeq += 1;
        const { booking: hold } = await publicBookings.bookOnline(
            rootCanal,
            {
                startAt: nextStart().toISOString(),
                bookerEmail: "gone@example.in",
                idempotencyKey: `dep_${keySeq}`,
                pay: "DEPOSIT",
            },
            "ip_1",
        );
        await prisma.booking.update({
            where: { id: hold.id },
            data: { holdExpiresAt: new Date(Date.now() - 60_000) },
        });

        const [cancelled] = await Promise.all([
            bookings.cancelBooking(
                owner,
                booking.id,
                new Date(startAt.getTime() - 48 * HOUR),
            ),
            sweep.releaseExpired(new Date()),
        ]);
        expect(cancelled.money.refund).toMatchObject({ amountCents: 40_000 });
        await expect(
            prisma.booking.findUniqueOrThrow({ where: { id: hold.id } }),
        ).resolves.toMatchObject({ status: "CANCELLED" });
    });

    it("a booking paid at the desk refunds nothing", async () => {
        const plain = await prisma.service.create({
            data: {
                organizationId: owner.organizationId,
                name: "Check-up",
                durationMinutes: 30,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: owner.organizationId,
                        dayOfWeek: 1,
                        startMinute: 9 * 60,
                        endMinute: 12 * 60,
                    },
                },
            },
        });
        const monday = new Date();
        monday.setUTCHours(9, 0, 0, 0);
        monday.setUTCDate(
            monday.getUTCDate() + ((1 - monday.getUTCDay() + 7) % 7 || 7),
        );
        const { booking } = await publicBookings.bookOnline(
            plain.id,
            {
                startAt: monday.toISOString(),
                bookerEmail: "desk-paid@example.in",
                pay: "DESK",
            },
            "ip_1",
        );
        const out = await bookings.cancelBooking(owner, booking.id);
        expect(out.money).toEqual({ refund: null, kept: null });
        const detail = await bookings.getBooking(owner, booking.id);
        expect(detail.money.paidOnlineCents).toBe(0);
    });
});

describe("the business's refund policy for cancels in time (E30, DEC-058, real database)", () => {
    const staff = new StaffService();
    const inTime = (startAt: Date) => new Date(startAt.getTime() - 48 * HOUR);
    afterEach(async () => {
        await staff.updateBookingRules(owner, { refundInTimeCancels: true });
    });

    it("never set: on, as E8 shipped, and the booking page says so", async () => {
        await expect(
            prisma.bookingRules.findUniqueOrThrow({
                where: { organizationId: owner.organizationId },
            }),
        ).resolves.toMatchObject({
            freeCancelHours: 24,
            refundInTimeCancels: true,
        });
        const { booking, startAt } = await depositPaid(
            "policy-default@example.in",
        );
        const before = await bookings.getBooking(owner, booking.id);
        expect(before.money).toMatchObject({
            paidOnlineCents: 40_000,
            refundableCents: 40_000,
            refundInTimeCancels: true,
        });
        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            inTime(startAt),
        );
        expect(out.money.refund).toMatchObject({ amountCents: 40_000 });
        const after = await bookings.getBooking(owner, booking.id);
        expect(after.money.refundableCents).toBe(0);
    });

    it("off: a cancel in time keeps what was paid, and the booking page says so", async () => {
        await expect(
            staff.updateBookingRules(owner, { refundInTimeCancels: false }),
        ).resolves.toMatchObject({
            freeCancelHours: 24,
            refundInTimeCancels: false,
        });
        const { booking, startAt } = await depositPaid("policy-off@example.in");
        expect(
            (await bookings.getBooking(owner, booking.id)).money
                .refundInTimeCancels,
        ).toBe(false);
        const calls = fake.refundCalls.length;

        const out = await bookings.cancelBooking(
            desk,
            booking.id,
            inTime(startAt),
        );
        expect(out.cancelledLate).toBe(false);
        expect(out.money).toEqual({
            refund: null,
            kept: { amountCents: 40_000, currency: "INR" },
        });
        expect(fake.refundCalls.length).toBe(calls);
        expect(
            await prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${booking.id}` },
            }),
        ).toBe(0);
    });

    it("off: someone who may refund hands it back by hand; the desk can't", async () => {
        await staff.updateBookingRules(owner, { refundInTimeCancels: false });
        const first = await depositPaid("policy-off-owner@example.in");
        const byOwner = await bookings.cancelBooking(
            owner,
            first.booking.id,
            inTime(first.startAt),
            { returnCredit: true },
        );
        expect(byOwner.money.refund).toMatchObject({ amountCents: 40_000 });
        await expect(
            prisma.paymentRefund.findFirstOrThrow({
                where: { idempotencyKey: `deposit-refund:${first.booking.id}` },
            }),
        ).resolves.toMatchObject({
            amountCents: 40_000,
            reason: "Booking cancelled by the business",
        });

        const second = await depositPaid("policy-off-desk@example.in");
        const byDesk = await bookings.cancelBooking(
            desk,
            second.booking.id,
            inTime(second.startAt),
            { returnCredit: true },
        );
        expect(byDesk.money).toEqual({
            refund: null,
            kept: { amountCents: 40_000, currency: "INR" },
        });
    });

    it("on: a late cancel is still kept", async () => {
        const { booking, startAt } = await depositPaid(
            "policy-late@example.in",
        );
        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            new Date(startAt.getTime() - 2 * HOUR),
        );
        expect(out.money).toEqual({
            refund: null,
            kept: { amountCents: 40_000, currency: "INR" },
        });
    });

    it("never refunds more than is left of what was received", async () => {
        const { booking, intent, startAt } = await depositPaid(
            "policy-cap@example.in",
        );
        const row = await prisma.paymentIntent.findFirstOrThrow({
            where: { providerIntentId: intent.providerIntentId },
        });
        // 150 already went back; a refund that failed doesn't count.
        await prisma.paymentRefund.createMany({
            data: [
                {
                    organizationId: owner.organizationId,
                    paymentIntentId: row.id,
                    amountCents: 15_000,
                    currency: "INR",
                    status: "SUCCEEDED",
                },
                {
                    organizationId: owner.organizationId,
                    paymentIntentId: row.id,
                    amountCents: 40_000,
                    currency: "INR",
                    status: "FAILED",
                },
            ],
        });
        expect(
            (await bookings.getBooking(owner, booking.id)).money
                .refundableCents,
        ).toBe(25_000);
        const out = await bookings.cancelBooking(
            owner,
            booking.id,
            inTime(startAt),
        );
        expect(out.money.refund).toMatchObject({ amountCents: 25_000 });
    });
});
