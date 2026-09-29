/**
 * Confirming a payment without its webhook, against a real Postgres (P1,
 * issue #710): the checkout's signed return settling a booking hold once,
 * whichever of it and the webhook comes first; a bad signature or an
 * unknown order writing nothing; a provider amount that isn't the intent's
 * never settling; the pending sweep settling a lost-webhook capture before
 * the hold lapses; the hold release asking first — confirming a paid hold
 * whose place is free, owing the money back when it isn't, and keeping a
 * hold its provider couldn't answer for; a capture on a hold already
 * released recorded as owed back; `payments reconcile` counting; and a
 * shop order settled by its signed return.
 *
 * Only the app env is stubbed; the provider and the webhook verifier are
 * the network-free fakes (the fake checks Razorpay's real signature).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { ReleaseHoldsHandler } from "../bookings/release-holds.handler";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { PaymentLookupService } from "./payment-lookup.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "./providers/fake.webhook";
import { WebhooksService } from "./webhooks.service";

const WEBHOOK_SECRET = "whsec_lookup";
const KEY_SECRET = "rzp_lookup_secret";
const MINUTE = 60_000;
const PRICE = 60_000;

const fake = new FakeMerchantProvider("RAZORPAY");
const providers = new FakeProviderFactory(fake);
const payments = new PaymentsService(providers);
const publicInvoices = new PublicInvoicesService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
const lookup = new PaymentLookupService(providers, webhooks);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const release = new ReleaseHoldsHandler(lookup);

let owner: OrganizationContext;
let massage: string;
let eventSeq = 0;
let keySeq = 0;
let dayOut = 2;

/** A start `dayOut` days from now at 10:00 UTC; each call a day later. */
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

function sign(orderId: string, paymentId: string, secret = KEY_SECRET) {
    return createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Rye Spa", slug: `lookup-${process.pid}` },
    });
    owner = { organizationId: org.id, userId: "user_1", role: "OWNER" };
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    massage = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Deep tissue massage",
                durationMinutes: 60,
                capacity: 1,
                priceCents: PRICE,
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
        publicKey: "rzp_test_Lookup1",
        keyId: "rzp_test_Lookup1",
        keySecret: KEY_SECRET,
        webhookSecret: WEBHOOK_SECRET,
    });
});

afterEach(() => {
    jest.restoreAllMocks();
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

/** A pay-now hold on the massage, with its checkout started. */
async function hold(email: string, startAt = nextStart()) {
    keySeq += 1;
    const { booking, payToken } = await publicBookings.bookOnline(
        massage,
        {
            startAt: startAt.toISOString(),
            bookerName: "Nisha Rao",
            bookerEmail: email,
            idempotencyKey: `lookup_${keySeq}`,
            pay: "NOW",
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(payToken ?? "", {});
    const orderId = intent.providerIntentId ?? "";
    return { booking, intent, orderId, startAt };
}

const bookingStatus = async (id: string) =>
    (await prisma.booking.findUniqueOrThrow({ where: { id } })).status;

const attempts = (paymentIntentId: string) =>
    prisma.paymentAttempt.findMany({
        where: { paymentIntentId, status: { not: "CREATED" } },
        select: { status: true, providerRef: true },
    });

/** Make the intent look `minutes` old, as the sweep reads its age. */
async function age(paymentIntentId: string, minutes: number) {
    await prisma.paymentIntent.update({
        where: { id: paymentIntentId },
        data: { createdAt: new Date(Date.now() - minutes * MINUTE) },
    });
}

describe("the checkout's signed return (P1)", () => {
    it("settles the hold once; the webhook after it changes nothing", async () => {
        const { booking, intent, orderId } = await hold("first@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_return_1",
            amountCents: PRICE,
            feeCents: 1_416,
        });

        const out = await lookup.confirmCheckoutReturn({
            provider: "RAZORPAY",
            providerOrderId: orderId,
            providerPaymentId: "pay_return_1",
            signature: sign(orderId, "pay_return_1"),
        });
        expect(out).toEqual({ confirmed: true });
        expect(await bookingStatus(booking.id)).toBe("CONFIRMED");
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: booking.id },
        });
        expect(invoice).toMatchObject({ status: "PAID" });
        expect(invoice.number).not.toBeNull();
        const settled = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
        });
        expect(settled).toMatchObject({ status: "SUCCEEDED", feeCents: 1_416 });

        // The same return again: already settled, nothing written.
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: orderId,
                providerPaymentId: "pay_return_1",
                signature: sign(orderId, "pay_return_1"),
            }),
        ).resolves.toEqual({ confirmed: true });

        // The webhook arrives late: a no-op.
        const late = await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: orderId,
            providerPaymentRef: "pay_return_1",
        });
        expect(late).toEqual({ status: "ignored", changed: false });
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED", providerRef: "pay_return_1" },
        ]);
    });

    it("the webhook first, then the return: settled once, the return confirms", async () => {
        const { booking, intent, orderId } = await hold("second@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_return_2",
            amountCents: PRICE,
        });
        await webhook({
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: orderId,
            providerPaymentRef: "pay_return_2",
        });
        expect(await bookingStatus(booking.id)).toBe("CONFIRMED");
        const asked = fake.orderPaymentCalls.length;

        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: orderId,
                providerPaymentId: "pay_return_2",
                signature: sign(orderId, "pay_return_2"),
            }),
        ).resolves.toEqual({ confirmed: true });
        // Settled already: the provider isn't asked again.
        expect(fake.orderPaymentCalls.length).toBe(asked);
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED", providerRef: "pay_return_2" },
        ]);
    });

    it("a bad signature is a 400 and writes nothing", async () => {
        const { booking, intent, orderId } = await hold("forged@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_forged",
            amountCents: PRICE,
        });
        const asked = fake.orderPaymentCalls.length;

        for (const signature of [
            sign(orderId, "pay_forged", "someone_elses_secret"),
            sign(orderId, "pay_other"),
            "not-hex",
            undefined,
        ]) {
            await expect(
                lookup.confirmCheckoutReturn({
                    provider: "RAZORPAY",
                    providerOrderId: orderId,
                    providerPaymentId: "pay_forged",
                    signature,
                }),
            ).rejects.toBeInstanceOf(BadRequestException);
        }
        expect(fake.orderPaymentCalls.length).toBe(asked);
        expect(await bookingStatus(booking.id)).toBe("PENDING");
        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
        });
        expect(row).toMatchObject({
            status: "REQUIRES_PAYMENT",
            lastLookupAt: null,
        });
        expect(await attempts(intent.paymentIntentId)).toEqual([]);
    });

    it("an order Saroh never made is a 400", async () => {
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: "order_unknown",
                providerPaymentId: "pay_unknown",
                signature: sign("order_unknown", "pay_unknown"),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("a provider amount that isn't the intent's is not settled, and is logged", async () => {
        const warn = jest.spyOn(Logger.prototype, "warn");
        const { booking, intent, orderId } = await hold("short@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_short",
            amountCents: PRICE - 100,
        });

        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: orderId,
                providerPaymentId: "pay_short",
                signature: sign(orderId, "pay_short"),
            }),
        ).resolves.toEqual({ confirmed: false });
        expect(await bookingStatus(booking.id)).toBe("PENDING");
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: intent.paymentIntentId },
                })
            ).status,
        ).toBe("REQUIRES_PAYMENT");
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("pay_short"));
    });

    it("a payment not yet captured leaves the page waiting", async () => {
        const { booking, orderId } = await hold("authorised@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_authorised",
            amountCents: PRICE,
            status: "AUTHORIZED",
        });
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: orderId,
                providerPaymentId: "pay_authorised",
                signature: sign(orderId, "pay_authorised"),
            }),
        ).resolves.toEqual({ confirmed: false });
        expect(await bookingStatus(booking.id)).toBe("PENDING");
    });

    it("settles a shop order's payment through the order's own path", async () => {
        const store = await prisma.store.create({
            data: {
                organizationId: owner.organizationId,
                name: "Rye Spa shop",
                slug: `rye-shop-${process.pid}`,
            },
        });
        const order = await prisma.order.create({
            data: {
                organizationId: owner.organizationId,
                storeId: store.id,
                orderId: "ORD-900",
                subtotal: "250.00",
                total: "250.00",
                currency: "INR",
            },
        });
        const intent = await payments.createIntentForOrderPublic(order.id, {
            idempotencyKey: "shop-return",
        });
        const orderId = intent.providerIntentId ?? "";
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_shop",
            amountCents: 25_000,
        });

        await expect(
            lookup.confirmCheckoutReturn({
                provider: "RAZORPAY",
                providerOrderId: orderId,
                providerPaymentId: "pay_shop",
                signature: sign(orderId, "pay_shop"),
            }),
        ).resolves.toEqual({ confirmed: true });
        const paid = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(paid.paymentStatus).toBe("PAID");
        const late = await webhook({
            eventType: "order.paid",
            outcome: "SUCCEEDED",
            providerIntentId: orderId,
            providerPaymentRef: "pay_shop",
        });
        expect(late.changed).toBe(false);
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED", providerRef: "pay_shop" },
        ]);
    });
});

describe("the pending sweep (P1)", () => {
    it("settles a lost-webhook capture before the hold lapses", async () => {
        const { booking, intent, orderId } = await hold("lost@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_lost",
            amountCents: PRICE,
        });

        // Too young: its webhook may still come. Not asked.
        let asked = fake.orderPaymentCalls.length;
        await lookup.sweep(new Date());
        expect(
            fake.orderPaymentCalls
                .slice(asked)
                .some((c) => c.providerIntentId === orderId),
        ).toBe(false);

        await age(intent.paymentIntentId, 5);
        const out = await lookup.sweep(new Date());
        expect(out.SETTLED).toBeGreaterThanOrEqual(1);
        expect(await bookingStatus(booking.id)).toBe("CONFIRMED");
        const row = await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
        });
        expect(row.holdExpiresAt).toBeNull();

        // Settled: no longer open, never asked again.
        asked = fake.orderPaymentCalls.length;
        await age(intent.paymentIntentId, 40);
        await lookup.sweep(new Date());
        expect(
            fake.orderPaymentCalls
                .slice(asked)
                .some((c) => c.providerIntentId === orderId),
        ).toBe(false);
    });

    it("asks an unpaid intent again only after its pause", async () => {
        const { intent, orderId } = await hold("unpaid@example.in");
        await age(intent.paymentIntentId, 5);
        const count = () =>
            fake.orderPaymentCalls.filter((c) => c.providerIntentId === orderId)
                .length;

        await lookup.sweep(new Date());
        expect(count()).toBe(1);
        await lookup.sweep(new Date());
        expect(count()).toBe(1);
        // Three minutes on, it is due again.
        await lookup.sweep(new Date(Date.now() + 3 * MINUTE + 1_000));
        expect(count()).toBe(2);
    });
});

describe("the hold release asks first (P1)", () => {
    it("confirms a paid hold past its time whose place is still free", async () => {
        const { booking, intent, orderId } = await hold("late@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_late",
            amountCents: PRICE,
        });
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
        });

        await release.releaseExpired(new Date());
        expect(await bookingStatus(booking.id)).toBe("CONFIRMED");
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED", providerRef: "pay_late" },
        ]);
    });

    it("owes the money back when the place went to someone else meanwhile", async () => {
        const { booking, intent, orderId, startAt } =
            await hold("gone@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_gone",
            amountCents: PRICE,
        });
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
        });
        keySeq += 1;
        await publicBookings.bookOnline(
            massage,
            {
                startAt: startAt.toISOString(),
                bookerName: "Quick Booker",
                bookerEmail: "quick@example.in",
                idempotencyKey: `lookup_${keySeq}`,
                pay: "DESK",
            },
            "ip_2",
        );

        await release.releaseExpired(new Date());
        expect(await bookingStatus(booking.id)).toBe("CANCELLED");
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED_NEEDS_REFUND", providerRef: "pay_gone" },
        ]);
    });

    it("releases an unpaid hold as before", async () => {
        const { booking } = await hold("nobody@example.in");
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
        });
        await release.releaseExpired(new Date());
        expect(await bookingStatus(booking.id)).toBe("CANCELLED");
    });

    it("keeps a hold its provider couldn't answer for, then lets it go after the grace", async () => {
        const { booking } = await hold("silent@example.in");
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
        });
        fake.failNextOrderLookup(1);
        await release.releaseExpired(new Date());
        expect(await bookingStatus(booking.id)).toBe("PENDING");

        fake.failNextOrderLookup(1);
        await release.releaseExpired(new Date(Date.now() + 61 * MINUTE));
        expect(await bookingStatus(booking.id)).toBe("CANCELLED");
    });

    it("a capture found after the hold was released is recorded as owed back", async () => {
        const { booking, intent, orderId } = await hold("after@example.in");
        await prisma.booking.update({
            where: { id: booking.id },
            data: { holdExpiresAt: new Date(Date.now() - MINUTE) },
        });
        await release.releaseExpired(new Date());
        expect(await bookingStatus(booking.id)).toBe("CANCELLED");

        fake.payOrder(orderId, {
            providerPaymentRef: "pay_after",
            amountCents: PRICE,
        });
        const counts = await lookup.reconcileOrganization(owner.organizationId);
        expect(counts.SETTLED).toBeGreaterThanOrEqual(1);
        expect(await bookingStatus(booking.id)).toBe("CANCELLED");
        expect(await attempts(intent.paymentIntentId)).toEqual([
            { status: "CAPTURED_NEEDS_REFUND", providerRef: "pay_after" },
        ]);
    });
});

describe("payments reconcile (P1)", () => {
    it("settles the stuck booking, counts, and a second run changes nothing", async () => {
        const { booking, orderId } = await hold("stuck@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_stuck",
            amountCents: PRICE,
        });

        const first = await lookup.reconcileOrganization(owner.organizationId);
        expect(first.SETTLED).toBe(1);
        expect(first.looked).toBe(
            first.SETTLED +
                first.ALREADY_SETTLED +
                first.NOT_PAID +
                first.MISMATCH +
                first.UNAVAILABLE +
                first.ERROR,
        );
        expect(await bookingStatus(booking.id)).toBe("CONFIRMED");

        const second = await lookup.reconcileOrganization(owner.organizationId);
        expect(second.SETTLED).toBe(0);
        expect(second.looked).toBe(first.looked - first.SETTLED);
    });

    it("counts a provider that couldn't answer as an error, and settles nothing", async () => {
        const { booking, orderId } = await hold("down@example.in");
        fake.payOrder(orderId, {
            providerPaymentRef: "pay_down",
            amountCents: PRICE,
        });
        const open = await prisma.paymentIntent.count({
            where: {
                organizationId: owner.organizationId,
                status: { in: ["CREATED", "REQUIRES_PAYMENT", "PROCESSING"] },
            },
        });
        fake.failNextOrderLookup(open);
        const counts = await lookup.reconcileOrganization(owner.organizationId);
        expect(counts.ERROR).toBe(open);
        expect(await bookingStatus(booking.id)).toBe("PENDING");
    });
});
