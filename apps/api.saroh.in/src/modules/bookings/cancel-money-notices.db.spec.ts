/**
 * A cancelled booking's notice says what happened to the money (DEC-174
 * U13, #1144), against a real Postgres: refunded, refused, kept when
 * cancelled late, the pack's class back or used, or no payment taken. The
 * money is read when the notice runs, never when it was queued.
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
import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import type { CustomerNotifyPayload } from "../site-accounts/customer-notify-queue";
import type { CustomerNotifyService } from "../site-accounts/customer-notify.handler";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { noticeSentence } from "../site-accounts/notify-templates";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import type { BookingNotifyPayload } from "./booking-notify.handler";
import { tellAboutBooking } from "./booking-notify.handler";
import { BookingsService } from "./bookings.service";
import { PublicBookingsService } from "./public-bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";

const WEBHOOK_SECRET = "whsec_cancel_money";
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

let owner: OrganizationContext;
let service: string;
/** Paid at the visit: no deposit asked online. */
let deskService: string;
let eventSeq = 0;
let keySeq = 0;
let dayOut = 3;

/** A start some days from now at 10:00 UTC, a day of its own each time. */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Kavi Dental", slug: `cancel-money-${process.pid}` },
    });
    const user = await prisma.user.create({
        data: { email: `cancel-money-${process.pid}@example.com` },
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
    deskService = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Check-up",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
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
        publicKey: "rzp_test_Money1",
        keyId: "rzp_test_Money1",
        keySecret: "rzp_secret",
        webhookSecret: WEBHOOK_SECRET,
    });
});

async function webhook(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({ providerEventId: `evt_cm_${eventSeq}`, ...event }),
    );
    return webhooks.handle("razorpay", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/** A booking with its ₹400 deposit paid online. */
async function paidBooking(email: string) {
    const startAt = nextStart();
    keySeq += 1;
    const made = await publicBookings.bookOnline(
        service,
        {
            startAt: startAt.toISOString(),
            bookerName: "Meera Iyer",
            bookerEmail: email,
            idempotencyKey: `cm_${keySeq}`,
            pay: "DEPOSIT",
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(made.payToken ?? "", {});
    await webhook({
        eventType: "payment.captured",
        outcome: "SUCCEEDED",
        providerIntentId: intent.providerIntentId,
        providerPaymentRef: `pay_cm_${++keySeq}`,
    });
    return { ...made, startAt };
}

/** A booking to be paid at the desk, nothing paid yet. */
async function deskBooking(email: string) {
    const startAt = nextStart();
    keySeq += 1;
    const made = await publicBookings.bookOnline(
        deskService,
        {
            startAt: startAt.toISOString(),
            bookerName: "Meera Iyer",
            bookerEmail: email,
            idempotencyKey: `cm_${keySeq}`,
            pay: "DESK",
        },
        "ip_1",
    );
    return { ...made, startAt };
}

/** A booking paid with a class from a 5-class pack, one other class used. */
async function packBooking(email: string) {
    const made = await deskBooking(email);
    const other = await deskBooking(`other-${email}`);
    const contactId = made.booking.contactId!;
    const pack = await prisma.classPack.create({
        data: {
            organizationId: owner.organizationId,
            name: `Five visits ${keySeq}`,
            credits: 5,
            validityDays: 90,
            price: "3000",
            currency: "INR",
        },
    });
    const purchase = await prisma.packPurchase.create({
        data: {
            organizationId: owner.organizationId,
            packId: pack.id,
            contactId,
            credits: 5,
            price: "3000",
            currency: "INR",
            expiresAt: new Date(made.startAt.getTime() + 90 * 24 * HOUR),
        },
    });
    await prisma.packRedemption.createMany({
        data: [made.booking.id, other.booking.id].map((bookingId) => ({
            organizationId: owner.organizationId,
            purchaseId: purchase.id,
            bookingId,
        })),
    });
    await prisma.booking.update({
        where: { id: made.booking.id },
        data: { paidWith: "PACK" },
    });
    return made;
}

/** The cancel's booking.notify job run, and the customer's sentence. */
async function told(bookingId: string): Promise<string | null> {
    const job = await prisma.job.findFirstOrThrow({
        where: {
            type: "booking.notify",
            AND: [
                { payload: { path: ["bookingId"], equals: bookingId } },
                { payload: { path: ["reason"], equals: "cancelled" } },
            ],
        },
    });
    const sent: CustomerNotifyPayload[] = [];
    const notices = {
        notify: (
            _tx: unknown,
            _org: string,
            payload: CustomerNotifyPayload,
        ) => {
            sent.push(payload);
            return Promise.resolve({
                duplicate: false,
                threadMessageId: null,
                messageId: null,
            });
        },
    } as unknown as CustomerNotifyService;
    return runInOrgContext(owner.organizationId, () =>
        prisma.$transaction(async (tx) => {
            await tellAboutBooking(tx, notices, {
                organizationId: owner.organizationId,
                jobId: job.id,
                payload: job.payload as unknown as BookingNotifyPayload,
                now: new Date(),
            });
            const subject = await loadSubject(
                tx,
                owner.organizationId,
                sent[0]!,
            );
            return subject ? noticeSentence(subject.vars) : null;
        }),
    );
}

describe("a cancel notice says what happened to the money (U13)", () => {
    it("cancelled in time: the deposit is being refunded to how they paid", async () => {
        const made = await paidBooking("in-time@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        expect(await told(made.booking.id)).toMatch(
            /^Your Root canal on .+ has been cancelled\. ₹400 (is being|has been) refunded to how you paid\.$/,
        );
    });

    it("the provider refused the refund: says so, never 'refunded'", async () => {
        const made = await paidBooking("refused@example.com");
        fake.failNextRefund("REFUSED");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        const sentence = await told(made.booking.id);
        expect(sentence).toMatch(
            /has been cancelled\. The refund of ₹400 didn't go through\. Ask Kavi Dental about it\.$/,
        );
        expect(sentence).not.toMatch(/is being refunded|has been refunded/);
    });

    it("read when the notice goes: a refund settled since is said as done", async () => {
        const made = await paidBooking("settled@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        await prisma.paymentRefund.updateMany({
            where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
            data: { status: "SUCCEEDED" },
        });
        expect(await told(made.booking.id)).toMatch(
            /₹400 has been refunded to how you paid\.$/,
        );
    });

    it("cancelled late: the deposit is kept, with the window in words", async () => {
        const made = await paidBooking("late@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 2 * HOUR),
        );
        expect(
            await prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${made.booking.id}` },
            }),
        ).toBe(0);
        expect(await told(made.booking.id)).toMatch(
            /has been cancelled\. As the cancel was within 24 hours, the ₹400 is kept\.$/,
        );
    });

    it("nothing paid: no payment was taken", async () => {
        const made = await deskBooking("desk@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        expect(await told(made.booking.id)).toMatch(
            /has been cancelled\. No payment was taken\.$/,
        );
    });

    it("paid with a pack, in time: the class credit is back, with what is left", async () => {
        const made = await packBooking("pack@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 48 * HOUR),
        );
        expect(await told(made.booking.id)).toMatch(
            /has been cancelled\. Your class credit is back: 4 left\.$/,
        );
    });

    it("paid with a pack, late: the class stays used, never 'no payment'", async () => {
        const made = await packBooking("pack-late@example.com");
        await bookings.cancelBooking(
            owner,
            made.booking.id,
            new Date(made.startAt.getTime() - 2 * HOUR),
        );
        const sentence = await told(made.booking.id);
        expect(sentence).toMatch(
            /has been cancelled\. As the cancel was within 24 hours, the class from your pack is used\.$/,
        );
    });
});
