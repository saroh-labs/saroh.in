/**
 * Saroh's own Stripe card window, a merchant's choice (owner, 8 Nov 2026,
 * DEC-208), against a real Postgres on the network-free Stripe double:
 *
 * - a connection set to the window holds a booking 15 minutes, not 30;
 * - its hold pays through a PaymentIntent (no session): cards only, Saroh's
 *   references, the payer as a Stripe customer with a receipt email, and
 *   the business's country for the card form; the hold keeps its time;
 * - a replay hands the same client secret back while the window is the
 *   choice, and closes it (409) once the business moves to Stripe's page;
 * - the PaymentIntent's own webhook confirms the booking;
 * - a lapsed hold cancels the PaymentIntent, and a payment after the
 *   release is refunded, as on hosted Checkout;
 * - choosing Stripe's page again goes back to 30-minute holds and sessions.
 *
 * Every key is made up. Runs in the integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));
jest.mock("../sites/site-origin", () => ({
    ...jest.requireActual<typeof import("../sites/site-origin")>(
        "../sites/site-origin",
    ),
    siteOriginOf: jest.fn().mockResolvedValue("https://studio.example.com"),
}));

import { ConflictException, Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import {
    HOLD_MINUTES,
    releaseHoldInTx,
    STRIPE_HOLD_MINUTES,
} from "../bookings/booking-hold";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PaymentLookupService } from "../webhooks/payment-lookup.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { lateHoldRefundKey } from "./mismatch-refund";
import { PaymentsService } from "./payments.service";
import type {
    CreateOrderIntentInput,
    ProviderFactory,
} from "./providers/provider.port";
import { FakeStripeProvider } from "./providers/stripe-fake";
import { PublicInvoicesService } from "./public-invoices.service";

const tag = `${process.pid}-${Date.now()}`;

type ElementInput = Parameters<FakeStripeProvider["createElementIntent"]>[0];

/** The Stripe double, recording what each payment was asked for. */
class RecordingStripe extends FakeStripeProvider {
    readonly sessions: CreateOrderIntentInput[] = [];
    readonly elements: ElementInput[] = [];
    override createOrderIntent(input: CreateOrderIntentInput) {
        this.sessions.push(input);
        return super.createOrderIntent(input);
    }
    override createElementIntent(input: ElementInput) {
        this.elements.push(input);
        return super.createElementIntent(input);
    }
}
const stripe = new RecordingStripe();
const factory = { get: () => stripe } as unknown as ProviderFactory;
const payments = new PaymentsService(factory);
const publicInvoices = new PublicInvoicesService(payments);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const WEBHOOK_SECRET = "whsec_madeupwindow";
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("STRIPE")),
    payments,
);
const lookup = new PaymentLookupService(factory, webhooks);
let eventSeq = 0;

let owner: OrganizationContext;
let service = "";
let seq = 0;
let dayOut = 3;

function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Pulse Studio",
            slug: `stripe-window-${tag}`,
            edition: "GLOBAL",
            currency: "USD",
        },
    });
    const user = await prisma.user.create({
        data: { email: `stripe-window-${tag}@example.com` },
    });
    owner = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        edition: "GLOBAL",
    };
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    await prisma.featureFlag.upsert({
        where: { key: "STRIPE_PAYMENTS" },
        create: { key: "STRIPE_PAYMENTS", enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "STRIPE_PAYMENTS",
            organizationId: org.id,
            enabled: true,
        },
    });
    service = (
        await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Haircut",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 4_000,
                currency: "USD",
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
    const connected = await payments.connectProvider(owner, {
        provider: "STRIPE",
        publicKey: "pk_test_madeup",
        keyId: "pk_test_madeup",
        keySecret: "rk_test_madeup",
        webhookSecret: WEBHOOK_SECRET,
        checkoutStyle: "WINDOW",
    });
    expect(connected.checkoutStyle).toBe("WINDOW");
    // The business's own country, which the card form starts on.
    await prisma.businessProfile.update({
        where: { organizationId: org.id },
        data: { country: "GB" },
    });
});

beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function hold(email: string) {
    seq += 1;
    return publicBookings.bookOnline(
        service,
        {
            startAt: nextStart().toISOString(),
            bookerName: "Asha Rao",
            bookerEmail: email,
            idempotencyKey: `sw_${tag}_${seq}`,
            pay: "NOW",
        },
        "ip_1",
    );
}

function deliver(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_sw_${tag}_${eventSeq}`,
            ...event,
        }),
    );
    return webhooks.handle("stripe", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

async function lapse(bookingId: string) {
    await prisma.booking.update({
        where: { id: bookingId },
        data: { holdExpiresAt: new Date(Date.now() - 60_000) },
    });
    expect(await lookup.confirmHoldPayment(bookingId)).toBe("NOT_PAID");
    const released = await prisma.$transaction((tx) =>
        releaseHoldInTx(tx, bookingId, new Date(), null, { why: "lapsed" }),
    );
    expect(released).toBe(true);
    await payments.cancelHoldIntents(bookingId);
}

const minutesOf = (
    made: { booking: { holdExpiresAt: Date | null } },
    at: number,
) => (made.booking.holdExpiresAt!.getTime() - at) / 60_000;

describe("a Stripe business paying in Saroh's card window (real database)", () => {
    it("holds for 15 minutes and pays through a PaymentIntent under a named customer", async () => {
        const at = Date.now();
        const made = await hold(`window-${tag}@example.com`);
        expect(Math.round(minutesOf(made, at))).toBe(HOLD_MINUTES);

        const intent = await publicInvoices.createIntent(made.payToken ?? "", {
            idempotencyKey: `kw_${tag}_1`,
        });

        expect(stripe.sessions).toHaveLength(0);
        const asked = stripe.elements.at(-1);
        expect(asked).toMatchObject({
            amountCents: 4_000,
            currency: "USD",
            intentId: intent.paymentIntentId,
            receiptEmail: `window-${tag}@example.com`,
            customerId: expect.stringMatching(/^cus_fake_/),
        });
        expect(asked?.description).toBeTruthy();
        expect(intent.providerIntentId).toMatch(/^pi_fake_/);
        expect(intent.clientParams).toEqual({
            stripePaymentIntentId: intent.providerIntentId,
            clientSecret: `${intent.providerIntentId}_secret_fake`,
            country: "GB",
        });

        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
        });
        expect(row.providerCheckoutId).toBeNull();
        const contact = await prisma.contact.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                email: `window-${tag}@example.com`,
            },
        });
        expect(contact.stripeCustomerId).toBe(asked?.customerId);
        // No session to follow: the hold keeps its own time.
        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: made.booking.id },
        });
        expect(after.holdExpiresAt?.getTime()).toBe(
            made.booking.holdExpiresAt?.getTime(),
        );

        // The same key hands the same window back.
        const again = await publicInvoices.createIntent(made.payToken ?? "", {
            idempotencyKey: `kw_${tag}_1`,
        });
        expect(again.clientParams).toEqual(intent.clientParams);
        expect(stripe.elements.at(-1)).toBe(asked);

        // Its PaymentIntent's own webhook confirms the booking.
        await deliver({
            eventType: "payment_intent.succeeded",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            sarohIntentId: intent.paymentIntentId,
            orderRef: row.invoiceId,
            providerPaymentRef: `ch_window_${tag}`,
            capturedAmountCents: intent.amountCents,
            capturedCurrency: "USD",
        });
        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: made.booking.id },
        });
        expect(booking.status).toBe("CONFIRMED");
    });

    it("a lapsed hold cancels its PaymentIntent, and a payment after the release is refunded", async () => {
        const made = await hold(`lapse-w-${tag}@example.com`);
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        const cancel = jest.spyOn(stripe, "cancelIntent");
        await lapse(made.booking.id);
        expect(cancel).toHaveBeenCalledWith(
            expect.objectContaining({
                providerIntentId: intent.providerIntentId,
            }),
        );
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: intent.paymentIntentId },
                })
            ).status,
        ).toBe("CANCELLED");

        // Paid as it was let go: Stripe won't cancel it.
        const late = await hold(`late-w-${tag}@example.com`);
        const paying = await publicInvoices.createIntent(
            late.payToken ?? "",
            {},
        );
        jest.spyOn(stripe, "cancelIntent").mockResolvedValue(false);
        await lapse(late.booking.id);
        await deliver({
            eventType: "payment_intent.succeeded",
            outcome: "SUCCEEDED",
            providerIntentId: paying.providerIntentId,
            sarohIntentId: paying.paymentIntentId,
            providerPaymentRef: `ch_late_w_${tag}`,
            capturedAmountCents: paying.amountCents,
            capturedCurrency: "USD",
        });
        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: paying.paymentIntentId },
        });
        expect(refunds).toEqual([
            expect.objectContaining({
                amountCents: paying.amountCents,
                idempotencyKey: lateHoldRefundKey(paying.paymentIntentId),
            }),
        ]);
    });

    it("moving to Stripe's page closes a window still open, and holds go back to 30 minutes and a session", async () => {
        const made = await hold(`switch-${tag}@example.com`);
        await publicInvoices.createIntent(made.payToken ?? "", {
            idempotencyKey: `kw_${tag}_switch`,
        });

        const saved = await payments.setCheckoutStyle(
            owner,
            "stripe",
            "HOSTED",
        );
        expect(saved.checkoutStyle).toBe("HOSTED");

        await expect(
            publicInvoices.createIntent(made.payToken ?? "", {
                idempotencyKey: `kw_${tag}_switch`,
            }),
        ).rejects.toBeInstanceOf(ConflictException);

        const at = Date.now();
        const next = await hold(`hosted-${tag}@example.com`);
        expect(Math.round(minutesOf(next, at))).toBe(STRIPE_HOLD_MINUTES);
        const intent = await publicInvoices.createIntent(
            next.payToken ?? "",
            {},
        );
        expect(intent.providerIntentId).toMatch(/^cs_fake_/);
        expect(stripe.sessions).toHaveLength(1);
    });
});
