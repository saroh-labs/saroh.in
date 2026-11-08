/**
 * The return page's reads of a Stripe hosted Checkout (plan
 * 2026-11-07-002, U7), against a real Postgres, on the network-free Stripe
 * double, with events through the real Stripe verifier:
 *
 * - an open session reads as open, then paid after its webhook, with only
 *   the buyer's fields;
 * - cancel expires the session, cancels the intent and lets a hold's place
 *   go, once however often it is called; a wrong token is the unknown
 *   id's 404;
 * - cancel on a session Stripe already took payment on settles it instead;
 * - cancel on a site order leaves the order to be paid again;
 * - a hold paid after its place went reads as refunding.
 *
 * The site's origin is stubbed. Every key is made up. Runs in the
 * integration project (TEST_DATABASE_URL).
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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingEventType } from "../bookings/booking-event-type";
import { releaseHoldInTx } from "../bookings/booking-hold";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PaymentsService } from "../payments/payments.service";
import type {
    CreateOrderIntentInput,
    ProviderFactory,
} from "../payments/providers/provider.port";
import { FakeStripeProvider } from "../payments/providers/stripe-fake";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { CheckoutSessionService } from "./checkout-session.service";
import { PaymentLookupService } from "./payment-lookup.service";
import { StripeWebhookProvider } from "./providers/stripe.webhook";
import { DefaultWebhookProviderFactory } from "./providers/webhook-provider.factory";
import { WebhooksService } from "./webhooks.service";

const tag = `${process.pid}-${Date.now()}`;
const WEBHOOK_SECRET = "whsec_madeupcheckoutreturn";

/** The Stripe double, keeping each session's cancel URL. */
class RecordingStripe extends FakeStripeProvider {
    readonly sessions: CreateOrderIntentInput[] = [];
    override createOrderIntent(input: CreateOrderIntentInput) {
        this.sessions.push(input);
        return super.createOrderIntent(input);
    }
}
const stripe = new RecordingStripe();
const factory = { get: () => stripe } as unknown as ProviderFactory;
const payments = new PaymentsService(factory);
const publicInvoices = new PublicInvoicesService(payments);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const webhooks = new WebhooksService(
    new DefaultWebhookProviderFactory([new StripeWebhookProvider()]),
    payments,
);
const lookup = new PaymentLookupService(factory, webhooks);
const sessions = new CheckoutSessionService(lookup, payments, factory);

let owner: OrganizationContext;
let service = "";
let storeId = "";
let customerId = "";
let seq = 0;
let dayOut = 3;

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: {
            name: "Rye Studio",
            slug: `checkout-return-${tag}`,
            edition: "GLOBAL",
            currency: "USD",
        },
    });
    const user = await prisma.user.create({
        data: { email: `checkout-return-${tag}@example.com` },
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
    storeId = (
        await prisma.store.create({
            data: {
                name: "Quay",
                slug: `cr-quay-${tag}`,
                organizationId: org.id,
            },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org.id,
                email: `cr-buyer-${tag}@example.com`,
                firstName: "Ana",
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

function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

/** The cancel URL's token, as Stripe's Back link carries it. */
function cancelToken(): string {
    const url = new URL(stripe.sessions.at(-1)?.hosted?.cancelUrl ?? "");
    return url.searchParams.get("token") ?? "";
}

/** A pay-now hold with its Stripe session, and the session's cancel token. */
async function heldSession() {
    seq += 1;
    const email = `cr-${seq}-${tag}@example.com`;
    const made = await publicBookings.bookOnline(
        service,
        {
            startAt: nextStart().toISOString(),
            bookerName: "Asha Rao",
            bookerEmail: email,
            idempotencyKey: `cr_${tag}_${seq}`,
            pay: "NOW",
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(made.payToken ?? "", {
        idempotencyKey: `crk_${tag}_${seq}`,
        returnPath: "/book?service=cut",
    });
    const row = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.paymentIntentId },
    });
    return {
        made,
        row,
        email,
        token: cancelToken(),
        cs: row.providerCheckoutId ?? "",
        pi: `pi_cr_${seq}_${tag}`,
    };
}

/** Deliver Stripe's `checkout.session.completed` for a session, paid. */
function completed(h: {
    cs: string;
    pi: string;
    row: { id: string; amountCents: number };
}) {
    const body = JSON.parse(
        readFileSync(
            join(
                __dirname,
                "providers",
                "__fixtures__",
                "stripe",
                "checkout.session.completed.json",
            ),
            "utf8",
        ),
    ) as { id: string; data: { object: Record<string, unknown> } };
    body.id = `evt_cr_${h.cs}`;
    Object.assign(body.data.object, {
        id: h.cs,
        payment_intent: h.pi,
        client_reference_id: h.row.id,
        amount_total: h.row.amountCents,
        metadata: { saroh_intent: h.row.id },
    });
    const raw = Buffer.from(JSON.stringify(body));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", WEBHOOK_SECRET)
        .update(`${t}.`)
        .update(raw)
        .digest("hex");
    return webhooks.handle("stripe", owner.organizationId, raw, {
        "stripe-signature": `t=${t},v1=${v1}`,
    });
}

const booking = (id: string) =>
    prisma.booking.findUniqueOrThrow({ where: { id } });

describe("the return page's reads (U7, real database)", () => {
    it("an open session reads open with the buyer's fields only, then paid after its webhook", async () => {
        const h = await heldSession();

        const open = await sessions.read(h.cs);
        expect(open).toEqual({
            status: "open",
            kind: "hold",
            businessName: "Rye Studio",
            amountCents: h.row.amountCents,
            currency: "USD",
            booking: {
                serviceName: "Haircut",
                startAt: new Date(h.made.booking.startAt).toISOString(),
                endAt: expect.any(String),
                timezone: expect.any(String),
            },
            returnPath: "/book?service=cut",
        });
        const said = JSON.stringify(open);
        expect(said).not.toContain(h.email);
        expect(said).not.toMatch(/cs_|pi_|cus_|cancelTokenHash/);

        await completed(h);
        await expect(sessions.read(h.cs)).resolves.toMatchObject({
            status: "paid",
        });
        expect(JSON.stringify(await sessions.read(h.cs))).not.toContain(h.pi);
    });

    it("asks Stripe at most every 10 seconds while it is open", async () => {
        const h = await heldSession();
        const ask = jest.spyOn(stripe, "findOrderPayments");
        await sessions.read(h.cs);
        await sessions.read(h.cs);
        expect(ask).toHaveBeenCalledTimes(1);
    });

    it("an unknown session is a 404", async () => {
        await expect(
            sessions.read(`cs_test_unknown_${tag}`),
        ).rejects.toMatchObject({ status: 404 });
    });

    it("cancel expires the session, cancels the intent and lets the hold go, once", async () => {
        const h = await heldSession();
        const expire = jest.spyOn(stripe, "cancelIntent");

        const first = await sessions.cancel(h.row.id, h.token);
        expect(first).toMatchObject({
            status: "closed",
            kind: "hold",
            returnPath: "/book?service=cut",
        });
        expect(expire).toHaveBeenCalledTimes(1);
        expect(expire).toHaveBeenCalledWith(
            expect.objectContaining({ providerIntentId: h.cs }),
        );
        expect(
            (
                await prisma.paymentIntent.findUniqueOrThrow({
                    where: { id: h.row.id },
                })
            ).status,
        ).toBe("CANCELLED");
        expect((await booking(h.made.booking.id)).status).toBe("CANCELLED");

        // Again (a reload): no second expire, no second release.
        await expect(sessions.cancel(h.row.id, h.token)).resolves.toEqual(
            first,
        );
        expect(expire).toHaveBeenCalledTimes(1);
        const events = await prisma.bookingEvent.findMany({
            where: { bookingId: h.made.booking.id },
        });
        expect(
            events.filter((e) => e.type === BookingEventType.Cancelled),
        ).toHaveLength(1);
    });

    it("a wrong token is the same 404 as an unknown intent, and changes nothing", async () => {
        const h = await heldSession();
        const wrong = sessions.cancel(h.row.id, "not-the-token");
        const unknown = sessions.cancel("no-such-intent", h.token);
        await expect(wrong).rejects.toMatchObject({ status: 404 });
        await expect(unknown).rejects.toMatchObject({ status: 404 });
        const [a, b] = await Promise.all([
            wrong.catch((e: Error) => e.message),
            unknown.catch((e: Error) => e.message),
        ]);
        expect(a).toBe(b);
        expect((await booking(h.made.booking.id)).status).toBe("PENDING");
    });

    it("cancel on a session Stripe already took payment on settles it, with nothing released", async () => {
        const h = await heldSession();
        jest.spyOn(stripe, "cancelIntent").mockResolvedValue(false);
        jest.spyOn(stripe, "findOrderPayments").mockResolvedValue([
            {
                providerPaymentRef: `ch_cr_${tag}`,
                status: "CAPTURED",
                amountCents: h.row.amountCents,
                currency: "USD",
                providerIntentId: h.pi,
            },
        ]);

        await expect(sessions.cancel(h.row.id, h.token)).resolves.toMatchObject(
            { status: "paid" },
        );
        expect((await booking(h.made.booking.id)).status).toBe("CONFIRMED");
    });

    it("cancel on a site order leaves the order to be paid with a new session", async () => {
        seq += 1;
        const order = await prisma.order.create({
            data: {
                storeId,
                organizationId: owner.organizationId,
                orderId: `CR-${seq}`,
                customerId,
                currency: "USD",
                subtotal: "20.00",
                tax: "0.00",
                total: "20.00",
                status: "PENDING",
                paymentStatus: "UNPAID",
                fulfilment: "PICKUP",
            },
            select: { id: true },
        });
        const first = await payments.createIntentForOrderPublic(order.id, {
            idempotencyKey: `cro_${tag}_1`,
        });

        await expect(
            sessions.cancel(first.paymentIntentId, cancelToken()),
        ).resolves.toMatchObject({ status: "closed", kind: "order" });

        const after = await prisma.order.findUniqueOrThrow({
            where: { id: order.id },
        });
        expect(after).toMatchObject({
            status: "PENDING",
            paymentStatus: "UNPAID",
        });
        const again = await payments.createIntentForOrderPublic(order.id, {
            idempotencyKey: `cro_${tag}_2`,
        });
        expect(again.paymentIntentId).not.toBe(first.paymentIntentId);
    });

    it("a hold paid after its place went reads as refunding", async () => {
        const h = await heldSession();
        await prisma.$transaction((tx) =>
            releaseHoldInTx(tx, h.made.booking.id, new Date()),
        );
        await completed(h);
        await expect(sessions.read(h.cs)).resolves.toMatchObject({
            status: "refunding",
        });
    });
});
