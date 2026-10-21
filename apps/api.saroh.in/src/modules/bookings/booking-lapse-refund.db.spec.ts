/**
 * Three booking fixes against a real Postgres (#1137, DEC-174):
 *
 * - A hold still awaiting its payment is not told it "has moved"; paid, its
 *   confirmation gives the new time.
 * - A hold whose time ran out is a lapse (BookingEvent LAPSED, no actor),
 *   not a customer's cancel: the slot frees, the waitlist is offered, the
 *   booker gets one "has lapsed" notice and the team no "cancelled" bell.
 *   The team cancelling a hold is still a cancel, and a payment that came
 *   after the place was taken lapses it without "wasn't paid".
 * - A booking's refund is in its history: "Refunded" with the amount when
 *   a cancel in time sends it, "Refund failed" when the provider refuses
 *   it, at once or later by webhook.
 *
 * Only the app env is stubbed; the provider and the webhook verifier are
 * the network-free fakes. Runs in the integration project, plain and with
 * `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma, runInOrgContext } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import { isRlsTestMode } from "../../../test/rls-mode";
import type { OrganizationContext } from "../../common/types/organization-context";
import { wordAlert } from "../notifications/team-alert.handler";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import { recordBookingRefundInTx } from "../payments/booking-refund";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import type { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { noticeSentence } from "../site-accounts/notify-templates";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BookingEventType } from "./booking-event-type";
import type { BookingNotifyPayload } from "./booking-notify.handler";
import { tellAboutBooking } from "./booking-notify.handler";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { ReleaseHoldsHandler } from "./release-holds.handler";

const WEBHOOK_SECRET = "whsec_lapse_refund";
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
let service: string;
let eventSeq = 0;
let keySeq = 0;
let dayOut = 3;

/** A start `days` from now at 10:00 UTC, a day of its own each time. */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `lapse-refund-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `lapse-refund-${process.pid}@example.com` },
    });
    owner = { organizationId: org.id, userId: user.id, role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    await prisma.bookingRules.create({
        data: { organizationId: org.id, freeCancelHours: 24 },
    });
    service = (
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
        publicKey: "rzp_test_Lapse1",
        keyId: "rzp_test_Lapse1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_lr_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A pay-now hold on the root canal, its deposit not yet paid. */
async function hold(email: string, startAt = nextStart()) {
    keySeq += 1;
    const made = await publicBookings.bookOnline(
        service,
        {
            startAt: startAt.toISOString(),
            bookerName: "Meera Iyer",
            bookerEmail: email,
            idempotencyKey: `lr_${keySeq}`,
            pay: "DEPOSIT",
        },
        "ip_1",
    );
    return { ...made, startAt };
}

/** Pay a hold's deposit through the webhook. */
async function pay(payToken: string | null | undefined) {
    const intent = await publicInvoices.createIntent(payToken ?? "", {});
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intent.providerIntentId,
        providerPaymentRef: `pay_lr_${++keySeq}`,
    });
    return intent;
}

async function expire(bookingId: string) {
    await prisma.booking.update({
        where: { id: bookingId },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
}

function eventsOf(bookingId: string) {
    return prisma.bookingEvent.findMany({
        where: { bookingId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
}

function notifyJobs(bookingId: string) {
    return prisma.job.findMany({
        where: {
            type: "booking.notify",
            payload: { path: ["bookingId"], equals: bookingId },
        },
        orderBy: { createdAt: "asc" },
    });
}

/** Run `booking.notify` for a job, the customer's side recorded. */
async function runNotify(payload: BookingNotifyPayload) {
    const notify = jest.fn().mockResolvedValue({
        duplicate: false,
        threadMessageId: null,
        messageId: null,
    });
    const notices = { notify } as unknown as CustomerNotifyService;
    await runInOrgContext(owner.organizationId, () =>
        prisma.$transaction((tx) =>
            tellAboutBooking(tx, notices, {
                organizationId: owner.organizationId,
                jobId: "job_lr",
                payload,
                now: new Date(),
            }),
        ),
    );
    return notify;
}

describe("a hold that runs out is a lapse (#1137)", () => {
    it("LAPSED, not a cancel: the slot frees, the waitlist is offered, one notice, no team bell", async () => {
        const made = await hold("lapse@example.com");
        // Someone waiting for that very session.
        const waiting = await prisma.contact.create({
            data: {
                organizationId: owner.organizationId,
                email: "waiting@example.com",
                firstName: "Kabir",
            },
        });
        await prisma.classWaitlistEntry.create({
            data: {
                organizationId: owner.organizationId,
                serviceId: service,
                startAt: made.startAt,
                endAt: new Date(made.startAt.getTime() + HOUR),
                contactId: waiting.id,
                position: 1,
            },
        });
        await expire(made.booking.id);

        await sweep.releaseExpired(new Date());

        await expect(
            prisma.booking.findUniqueOrThrow({
                where: { id: made.booking.id },
            }),
        ).resolves.toMatchObject({ status: "CANCELLED" });
        const events = await eventsOf(made.booking.id);
        expect(events.map((e) => e.type)).toEqual([
            BookingEventType.Booked,
            BookingEventType.Lapsed,
        ]);
        const lapse = events[1];
        expect(lapse.actorUserId).toBeNull();
        expect(lapse.fromStartAt?.toISOString()).toBe(
            made.startAt.toISOString(),
        );

        // The waitlist is offered the freed place.
        const offers = await prisma.job.count({
            where: {
                organizationId: owner.organizationId,
                type: "waitlist.offer",
                payload: {
                    path: ["startAt"],
                    equals: made.startAt.toISOString(),
                },
            },
        });
        expect(offers).toBe(1);

        // One lapse notice queued, keyed to the LAPSED line.
        const jobs = (await notifyJobs(made.booking.id)).filter(
            (j) => (j.payload as { reason?: string }).reason === "lapsed",
        );
        expect(jobs).toHaveLength(1);
        expect(jobs[0].payload).toMatchObject({ eventId: lapse.id });

        // Run it: the customer hears "has lapsed", the team nothing.
        const notify = await runNotify(jobs[0].payload as never);
        expect(notify).toHaveBeenCalledTimes(1);
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_LAPSED",
            bookingEventId: lapse.id,
        });
        expect(
            await prisma.notification.count({
                where: {
                    organizationId: owner.organizationId,
                    bookingId: made.booking.id,
                },
            }),
        ).toBe(0);

        // What it says, read from the database as the notice reads it.
        const subject = await runInOrgContext(owner.organizationId, () =>
            prisma.$transaction((tx) =>
                loadSubject(tx, owner.organizationId, {
                    kind: "BOOKING_LAPSED",
                    eventKey: `booking:${lapse.id}`,
                    bookingId: made.booking.id,
                    bookingEventId: lapse.id,
                }),
            ),
        );
        expect(subject?.serviceId).toBe(service);
        expect(subject && noticeSentence(subject.vars)).toMatch(
            /^Your hold on Root canal, .+ has lapsed because it wasn't paid\.$/,
        );

        // A second sweep finds nothing to release, and tells nobody again.
        await sweep.releaseExpired(new Date());
        expect(await notifyJobs(made.booking.id)).toHaveLength(1);
    });

    it("the team cancelling a hold is a cancel by them, and tells nobody it lapsed", async () => {
        const made = await hold("team-cancel@example.com");
        await bookings.cancelBooking(owner, made.booking.id);

        const events = await eventsOf(made.booking.id);
        expect(events.map((e) => [e.type, e.actorUserId])).toEqual([
            [BookingEventType.Booked, null],
            [BookingEventType.Cancelled, owner.userId],
        ]);
        expect(await notifyJobs(made.booking.id)).toHaveLength(0);
    });

    it("the booker letting their own hold go is their cancel, as before", async () => {
        const made = await hold("let-go@example.com");
        await publicBookings.releasePublicHold(made.payToken ?? "", "ip_1");

        const events = await eventsOf(made.booking.id);
        expect(events.map((e) => [e.type, e.actorUserId])).toEqual([
            [BookingEventType.Booked, null],
            [BookingEventType.Cancelled, null],
        ]);
        expect(await notifyJobs(made.booking.id)).toHaveLength(0);
    });

    it("paid after someone else took the place: lapsed and owed back, never told 'wasn't paid'", async () => {
        const startAt = nextStart();
        const first = await hold("late-payer@example.com", startAt);
        const intent = await publicInvoices.createIntent(
            first.payToken ?? "",
            {},
        );
        await expire(first.booking.id);
        // The place goes to someone else meanwhile.
        const second = await hold("on-time@example.com", startAt);
        expect(second.booking.status).toBe("PENDING");

        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `pay_lr_${++keySeq}`,
        });

        const events = await eventsOf(first.booking.id);
        expect(events.map((e) => e.type)).toEqual([
            BookingEventType.Booked,
            BookingEventType.Lapsed,
        ]);
        expect(
            (await notifyJobs(first.booking.id)).filter(
                (j) => (j.payload as { reason?: string }).reason === "lapsed",
            ),
        ).toHaveLength(0);
    });
});

describe("a hold that moves is told only once it is paid (#1137)", () => {
    it("moved while awaiting payment: no 'has moved'; paid, the confirmation gives the new time", async () => {
        const made = await hold("moved-hold@example.com");
        const to = new Date(made.startAt.getTime() + HOUR);
        await bookings.rescheduleBooking(owner, made.booking.id, {
            startAt: to.toISOString(),
        });

        const [moveJob] = (await notifyJobs(made.booking.id)).filter(
            (j) => (j.payload as { reason?: string }).reason === "rescheduled",
        );
        expect(moveJob.payload).toMatchObject({ held: true });
        const notify = await runNotify(moveJob.payload as never);
        expect(notify).not.toHaveBeenCalled();

        await pay(made.payToken);
        await expect(
            prisma.booking.findUniqueOrThrow({
                where: { id: made.booking.id },
            }),
        ).resolves.toMatchObject({ status: "CONFIRMED" });
        const confirmed = (await notifyJobs(made.booking.id)).filter(
            (j) => (j.payload as { reason?: string }).reason === "confirmed",
        );
        expect(confirmed).toHaveLength(1);

        // Run late, after the payment: still no "has moved".
        const late = await runNotify(moveJob.payload as never);
        expect(late).not.toHaveBeenCalled();

        // The confirmation reads the booking's time now: the new one.
        const subject = await runInOrgContext(owner.organizationId, () =>
            prisma.$transaction((tx) =>
                loadSubject(tx, owner.organizationId, {
                    kind: "BOOKING_CONFIRMED",
                    eventKey: "booking:confirm",
                    bookingId: made.booking.id,
                }),
            ),
        );
        expect(subject?.vars).toMatchObject({
            kind: "BOOKING_CONFIRMED",
            booking: { startAt: to },
        });
    });

    it("a confirmed booking moved is told as before", async () => {
        const made = await hold("moved-paid@example.com");
        await pay(made.payToken);
        await bookings.rescheduleBooking(owner, made.booking.id, {
            startAt: new Date(made.startAt.getTime() + HOUR).toISOString(),
        });
        const [moveJob] = (await notifyJobs(made.booking.id)).filter(
            (j) => (j.payload as { reason?: string }).reason === "rescheduled",
        );
        expect(moveJob.payload).not.toHaveProperty("held");
        const notify = await runNotify(moveJob.payload as never);
        expect(notify.mock.calls[0][2]).toMatchObject({
            kind: "BOOKING_MOVED",
        });
    });
});

describe("a booking's refund in its history (#1137)", () => {
    async function paidBooking(email: string) {
        const made = await hold(email);
        const intent = await pay(made.payToken);
        return { ...made, intent };
    }

    function refundLines(bookingId: string) {
        return prisma.bookingEvent.findMany({
            where: {
                bookingId,
                type: {
                    in: [
                        BookingEventType.Refunded,
                        BookingEventType.RefundFailed,
                    ],
                },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
    }

    it("cancelled in time: 'Refunded' with the amount, once, however the webhook repeats it", async () => {
        const made = await paidBooking("refund-in-time@example.com");
        const out = await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        expect(out.money.refund).toMatchObject({
            amountCents: 40_000,
            status: "SENT",
        });
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
        });

        let lines = await refundLines(made.booking.id);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
            type: BookingEventType.Refunded,
            actorUserId: null,
            data: {
                amountCents: 40_000,
                currency: "INR",
                refundId: refund.id,
                outcome: "SENT",
            },
        });

        // The provider confirms it, twice: still one line.
        for (let i = 0; i < 2; i += 1) {
            await webhook({
                eventType: "refund.processed",
                outcome: "REFUNDED",
                providerIntentId: made.intent.providerIntentId,
                providerRefundId: refund.providerRefundId,
                refundReference: refund.id,
                refundAmountCents: 40_000,
            });
        }
        lines = await refundLines(made.booking.id);
        expect(lines.map((l) => l.type)).toEqual([BookingEventType.Refunded]);

        // The booking's page reads it with its amount.
        const detail = await bookings.getBooking(owner, made.booking.id);
        expect(
            detail.events.find((e) => e.type === BookingEventType.Refunded)
                ?.data,
        ).toMatchObject({ amountCents: 40_000, currency: "INR" });
    });

    it("a refund the provider refuses at once: 'Refund failed', no 'Refunded'", async () => {
        const made = await paidBooking("refund-refused@example.com");
        fake.failNextRefund("REFUSED");
        const out = await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        expect(out.money.refund).toMatchObject({ status: "REFUSED" });
        const lines = await refundLines(made.booking.id);
        expect(lines.map((l) => [l.type, l.data])).toEqual([
            [
                BookingEventType.RefundFailed,
                expect.objectContaining({
                    amountCents: 40_000,
                    outcome: "REFUSED",
                }),
            ],
        ]);
        // The team hears it (U12, #1143): refund.refused on the booking,
        // for everyone on the Payment failed row (an automatic refund).
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
        });
        const alerts = await refundAlerts(refund.id);
        expect(alerts).toEqual([
            { event: "refund", refundId: refund.id, change: "refused" },
        ]);
        const worded = await runInOrgContext(owner.organizationId, () =>
            prisma.$transaction((tx) =>
                wordAlert(tx, owner.organizationId, alerts[0]),
            ),
        );
        expect(worded).toMatchObject({
            event: "failed",
            type: "refund.refused.booking",
            bookingId: made.booking.id,
            skipUserId: null,
            eventKey: `team:refund:refused:${refund.id}`,
        });
        // Never told to the customer: no money went back.
        expect(await refundNotices(refund.id)).toBe(0);
    });

    it("sent, then failed by the provider's webhook: 'Refund failed' follows 'Refunded'", async () => {
        const made = await paidBooking("refund-later-failed@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
        });

        await webhook({
            eventType: "refund.failed",
            outcome: "REFUND_FAILED",
            providerIntentId: made.intent.providerIntentId,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.id,
        });
        await expect(
            prisma.paymentRefund.findUniqueOrThrow({
                where: { id: refund.id },
            }),
        ).resolves.toMatchObject({ status: "FAILED" });

        const lines = await refundLines(made.booking.id);
        expect(lines.map((l) => l.type)).toEqual([
            BookingEventType.Refunded,
            BookingEventType.RefundFailed,
        ]);
        expect(lines[1].data).toMatchObject({
            refundId: refund.id,
            outcome: "FAILED",
        });
        // The customer was told it was on its way when the provider took
        // it; its failure later tells the team, once (U12, #1143).
        expect(await refundNotices(refund.id)).toBe(1);
        await webhook({
            eventType: "refund.failed",
            outcome: "REFUND_FAILED",
            providerIntentId: made.intent.providerIntentId,
            providerRefundId: refund.providerRefundId,
            refundReference: refund.id,
        });
        expect(await refundAlerts(refund.id)).toEqual([
            { event: "refund", refundId: refund.id, change: "failed" },
        ]);
    });

    it("a refund that isn't a booking's own (an order's) writes no booking line", async () => {
        const made = await paidBooking("refund-not-booking@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
        });
        // Written already: asking again with the same state writes nothing.
        const again = await prisma.$transaction((tx) =>
            recordBookingRefundInTx(tx, refund.id, "SETTLED"),
        );
        expect(again).toBe(false);
        // A refund id that matches nothing writes nothing either.
        const none = await prisma.$transaction((tx) =>
            recordBookingRefundInTx(tx, "no-such-refund", "SETTLED"),
        );
        expect(none).toBe(false);
    });
});

/** The team's refund alerts queued about one refund (U12). */
async function refundAlerts(refundId: string) {
    const jobs = await prisma.job.findMany({
        where: { type: TEAM_ALERT_TYPE },
        orderBy: { createdAt: "asc" },
        select: { payload: true },
    });
    return jobs
        .map(
            (j) =>
                j.payload as {
                    event: "refund";
                    refundId: string;
                    change: "failed" | "refused";
                },
        )
        .filter((p) => p.event === "refund" && p.refundId === refundId);
}

/** The customer's "on its way" notices queued for one refund (U12). */
async function refundNotices(refundId: string): Promise<number> {
    const jobs = await prisma.job.findMany({
        where: { type: "customer.notify" },
        select: { payload: true },
    });
    return jobs.filter(
        (j) =>
            (j.payload as { kind?: string; refundId?: string }).kind ===
                "REFUND_SENT" &&
            (j.payload as { refundId?: string }).refundId === refundId,
    ).length;
}

const describeRls = isRlsTestMode() ? describe : describe.skip;

describeRls("row-level security on the new lines (#1137)", () => {
    it("a business sees only its own lapse and refund lines", async () => {
        // Another business with a lapse line of its own.
        const other = await prisma.organization.create({
            data: { name: "Pulse Fitness", slug: `lapse-rls-${process.pid}` },
        });
        const otherService = await prisma.service.create({
            data: {
                organizationId: other.id,
                name: "Spin",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
            },
        });
        const at = nextStart();
        const otherBooking = await prisma.booking.create({
            data: {
                organizationId: other.id,
                serviceId: otherService.id,
                startAt: at,
                endAt: new Date(at.getTime() + HOUR),
                timezone: "UTC",
                status: "CANCELLED",
                snapshot: {},
            },
        });
        await prisma.bookingEvent.create({
            data: {
                organizationId: other.id,
                bookingId: otherBooking.id,
                type: BookingEventType.Lapsed,
                fromStartAt: at,
            },
        });

        const kinds = {
            type: {
                in: [
                    BookingEventType.Lapsed,
                    BookingEventType.Refunded,
                    BookingEventType.RefundFailed,
                ],
            },
        };
        const own = await runInOrgContext(owner.organizationId, () =>
            prisma.bookingEvent.findMany({
                where: kinds,
                select: { organizationId: true },
            }),
        );
        expect(own.length).toBeGreaterThan(0);
        expect(
            own.every((e) => e.organizationId === owner.organizationId),
        ).toBe(true);
        const theirs = await runInOrgContext(other.id, () =>
            prisma.bookingEvent.findMany({
                where: kinds,
                select: { organizationId: true },
            }),
        );
        expect(theirs).toEqual([{ organizationId: other.id }]);
    });
});
