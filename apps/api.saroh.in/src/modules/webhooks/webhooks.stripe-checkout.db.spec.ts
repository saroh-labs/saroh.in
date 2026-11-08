/**
 * Stripe hosted Checkout's webhooks (plan 2026-11-07-002, U6), through the
 * real Stripe verifier and normaliser, the real inbox and a real Postgres.
 * Every event is a fixture from `providers/__fixtures__/stripe/` with this
 * run's ids put in:
 *
 * - `checkout.session.completed` (paid) settles a booking hold once, and
 *   the row's `cs_…` becomes the `pi_…` while the session id stays;
 * - a `payment_intent.succeeded` alone (an endpoint without the new events)
 *   settles by Saroh's id in its metadata, and swaps;
 * - a session event naming another business's intent matches nothing;
 * - a slow method is PROCESSING, then settles or fails on its async event;
 * - `expired` cancels an open intent only;
 * - a capture at another amount is owed back, never paid (PAY-06);
 * - a late hold payment is refunded naming the `pi_`;
 * - the checkout return finds the row by its session after the swap, and a
 *   look-up settles and swaps before any webhook;
 * - a hold already paying through a session gets it back on a new Pay.
 *
 * The merchant provider is the network-free Stripe double; the site's
 * origin is stubbed. Every key is made up. Runs in the integration project
 * (TEST_DATABASE_URL).
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
import { releaseHoldInTx } from "../bookings/booking-hold";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PaymentsService } from "../payments/payments.service";
import type { ProviderFactory } from "../payments/providers/provider.port";
import { FakeStripeProvider } from "../payments/providers/stripe-fake";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { PaymentLookupService } from "./payment-lookup.service";
import { StripeWebhookProvider } from "./providers/stripe.webhook";
import { DefaultWebhookProviderFactory } from "./providers/webhook-provider.factory";
import { WebhooksService } from "./webhooks.service";

const tag = `${process.pid}-${Date.now()}`;
const WEBHOOK_SECRET = "whsec_madeupcheckoutevents";

const stripe = new FakeStripeProvider();
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

let owner: OrganizationContext;
let otherOrgId = "";
let service = "";
let storeId = "";
let customerId = "";
let seq = 0;
let dayOut = 3;

async function business(slug: string) {
    const org = await prisma.organization.create({
        data: {
            name: "Rye Studio",
            slug: `${slug}-${tag}`,
            edition: "GLOBAL",
            currency: "USD",
        },
    });
    const user = await prisma.user.create({
        data: { email: `${slug}-${tag}@example.com` },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await giveBusinessDetails(org.id);
    await prisma.featureFlagOverride.create({
        data: {
            flagKey: "STRIPE_PAYMENTS",
            organizationId: org.id,
            enabled: true,
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        edition: "GLOBAL",
    };
    await payments.connectProvider(ctx, {
        provider: "STRIPE",
        publicKey: "pk_test_madeup",
        keyId: "pk_test_madeup",
        keySecret: "rk_test_madeup",
        webhookSecret: WEBHOOK_SECRET,
    });
    return ctx;
}

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: "STRIPE_PAYMENTS" },
        create: { key: "STRIPE_PAYMENTS", enabledByDefault: false },
        update: {},
    });
    owner = await business("checkout-events");
    otherOrgId = (await business("checkout-events-other")).organizationId;
    const org = owner.organizationId;
    await prisma.businessProfile.update({
        where: { organizationId: org },
        data: { timezone: "UTC" },
    });
    service = (
        await prisma.service.create({
            data: {
                organizationId: org,
                name: "Haircut",
                durationMinutes: 60,
                capacity: 1,
                priceCents: 4_000,
                currency: "USD",
                timezone: "UTC",
                availabilityRules: {
                    create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                        organizationId: org,
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
            data: { name: "Quay", slug: `ce-quay-${tag}`, organizationId: org },
        })
    ).id;
    customerId = (
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: org,
                email: `ce-buyer-${tag}@example.com`,
                firstName: "Ana",
            },
        })
    ).id;
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

/** A pay-now hold on the haircut with its Stripe session made. */
async function heldSession() {
    seq += 1;
    const made = await publicBookings.bookOnline(
        service,
        {
            startAt: nextStart().toISOString(),
            bookerName: "Asha Rao",
            bookerEmail: `ce-${seq}-${tag}@example.com`,
            idempotencyKey: `ce_${tag}_${seq}`,
            pay: "NOW",
        },
        "ip_1",
    );
    const intent = await publicInvoices.createIntent(made.payToken ?? "", {
        idempotencyKey: `cek_${tag}_${seq}`,
    });
    const row = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.paymentIntentId },
    });
    return {
        made,
        intent,
        row,
        cs: row.providerCheckoutId ?? "",
        pi: `pi_ce_${seq}_${tag}`,
        invoiceId: row.invoiceId ?? "",
    };
}

/** A USD 20.00 site order paid through an open Checkout session. */
async function orderSession() {
    seq += 1;
    const order = await prisma.order.create({
        data: {
            storeId,
            organizationId: owner.organizationId,
            orderId: `CE-${seq}`,
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
    const cs = `cs_test_ce_${seq}_${tag}`;
    const row = await prisma.paymentIntent.create({
        data: {
            organizationId: owner.organizationId,
            orderId: order.id,
            provider: "STRIPE",
            providerIntentId: cs,
            providerCheckoutId: cs,
            amountCents: 2000,
            currency: "USD",
            status: "REQUIRES_PAYMENT",
        },
    });
    return { order, row, cs, pi: `pi_ce_${seq}_${tag}` };
}

const FIXTURES = join(__dirname, "providers", "__fixtures__", "stripe");

/** A fixture with this run's ids in it. */
function fixture(
    name: string,
    ids: {
        evt: string;
        cs?: string;
        pi?: string | null;
        intent?: string;
        ref?: string;
        amount?: number;
    },
) {
    const body = JSON.parse(
        readFileSync(join(FIXTURES, `${name}.json`), "utf8"),
    ) as {
        id: string;
        data: { object: Record<string, unknown> };
    };
    const object = body.data.object;
    body.id = ids.evt;
    if (ids.cs) object.id = ids.cs;
    if (ids.pi !== undefined) {
        if (object.object === "payment_intent") object.id = ids.pi;
        else object.payment_intent = ids.pi;
    }
    if (object.object === "checkout.session") {
        object.client_reference_id = ids.intent ?? null;
        if (ids.amount !== undefined) object.amount_total = ids.amount;
    } else if (ids.amount !== undefined) {
        object.amount_received = ids.amount;
    }
    object.metadata = {
        ...(ids.ref ? { saroh_ref: ids.ref } : {}),
        ...(ids.intent ? { saroh_intent: ids.intent } : {}),
    };
    return body;
}

/** Deliver one event as Stripe signs it now. */
function deliver(event: unknown, orgId = owner.organizationId) {
    const raw = Buffer.from(JSON.stringify(event));
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", WEBHOOK_SECRET)
        .update(`${t}.`)
        .update(raw)
        .digest("hex");
    return webhooks.handle("stripe", orgId, raw, {
        "stripe-signature": `t=${t},v1=${v1}`,
    });
}

const intentRow = (id: string) =>
    prisma.paymentIntent.findUniqueOrThrow({ where: { id } });

describe("Stripe Checkout's events (real verifier, real database)", () => {
    it("completed, paid: a hold is confirmed, its invoice paid, and the row's session swapped for the PaymentIntent, once", async () => {
        const h = await heldSession();
        const event = fixture("checkout.session.completed", {
            evt: `evt_ce_done_${h.cs}`,
            cs: h.cs,
            pi: h.pi,
            intent: h.row.id,
            ref: h.invoiceId,
            amount: h.row.amountCents,
        });

        await expect(deliver(event)).resolves.toMatchObject({
            status: "processed",
            changed: true,
        });
        await expect(deliver(event)).resolves.toEqual({
            status: "duplicate",
            changed: false,
        });

        const row = await intentRow(h.row.id);
        expect(row).toMatchObject({
            status: "SUCCEEDED",
            providerIntentId: h.pi,
            providerCheckoutId: h.cs,
        });
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: h.made.booking.id },
                })
            ).status,
        ).toBe("CONFIRMED");
        expect(
            (
                await prisma.invoice.findUniqueOrThrow({
                    where: { id: h.invoiceId },
                })
            ).status,
        ).toBe("PAID");

        // The PaymentIntent's own event, under its own id, changes nothing.
        const pi = fixture("payment_intent.succeeded", {
            evt: `evt_ce_pi_${h.cs}`,
            pi: h.pi,
            intent: h.row.id,
            ref: h.invoiceId,
            amount: h.row.amountCents,
        });
        await expect(deliver(pi)).resolves.toMatchObject({ changed: false });

        // A later session event naming another PaymentIntent never
        // overwrites the one linked.
        await deliver(
            fixture("checkout.session.completed", {
                evt: `evt_ce_other_${h.cs}`,
                cs: h.cs,
                pi: `pi_someone_else_${tag}`,
                intent: h.row.id,
                amount: h.row.amountCents,
            }),
        );
        expect((await intentRow(h.row.id)).providerIntentId).toBe(h.pi);
    });

    it("payment_intent.succeeded alone (an older endpoint) settles by Saroh's id and swaps; the session event after it changes nothing", async () => {
        const h = await heldSession();
        await deliver(
            fixture("payment_intent.succeeded", {
                evt: `evt_ce_pionly_${h.cs}`,
                pi: h.pi,
                intent: h.row.id,
                ref: h.invoiceId,
                amount: h.row.amountCents,
            }),
        );
        expect(await intentRow(h.row.id)).toMatchObject({
            status: "SUCCEEDED",
            providerIntentId: h.pi,
            providerCheckoutId: h.cs,
        });

        const late = await deliver(
            fixture("checkout.session.completed", {
                evt: `evt_ce_after_${h.cs}`,
                cs: h.cs,
                pi: h.pi,
                intent: h.row.id,
                ref: h.invoiceId,
                amount: h.row.amountCents,
            }),
        );
        expect(late.changed).toBe(false);
        expect(
            await prisma.paymentAttempt.count({
                where: { paymentIntentId: h.row.id, status: "CAPTURED" },
            }),
        ).toBe(1);
    });

    it("a session event naming another business's intent matches nothing", async () => {
        const h = await heldSession();
        const result = await deliver(
            fixture("checkout.session.completed", {
                evt: `evt_ce_foreign_${h.cs}`,
                cs: `cs_test_unknown_${tag}`,
                pi: h.pi,
                intent: h.row.id,
                amount: h.row.amountCents,
            }),
            otherOrgId,
        );
        expect(result.changed).toBe(false);
        expect(await intentRow(h.row.id)).toMatchObject({
            status: "REQUIRES_PAYMENT",
            providerIntentId: h.cs,
        });
    });

    it("a slow method: completed unpaid is PROCESSING, the order untouched; async failed fails it as a decline", async () => {
        const o = await orderSession();
        const ids = {
            cs: o.cs,
            pi: o.pi,
            intent: o.row.id,
            ref: o.order.id,
            amount: 2000,
        };
        await deliver(
            fixture("checkout.session.completed.unpaid", {
                evt: `evt_ce_slow_${o.cs}`,
                ...ids,
            }),
        );
        expect(await intentRow(o.row.id)).toMatchObject({
            status: "PROCESSING",
            providerIntentId: o.pi,
        });
        const order = () =>
            prisma.order.findUniqueOrThrow({ where: { id: o.order.id } });
        expect((await order()).paymentStatus).toBe("UNPAID");

        await deliver(
            fixture("checkout.session.async_payment_failed", {
                evt: `evt_ce_slowfail_${o.cs}`,
                ...ids,
            }),
        );
        expect((await intentRow(o.row.id)).status).toBe("FAILED");
        expect((await order()).paymentStatus).toBe("FAILED");
    });

    it("a slow method that succeeds pays the order", async () => {
        const o = await orderSession();
        const ids = {
            cs: o.cs,
            pi: o.pi,
            intent: o.row.id,
            ref: o.order.id,
            amount: 2000,
        };
        await deliver(
            fixture("checkout.session.completed.unpaid", {
                evt: `evt_ce_slow2_${o.cs}`,
                ...ids,
            }),
        );
        await deliver(
            fixture("checkout.session.async_payment_succeeded", {
                evt: `evt_ce_slowok_${o.cs}`,
                ...ids,
            }),
        );
        expect((await intentRow(o.row.id)).status).toBe("SUCCEEDED");
        expect(
            (
                await prisma.order.findUniqueOrThrow({
                    where: { id: o.order.id },
                })
            ).paymentStatus,
        ).toBe("PAID");
    });

    it("expired cancels an open intent, and changes nothing once it is paid or cancelled", async () => {
        const open = await orderSession();
        await deliver(
            fixture("checkout.session.expired", {
                evt: `evt_ce_exp_${open.cs}`,
                cs: open.cs,
                pi: null,
                intent: open.row.id,
                ref: open.order.id,
            }),
        );
        expect((await intentRow(open.row.id)).status).toBe("CANCELLED");

        const paid = await orderSession();
        await prisma.paymentIntent.update({
            where: { id: paid.row.id },
            data: { status: "SUCCEEDED" },
        });
        const result = await deliver(
            fixture("checkout.session.expired", {
                evt: `evt_ce_exp2_${paid.cs}`,
                cs: paid.cs,
                pi: null,
                intent: paid.row.id,
            }),
        );
        expect(result.changed).toBe(false);
        expect((await intentRow(paid.row.id)).status).toBe("SUCCEEDED");
    });

    it("a capture at another amount is owed back and nothing is paid (PAY-06)", async () => {
        const h = await heldSession();
        await deliver(
            fixture("checkout.session.completed", {
                evt: `evt_ce_mismatch_${h.cs}`,
                cs: h.cs,
                pi: h.pi,
                intent: h.row.id,
                amount: h.row.amountCents + 100,
            }),
        );
        const attempts = await prisma.paymentAttempt.findMany({
            where: {
                paymentIntentId: h.row.id,
                status: "CAPTURED_NEEDS_REFUND",
            },
        });
        expect(attempts).toEqual([
            expect.objectContaining({
                rawResponse: expect.objectContaining({
                    reason: "AMOUNT_MISMATCH",
                }),
            }),
        ]);
        expect((await intentRow(h.row.id)).status).toBe("FAILED");
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: h.made.booking.id },
                })
            ).status,
        ).toBe("PENDING");
    });

    it("a late hold payment is refunded naming the PaymentIntent, swapped on the same delivery", async () => {
        const h = await heldSession();
        // Paid between the look-up and the release: the session stays open.
        await prisma.$transaction((tx) =>
            releaseHoldInTx(tx, h.made.booking.id, new Date()),
        );
        await deliver(
            fixture("checkout.session.completed", {
                evt: `evt_ce_late_${h.cs}`,
                cs: h.cs,
                pi: h.pi,
                intent: h.row.id,
                ref: h.invoiceId,
                amount: h.row.amountCents,
            }),
        );
        expect((await intentRow(h.row.id)).providerIntentId).toBe(h.pi);
        const refund = await prisma.paymentRefund.findFirstOrThrow({
            where: { paymentIntentId: h.row.id },
        });
        jest.spyOn(stripe, "findRefund").mockResolvedValue(null);
        const send = jest.spyOn(stripe, "refund").mockResolvedValue({
            providerRefundId: `re_ce_${tag}`,
            status: "pending",
            failed: false,
        });
        await payments.sendQueuedRefund(owner.organizationId, refund.id);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({ providerIntentId: h.pi }),
        );
    });

    it("the checkout return finds the row by its session, before and after the swap", async () => {
        const h = await heldSession();
        // Stripe reads the session as paid, on its PaymentIntent.
        jest.spyOn(stripe, "findOrderPayments").mockResolvedValue([
            {
                providerPaymentRef: `ch_ce_${tag}`,
                status: "CAPTURED",
                amountCents: h.row.amountCents,
                currency: "USD",
                providerIntentId: h.pi,
            },
        ]);
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "STRIPE",
                providerOrderId: h.cs,
            }),
        ).resolves.toEqual({ confirmed: true });
        expect(await intentRow(h.row.id)).toMatchObject({
            status: "SUCCEEDED",
            providerIntentId: h.pi,
        });
        // Again, after the swap: still the session's row.
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "STRIPE",
                providerOrderId: h.cs,
            }),
        ).resolves.toEqual({ confirmed: true });
    });

    it("a look-up of a complete, unpaid session marks it processing", async () => {
        const o = await orderSession();
        jest.spyOn(stripe, "findOrderPayments").mockResolvedValue([
            {
                providerPaymentRef: o.pi,
                status: "PENDING",
                amountCents: 2000,
                currency: "USD",
                providerIntentId: o.pi,
            },
        ]);
        await expect(
            lookup.confirmCheckoutReturn({
                provider: "STRIPE",
                providerOrderId: o.cs,
            }),
        ).resolves.toEqual({ confirmed: false });
        expect(await intentRow(o.row.id)).toMatchObject({
            status: "PROCESSING",
            providerIntentId: o.pi,
        });
    });
});

describe("a hold pays through one session (U6, real database)", () => {
    it("a new Pay on a hold gets its open session back, and the hold is not stretched", async () => {
        const h = await heldSession();
        const held = await prisma.booking.findUniqueOrThrow({
            where: { id: h.made.booking.id },
        });
        const create = jest.spyOn(stripe, "createOrderIntent");

        const again = await publicInvoices.createIntent(h.made.payToken ?? "", {
            idempotencyKey: `cek_new_${h.cs}`,
        });

        expect(create).not.toHaveBeenCalled();
        expect(again.paymentIntentId).toBe(h.intent.paymentIntentId);
        expect(again.clientParams).toEqual(h.intent.clientParams);
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: h.made.booking.id },
                })
            ).holdExpiresAt,
        ).toEqual(held.holdExpiresAt);
    });

    it("with no session left that can take it, a new Pay is 409 checkout-closed", async () => {
        const h = await heldSession();
        await prisma.paymentIntent.update({
            where: { id: h.row.id },
            data: { status: "CANCELLED" },
        });
        await expect(
            publicInvoices.createIntent(h.made.payToken ?? "", {
                idempotencyKey: `cek_closed_${h.cs}`,
            }),
        ).rejects.toMatchObject({
            response: { details: { reason: "checkout-closed" } },
        });
    });
});
