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
 * - the account's country is read once and kept.
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

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PaymentsService } from "./payments.service";
import type {
    CreateOrderIntentInput,
    ProviderFactory,
} from "./providers/provider.port";
import { FakeStripeProvider } from "./providers/stripe-fake";
import { PublicInvoicesService } from "./public-invoices.service";

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
        webhookSecret: "whsec_madeupcheckout",
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
