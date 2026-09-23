/**
 * The booking page end to end against a real Postgres (U19, ADR-008): pay at
 * the desk; pay now as a hold that takes the place, a draft invoice paid
 * through the invoice payment path, and the webhook that confirms it; a hold
 * nobody paid letting its place go — at read time and by the sweep; a late
 * payment; the last place taken meanwhile; idempotency; and a public answer
 * that never carries time off.
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

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BookingsService } from "./bookings.service";
import { FixedWindowRateLimiter } from "./rate-limiter";
import { ReleaseHoldsHandler } from "./release-holds.handler";

const WEBHOOK_SECRET = "whsec_booking_page";

const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const publicInvoices = new PublicInvoicesService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
// A generous limiter: these tests book many times from one "IP".
const bookings = new BookingsService(new FixedWindowRateLimiter(1_000));
const sweep = new ReleaseHoldsHandler();

let owner: OrganizationContext;
let oneToOne: string;
let hiit: string;
let karan: string;
let siteId: string;
let eventSeq = 0;
let keySeq = 0;

/** Mondays 06:00–09:00 UTC for Karan; the class runs Mondays at 07:00. */
const MONDAY = 1;

/** The next Monday after `from`, at `hour`:00 UTC. */
function nextMonday(hour: number, weeksOut = 1): Date {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    const ahead = (MONDAY - d.getUTCDay() + 7) % 7 || 7;
    d.setUTCDate(d.getUTCDate() + ahead + (weeksOut - 1) * 7);
    d.setUTCHours(hour);
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Pulse Fitness", slug: `booking-page-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    siteId = (
        await prisma.site.create({
            data: {
                organizationId: org.id,
                name: "Pulse Fitness",
                slug: `pulse-${process.pid}`,
            },
        })
    ).id;
    const publication = await prisma.publication.create({
        data: {
            siteId,
            organizationId: org.id,
            snapshot: {},
            templateId: "blank",
            templateVersion: 1,
        },
    });
    await prisma.site.update({
        where: { id: siteId },
        data: { currentPublicationId: publication.id },
    });

    oneToOne = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Personal training",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 80_000,
                currency: "INR",
                timezone: "UTC",
            },
        })
    ).id;
    hiit = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "HIIT",
                durationMinutes: 45,
                capacity: 2,
                priceCents: 50_000,
                currency: "INR",
                timezone: "UTC",
                availabilityRules: {
                    create: {
                        organizationId: org.id,
                        dayOfWeek: MONDAY,
                        startMinute: 7 * 60,
                        endMinute: 7 * 60 + 45,
                    },
                },
            },
        })
    ).id;
    karan = (
        await prisma.staffMember.create({
            data: {
                organizationId: org.id,
                name: "Karan Mehta",
                services: {
                    create: { organizationId: org.id, serviceId: oneToOne },
                },
                hours: {
                    create: {
                        organizationId: org.id,
                        dayOfWeek: MONDAY,
                        startMinute: 6 * 60,
                        endMinute: 9 * 60,
                    },
                },
                timeOff: {
                    create: {
                        organizationId: org.id,
                        startAt: nextMonday(0, 2),
                        endAt: nextMonday(24, 2),
                        reason: "Wedding in the family",
                    },
                },
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

function booker(email: string, pay: "NOW" | "DESK", startAt: Date) {
    keySeq += 1;
    return {
        startAt: startAt.toISOString(),
        bookerName: "Asha Rao",
        bookerEmail: email,
        idempotencyKey: `key_${keySeq}`,
        pay,
    };
}

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

describe("the booking page (real database)", () => {
    it("reads the site's services with who takes them, and no time off", async () => {
        const page = await bookings.publicBookingPage(siteId);
        expect(page.payOnline).toBe(true);
        expect(page.services.map((s) => s.name)).toEqual([
            "Personal training",
            "HIIT",
        ]);
        expect(page.services[0]!.staff).toEqual(["Karan Mehta"]);

        const days = await bookings.publicDays(oneToOne);
        expect(JSON.stringify(days)).not.toMatch(/Wedding|timeOff|reason/);
        // The Monday he is off reads open and Full.
        const off = nextMonday(0, 2).toISOString().slice(0, 10);
        expect(days.days.find((d) => d.date === off)).toMatchObject({
            open: true,
            starts: [],
        });
    });

    it("pays at the desk: confirmed, with Karan, paid at the desk", async () => {
        const at = nextMonday(6);
        const { booking, payToken } = await bookings.bookOnline(
            oneToOne,
            booker("desk@example.in", "DESK", at),
            "ip_1",
        );
        expect(payToken).toBeNull();
        expect(booking).toMatchObject({
            status: "CONFIRMED",
            paidWith: "DESK",
            staffId: karan,
        });
        // In the merchant's calendar, under Karan, paid at the desk.
        const cal = await bookings.calendarBookings(owner, {
            from: new Date(at.getTime() - 3_600_000).toISOString(),
            to: new Date(at.getTime() + 3_600_000).toISOString(),
        });
        const diary = cal.diaries.find((d) => d.person?.id === karan);
        expect(JSON.stringify(diary)).toContain("DESK");
    });

    it("pays now: the hold takes the place, the webhook confirms it and numbers the invoice", async () => {
        const at = nextMonday(7);
        const { booking, payToken } = await bookings.bookOnline(
            oneToOne,
            booker("now@example.in", "NOW", at),
            "ip_1",
        );
        expect(booking.status).toBe("PENDING");
        expect(payToken).toEqual(expect.any(String));

        // Held: nobody else can have 07:00 with Karan.
        await expect(
            bookings.bookOnline(
                oneToOne,
                booker("other@example.in", "DESK", at),
                "ip_2",
            ),
        ).rejects.toBeInstanceOf(ConflictException);

        const draft = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id },
        });
        expect(draft).toMatchObject({
            status: "DRAFT",
            source: "BOOKING",
            number: null,
        });
        expect(draft.total.toString()).toBe("800");

        const intent = await publicInvoices.createIntent(payToken ?? "", {
            idempotencyKey: "tab-1",
            amount: 1,
        });
        expect(intent.amountCents).toBe(80_000);

        expect(
            await webhook({
                eventType: "payment.captured",
                outcome: "SUCCEEDED",
                providerIntentId: intent.providerIntentId,
                providerPaymentRef: "pay_1",
            }),
        ).toEqual({ status: "processed", changed: true });

        const confirmed = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(confirmed).toMatchObject({
            status: "CONFIRMED",
            paidWith: "PAID",
            holdExpiresAt: null,
        });
        const paid = await prisma.invoice.findUniqueOrThrow({
            where: { id: draft.id },
        });
        expect(paid.status).toBe("PAID");
        expect(paid.number).toMatch(/^INV-\d{4}$/);
        expect((await bookings.publicHold(payToken ?? "", "ip_1")).state).toBe(
            "CONFIRMED",
        );
    });

    it("lets an unpaid hold's place go — at once when read, and for good by the sweep", async () => {
        const at = nextMonday(8);
        const { booking, payToken } = await bookings.bookOnline(
            oneToOne,
            booker("late@example.in", "NOW", at),
            "ip_1",
        );
        // Fifteen minutes on.
        const later = new Date(Date.now() + 16 * 60_000);
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - 60_000) },
        });
        expect((await bookings.publicHold(payToken ?? "", "ip_1")).state).toBe(
            "RELEASED",
        );
        // Its place is free again before any sweep.
        const days = await bookings.publicDays(oneToOne);
        const starts = days.days.flatMap((d) => d.starts.map((s) => s.startAt));
        expect(starts).toContain(at.toISOString());
        // Paying now is refused: the hold ran out.
        await expect(
            publicInvoices.createIntent(payToken ?? "", {}),
        ).rejects.toBeInstanceOf(ConflictException);

        await sweep.releaseExpired(later);
        const released = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(released.status).toBe("CANCELLED");
        const voided = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id },
        });
        expect(voided).toMatchObject({
            status: "VOID",
            number: null,
            payTokenHash: null,
        });
    });

    it("confirms a payment that lands after the hold ran out, when the place is still free", async () => {
        const at = nextMonday(6, 3);
        const { booking, payToken } = await bookings.bookOnline(
            oneToOne,
            booker("slow@example.in", "NOW", at),
            "ip_1",
        );
        const intent = await publicInvoices.createIntent(payToken ?? "", {});
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - 60_000) },
        });
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_slow",
        });
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: booking.id },
                })
            ).status,
        ).toBe("CONFIRMED");
    });

    it("owes back a payment that lands after the place went to someone else", async () => {
        const at = nextMonday(7, 3);
        const { booking, payToken } = await bookings.bookOnline(
            oneToOne,
            booker("slower@example.in", "NOW", at),
            "ip_1",
        );
        const intent = await publicInvoices.createIntent(payToken ?? "", {});
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - 60_000) },
        });
        // Someone else books 07:00 once the hold ran out.
        await bookings.bookOnline(
            oneToOne,
            booker("quick@example.in", "DESK", at),
            "ip_2",
        );
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: "pay_slower",
        });
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: booking.id },
                })
            ).status,
        ).toBe("CANCELLED");
        const attempt = await prisma.paymentAttempt.findFirstOrThrow({
            where: { providerRef: "pay_slower" },
        });
        expect(attempt.status).toBe("CAPTURED_NEEDS_REFUND");
    });

    it("refuses the last place of a class once a hold has it, and shows Full", async () => {
        // Inside the page's two weeks, so it can say Full.
        const at = nextMonday(7, 1);
        await bookings.bookOnline(
            hiit,
            booker("one@example.in", "DESK", at),
            "ip_1",
        );
        await bookings.bookOnline(
            hiit,
            booker("two@example.in", "NOW", at),
            "ip_1",
        );
        await expect(
            bookings.bookOnline(
                hiit,
                booker("three@example.in", "DESK", at),
                "ip_3",
            ),
        ).rejects.toBeInstanceOf(ConflictException);
        const days = await bookings.publicDays(hiit);
        const session = days.days
            .flatMap((d) => d.starts)
            .find((s) => s.startAt === at.toISOString());
        expect(session?.placesLeft ?? null).toBe(0);
    });

    it("makes one booking of a double submit, and one hold", async () => {
        const at = nextMonday(8, 4);
        const request = booker("twice@example.in", "NOW", at);
        const [a, b] = await Promise.all([
            bookings.bookOnline(oneToOne, request, "ip_1"),
            bookings.bookOnline(oneToOne, request, "ip_1"),
        ]);
        expect(a.booking.id).toBe(b.booking.id);
        expect(
            await prisma.booking.count({
                where: { serviceId: oneToOne, startAt: at },
            }),
        ).toBe(1);
        expect(
            await prisma.invoice.count({ where: { bookingId: a.booking.id } }),
        ).toBe(1);
    });
});
