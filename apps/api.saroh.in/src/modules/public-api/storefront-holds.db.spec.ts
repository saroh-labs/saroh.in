/**
 * The storefront API's holds over HTTP against a real Postgres (plan
 * 2026-11-10-001, U7; review #10): with the business's own provider
 * connected (the fake), a visitor holds a deposit slot, the slot is then
 * taken for anyone else, the payment starts with the hold token and the
 * provider's webhook confirms the booking. A released hold frees its slot,
 * and another business's hold token is as good as missing.
 * Runs in the integration project (TEST_DATABASE_URL), and with TEST_RLS=on.
 */
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import { createHmac } from "node:crypto";

import { storefrontBooking, storefrontPayment } from "@saroh/api-contract";
import { prisma } from "@saroh/database";

import {
    bearer,
    booking,
    business,
    call,
    exactly,
    mint,
    nextMonday,
    payments,
    SITE,
    tag,
    uniq,
    useStorefrontApp,
} from "../../../test/fixtures/storefront";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";

useStorefrontApp();

const WEBHOOK_SECRET = "whsec_storefront_holds";
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);
let webhookSeq = 0;

/** A business whose service asks half its price as a deposit, its provider connected. */
async function takingDeposits(name: string) {
    const org = await business(name);
    await prisma.service.update({
        where: { id: org.serviceId },
        data: {
            priceCents: 80_000,
            currency: "INR",
            depositMode: "PERCENT_50",
        },
    });
    await payments.connectProvider(
        { organizationId: org.id, userId: org.owner, role: "OWNER" },
        {
            provider: "RAZORPAY",
            publicKey: "rzp_test_SF",
            keyId: "rzp_test_SF",
            keySecret: "rzp_secret",
            webhookSecret: WEBHOOK_SECRET,
        },
    );
    return { ...org, ...(await mint(org)) };
}

async function hold(token: string, serviceId: string, startAt: Date) {
    return call(
        "POST",
        "/v1/storefront/write/holds",
        { ...bearer(token), origin: SITE, "idempotency-key": uniq("hold") },
        { ...booking(serviceId, startAt), pay: "deposit" },
    );
}

/** The provider says the payment went through, as its webhook would. */
async function providerCaptures(organizationId: string, paymentId: string) {
    const intent = await prisma.paymentIntent.findUniqueOrThrow({
        where: { id: paymentId },
    });
    const raw = Buffer.from(
        JSON.stringify({
            providerEventId: `evt_sf_${++webhookSeq}_${tag}`,
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: intent.providerIntentId,
            providerPaymentRef: `pay_sf_${webhookSeq}_${tag}`,
        }),
    );
    await webhooks.handle("razorpay", organizationId, raw, {
        "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
            .update(raw)
            .digest("hex"),
    });
}

describe("storefront holds (storefront token, provider connected)", () => {
    it("holds a deposit slot, takes it from anyone else, and books it once the deposit is paid", async () => {
        const org = await takingDeposits("Pulse Fitness");
        const startAt = nextMonday(6);
        const held = await hold(org.token, org.serviceId, startAt);
        expect(held.status).toBe(201);
        exactly(storefrontBooking, held.body);
        expect(held.body).toMatchObject({
            serviceName: "Consultation",
            startAt: startAt.toISOString(),
            state: "held",
        });
        expect(typeof held.body.holdExpiresAt).toBe("string");
        const holdToken = held.body.holdToken as string;
        expect(typeof holdToken).toBe("string");

        // The slot is held: nobody else can hold or book it.
        const second = await hold(org.token, org.serviceId, startAt);
        expect(second.status).toBe(409);
        expect(second.body.error?.code).toBe("conflict");

        // The payment starts at the business's own provider, for the deposit.
        const pay = await call(
            "POST",
            "/v1/storefront/write/payments",
            { ...bearer(org.token), "idempotency-key": uniq("pay") },
            { holdToken },
        );
        expect(pay.status).toBe(201);
        exactly(storefrontPayment, pay.body);
        expect(pay.body).toMatchObject({
            provider: "razorpay",
            amount: { amountMinor: 40_000, currency: "INR" },
            publicKey: "rzp_test_SF",
        });

        // The provider confirms it, and the hold is a booking in the diary.
        await providerCaptures(org.id, pay.body.id as string);
        const row = await prisma.booking.findFirstOrThrow({
            where: { organizationId: org.id, serviceId: org.serviceId },
        });
        expect(row.status).toBe("CONFIRMED");
        expect(row.startAt.toISOString()).toBe(startAt.toISOString());
        expect(row.bookerEmail).toBe("asha@example.com");
        expect(
            await prisma.booking.count({ where: { organizationId: org.id } }),
        ).toBe(1);
        // Still taken now it is booked.
        expect((await hold(org.token, org.serviceId, startAt)).status).toBe(
            409,
        );
    });

    it("releases a hold, freeing its slot for a new one", async () => {
        const org = await takingDeposits("Rye");
        const startAt = nextMonday(7);
        const held = await hold(org.token, org.serviceId, startAt);
        expect(held.status).toBe(201);
        const released = await call(
            "POST",
            "/v1/storefront/write/holds/release",
            { ...bearer(org.token), "idempotency-key": uniq("release") },
            { holdToken: held.body.holdToken },
        );
        expect(released.status).toBe(200);
        exactly(storefrontBooking, released.body);
        expect(released.body).toMatchObject({
            id: held.body.id,
            state: "released",
            holdToken: null,
        });
        const again = await hold(org.token, org.serviceId, startAt);
        expect(again.status).toBe(201);
        expect(again.body.state).toBe("held");
    });

    it("404s releasing or paying another business's hold, leaving it held", async () => {
        const a = await takingDeposits("Rye");
        const b = await takingDeposits("Pulse");
        const theirs = await hold(b.token, b.serviceId, nextMonday(8));
        expect(theirs.status).toBe(201);
        for (const path of ["holds/release", "payments"]) {
            const answer = await call(
                "POST",
                `/v1/storefront/write/${path}`,
                bearer(a.token),
                { holdToken: theirs.body.holdToken },
            );
            expect({ path, status: answer.status }).toEqual({
                path,
                status: 404,
            });
            expect(answer.body.error?.code).toBe("not_found");
        }
        const row = await prisma.booking.findFirstOrThrow({
            where: { organizationId: b.id },
        });
        expect(row.holdExpiresAt).not.toBeNull();
        expect(
            await prisma.paymentIntent.count({
                where: { organizationId: b.id },
            }),
        ).toBe(0);
    });
});
