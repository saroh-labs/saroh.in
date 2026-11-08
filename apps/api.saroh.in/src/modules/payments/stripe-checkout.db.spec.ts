/**
 * Stripe hosted Checkout from Saroh's side (plan 2026-11-07-002, U4),
 * against a real Postgres, on the network-free Stripe double
 * (`FakeStripeProvider`):
 *
 * - a booking hold at a Stripe business makes a session that books, takes
 *   instant methods only, names the service line, returns to the
 *   business's own site, and moves the hold's expiry to the session's;
 * - the payer is a Stripe customer, recorded on the business's contact;
 * - an issued invoice pays with any method, and a replay hands back the
 *   same session;
 * - the account's country is read once and kept;
 * - (U5) a Stripe hold lasts 30 minutes; releasing it closes its session
 *   and cancels the intent; a payment that lands after the release is
 *   refunded once, through the refund job, with a team alert, and its
 *   refund events settle with no credit note.
 *
 * The site's origin is stubbed (its own specs cover it). Every key is made
 * up. Runs in the integration project (TEST_DATABASE_URL).
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

import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHmac } from "node:crypto";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { releaseHoldInTx, STRIPE_HOLD_MINUTES } from "../bookings/booking-hold";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { wordAlert } from "../notifications/team-alert.handler";
import type { TeamAlertPayload } from "../notifications/team-alerts";
import { TEAM_ALERT_TYPE } from "../notifications/team-alerts";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
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
import { RefundCallError } from "./providers/provider.port";
import { FakeStripeProvider } from "./providers/stripe-fake";
import { PublicInvoicesService } from "./public-invoices.service";
import { SEND_REFUND_TYPE } from "./send-refund-type";

const tag = `${process.pid}-${Date.now()}`;

/** The Stripe double, recording what each session was asked for. */
class RecordingStripe extends FakeStripeProvider {
    readonly sessions: CreateOrderIntentInput[] = [];
    countryReads = 0;
    override createOrderIntent(input: CreateOrderIntentInput) {
        this.sessions.push(input);
        return super.createOrderIntent(input);
    }
    override accountCountry(
        credentials: Parameters<FakeStripeProvider["accountCountry"]>[0],
    ) {
        this.countryReads += 1;
        return super.accountCountry(credentials);
    }
}
const stripe = new RecordingStripe();
const factory = { get: () => stripe } as unknown as ProviderFactory;
const payments = new PaymentsService(factory);
const publicInvoices = new PublicInvoicesService(payments);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const WEBHOOK_SECRET = "whsec_madeupcheckout";
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
            name: "Rye Studio",
            slug: `stripe-checkout-${tag}`,
            edition: "GLOBAL",
            currency: "USD",
        },
    });
    const user = await prisma.user.create({
        data: { email: `stripe-checkout-${tag}@example.com` },
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
    await payments.connectProvider(owner, {
        provider: "STRIPE",
        publicKey: "pk_test_madeup",
        keyId: "pk_test_madeup",
        keySecret: "rk_test_madeup",
        webhookSecret: WEBHOOK_SECRET,
    });
});

beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

/** A pay-now hold on the haircut, not yet paid. */
async function hold(email: string) {
    seq += 1;
    return publicBookings.bookOnline(
        service,
        {
            startAt: nextStart().toISOString(),
            bookerName: "Asha Rao",
            bookerEmail: email,
            idempotencyKey: `sc_${tag}_${seq}`,
            pay: "NOW",
        },
        "ip_1",
    );
}

describe("a Stripe business's checkout (real database)", () => {
    it("keeps the account's country read at connect", async () => {
        const row = await prisma.merchantPaymentProvider.findFirstOrThrow({
            where: { organizationId: owner.organizationId, provider: "STRIPE" },
        });
        expect(row.accountCountry).toBe("US");
    });

    it("a booking hold: a session that books, instant only, back to the business's site, and the hold follows it", async () => {
        const made = await hold(`hold-${tag}@example.com`);
        const before = await prisma.booking.findUniqueOrThrow({
            where: { id: made.booking.id },
        });
        const reads = stripe.countryReads;

        const intent = await publicInvoices.createIntent(made.payToken ?? "", {
            idempotencyKey: `k_${tag}_1`,
            returnPath: "/book?service=cut",
        });

        const session = stripe.sessions.at(-1);
        expect(session?.hosted).toMatchObject({
            submitType: "book",
            instantOnly: true,
            billingAddressRequired: false,
            clientReference: intent.paymentIntentId,
            payerEmail: `hold-${tag}@example.com`,
            successUrl:
                "https://studio.example.com/paid?session_id={CHECKOUT_SESSION_ID}",
        });
        expect(session?.hosted?.lineName).toMatch(/^Haircut · /);
        expect(session?.hosted?.cancelUrl).toMatch(
            /^https:\/\/studio\.example\.com\/paid\?cancelled=1&intent=/,
        );
        expect(session?.hosted?.customerId).toMatch(/^cus_fake_/);
        // The stored country is used; Stripe isn't asked again.
        expect(stripe.countryReads).toBe(reads);

        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
            include: { attempts: true },
        });
        expect(row.providerIntentId).toMatch(/^cs_fake_/);
        expect(row.providerCheckoutId).toBe(row.providerIntentId);
        expect(row.attempts[0].rawResponse).toMatchObject({
            checkoutKind: "hold",
            returnPath: "/book?service=cut",
            clientParams: {
                checkoutUrl: expect.stringMatching(
                    /^https:\/\/checkout\.stripe\.com\//,
                ),
            },
        });
        expect(JSON.stringify(intent)).not.toMatch(/secret/i);

        const after = await prisma.booking.findUniqueOrThrow({
            where: { id: made.booking.id },
        });
        expect(after.holdExpiresAt?.getTime()).toBe(
            session?.hosted?.expiresAt?.getTime(),
        );
        expect(after.holdExpiresAt!.getTime()).toBeGreaterThanOrEqual(
            before.holdExpiresAt!.getTime(),
        );

        const contact = await prisma.contact.findFirstOrThrow({
            where: {
                organizationId: owner.organizationId,
                email: `hold-${tag}@example.com`,
            },
        });
        expect(contact.stripeCustomerId).toBe(session?.hosted?.customerId);

        // The same key replays the same session.
        const again = await publicInvoices.createIntent(made.payToken ?? "", {
            idempotencyKey: `k_${tag}_1`,
        });
        expect(again.clientParams).toEqual(intent.clientParams);
        expect(stripe.sessions.at(-1)).toBe(session);
    });

    it("an older connection with no country reads it once and keeps it", async () => {
        await prisma.merchantPaymentProvider.updateMany({
            where: { organizationId: owner.organizationId, provider: "STRIPE" },
            data: { accountCountry: null },
        });
        const reads = stripe.countryReads;
        const made = await hold(`older-${tag}@example.com`);

        await publicInvoices.createIntent(made.payToken ?? "", {});

        expect(stripe.countryReads).toBe(reads + 1);
        const row = await prisma.merchantPaymentProvider.findFirstOrThrow({
            where: { organizationId: owner.organizationId, provider: "STRIPE" },
        });
        expect(row.accountCountry).toBe("US");
    });
});

/** One signed event, as the fake webhook verifier reads it. */
function deliver(event: Record<string, unknown>) {
    eventSeq += 1;
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_sc_${tag}_${eventSeq}`,
            ...event,
        }),
    );
    return webhooks.handle("stripe", owner.organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

/**
 * The sweep's steps for one hold whose time ran out (`release-holds`):
 * ask first, release, then close its intents.
 */
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

function jobsFor(type: string, path: string, value: string) {
    return prisma.job.findMany({
        where: {
            organizationId: owner.organizationId,
            type,
            payload: { path: [path], equals: value },
        },
    });
}

describe("a Stripe business's holds (U5, real database)", () => {
    it("hold for 30 minutes", async () => {
        const at = Date.now();
        const made = await hold(`thirty-${tag}@example.com`);
        const expires = made.booking.holdExpiresAt!.getTime();
        expect(expires - at).toBeGreaterThanOrEqual(
            STRIPE_HOLD_MINUTES * 60_000 - 5_000,
        );
        expect(expires - at).toBeLessThanOrEqual(
            STRIPE_HOLD_MINUTES * 60_000 + 5_000,
        );
    });

    it("a lapsed hold's session is expired at Stripe and its intent cancelled", async () => {
        const made = await hold(`lapse-${tag}@example.com`);
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        const expire = jest.spyOn(stripe, "cancelIntent");

        await lapse(made.booking.id);

        expect(expire).toHaveBeenCalledWith(
            expect.objectContaining({
                providerIntentId: intent.providerIntentId,
            }),
        );
        const row = await prisma.paymentIntent.findUniqueOrThrow({
            where: { id: intent.paymentIntentId },
        });
        expect(row.status).toBe("CANCELLED");
    });

    it("a payment that lands after the release is refunded once, with one team alert, and settles with no credit note", async () => {
        const made = await hold(`late-${tag}@example.com`);
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        // Paid between the look-up and the release: Stripe won't expire it.
        jest.spyOn(stripe, "cancelIntent").mockResolvedValue(false);
        await lapse(made.booking.id);
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: intent.paymentIntentId },
                })
            ).status,
        ).toBe("REQUIRES_PAYMENT");

        const paid = {
            eventType: "checkout.session.completed",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `ch_late_${tag}`,
            capturedAmountCents: intent.amountCents,
            capturedCurrency: "USD",
        };
        await deliver(paid);
        // Delivered again (Stripe's retry, or the PaymentIntent's own event).
        await deliver(paid);

        const attempts = await prisma.paymentAttempt.findMany({
            where: { paymentIntentId: intent.paymentIntentId },
        });
        expect(
            attempts.filter((a) => a.status === "CAPTURED_NEEDS_REFUND"),
        ).toEqual([
            expect.objectContaining({
                rawResponse: { invoiceStatus: "RELEASED_HOLD" },
            }),
        ]);
        const refunds = await prisma.paymentRefund.findMany({
            where: { paymentIntentId: intent.paymentIntentId },
        });
        expect(refunds).toEqual([
            expect.objectContaining({
                status: "PENDING",
                amountCents: intent.amountCents,
                currency: "USD",
                idempotencyKey: lateHoldRefundKey(intent.paymentIntentId),
            }),
        ]);
        const refundId = refunds[0].id;
        expect(
            await jobsFor(SEND_REFUND_TYPE, "refundId", refundId),
        ).toHaveLength(1);
        const alerts = await jobsFor(TEAM_ALERT_TYPE, "refundId", refundId);
        expect(alerts).toHaveLength(1);
        expect(alerts[0].payload).toMatchObject({
            event: "refund",
            change: "late-hold",
        });
        const worded = await prisma.$transaction((tx) =>
            wordAlert(
                tx,
                owner.organizationId,
                alerts[0].payload as TeamAlertPayload,
            ),
        );
        expect(worded).toMatchObject({
            title: "A late payment was refunded",
            path: `/bookings/${made.booking.id}`,
        });
        expect(worded?.body).toMatch(
            /came after its hold ended\. Saroh refunded it\./,
        );
        expect(worded?.mail?.body).not.toContain("late-");

        // The refund job sends it; Stripe takes it, and the customer is told.
        jest.spyOn(stripe, "findRefund").mockResolvedValue(null);
        const send = jest.spyOn(stripe, "refund").mockResolvedValue({
            providerRefundId: `re_late_${tag}`,
            status: "pending",
            failed: false,
        });
        expect(
            await payments.sendQueuedRefund(owner.organizationId, refundId),
        ).toBe("ACCEPTED");
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                reference: refundId,
                amountCents: intent.amountCents,
            }),
        );
        expect(
            await jobsFor(CUSTOMER_NOTIFY_TYPE, "refundId", refundId),
        ).toHaveLength(1);

        // Its refund event settles the row; the voided draft gets no credit note.
        await deliver({
            eventType: "refund.updated",
            outcome: "REFUNDED",
            providerIntentId: intent.providerIntentId,
            providerRefundId: `re_late_${tag}`,
            refundReference: refundId,
            refundAmountCents: intent.amountCents,
        });
        expect(
            (
                await prisma.paymentRefund.findUniqueOrThrow({
                    where: { id: refundId },
                })
            ).status,
        ).toBe("SUCCEEDED");
        const invoice = await prisma.invoice.findFirstOrThrow({
            where: { bookingId: made.booking.id, source: "BOOKING" },
        });
        expect(invoice.status).toBe("VOID");
        expect(
            await prisma.invoice.count({
                where: { relatedInvoiceId: invoice.id },
            }),
        ).toBe(0);
    });

    it("a late payment whose place is still free confirms the booking, with no refund", async () => {
        const made = await hold(`free-${tag}@example.com`);
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        // Ran out, not yet released by the sweep, and nobody took the time.
        await prisma.booking.update({
            where: { id: made.booking.id },
            data: { holdExpiresAt: new Date(Date.now() - 60_000) },
        });

        await deliver({
            eventType: "checkout.session.completed",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `ch_free_${tag}`,
            capturedAmountCents: intent.amountCents,
            capturedCurrency: "USD",
        });

        const booking = await prisma.booking.findUniqueOrThrow({
            where: { id: made.booking.id },
        });
        expect(booking.status).toBe("CONFIRMED");
        expect(
            await prisma.paymentRefund.count({
                where: { paymentIntentId: intent.paymentIntentId },
            }),
        ).toBe(0);
    });

    it("a refund Stripe refuses leaves the row FAILED and tells the team", async () => {
        const made = await hold(`refused-${tag}@example.com`);
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        jest.spyOn(stripe, "cancelIntent").mockResolvedValue(false);
        await lapse(made.booking.id);
        await deliver({
            eventType: "checkout.session.completed",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `ch_refused_${tag}`,
            capturedAmountCents: intent.amountCents,
            capturedCurrency: "USD",
        });
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { paymentIntentId: intent.paymentIntentId },
        });
        jest.spyOn(stripe, "findRefund").mockResolvedValue(null);
        jest.spyOn(stripe, "refund").mockRejectedValue(
            new RefundCallError("Stripe refund failed (HTTP 400)", "REFUSED"),
        );

        expect(
            await payments.sendQueuedRefund(owner.organizationId, refund.id),
        ).toBe("REFUSED");

        expect(
            (
                await prisma.paymentRefund.findUniqueOrThrow({
                    where: { id: refund.id },
                })
            ).status,
        ).toBe("FAILED");
        const alerts = await jobsFor(TEAM_ALERT_TYPE, "refundId", refund.id);
        expect(
            alerts.map((a) => (a.payload as { change: string }).change).sort(),
        ).toEqual(["late-hold", "refused"]);
    });
});
