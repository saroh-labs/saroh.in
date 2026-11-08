// The REAL Stripe webhook verifier and normalizer: Stripe's documented
// signature scheme with a fixed clock, and its documented sample events for
// the pinned version (`__fixtures__/stripe/`, built from the sample
// PaymentIntent, Refund and Event objects on docs.stripe.com/api; every id
// and secret is made up). No env, no Prisma, no network.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    STRIPE_SIGNATURE_TOLERANCE_S,
    StripeWebhookProvider,
} from "./stripe.webhook";

const SECRET = "whsec_made_up_for_tests";
const NOW_S = 1_762_400_000;
const stripe = new StripeWebhookProvider(() => NOW_S * 1000);

const RAW = Buffer.from(
    JSON.stringify({ id: "evt_1", type: "payment_intent.succeeded" }),
);

function sign(raw: Buffer, t: number, secret = SECRET): string {
    return createHmac("sha256", secret)
        .update(`${t}.`)
        .update(raw)
        .digest("hex");
}

function verify(header: string | undefined, raw = RAW, secret = SECRET) {
    return stripe.verifySignature({
        rawBody: raw,
        headers: header === undefined ? {} : { "Stripe-Signature": header },
        secret,
    });
}

describe("StripeWebhookProvider.verifySignature", () => {
    it("accepts a v1 over `t.body` keyed by the whole whsec_ secret", () => {
        expect(verify(`t=${NOW_S},v1=${sign(RAW, NOW_S)}`)).toBe(true);
    });

    it("refuses a wrong secret, a changed body, and no header", () => {
        expect(verify(`t=${NOW_S},v1=${sign(RAW, NOW_S, "whsec_other")}`)).toBe(
            false,
        );
        const changed = Buffer.from(`${RAW.toString()} `);
        expect(verify(`t=${NOW_S},v1=${sign(RAW, NOW_S)}`, changed)).toBe(
            false,
        );
        expect(verify(undefined)).toBe(false);
        expect(verify(`t=${NOW_S},v1=${sign(RAW, NOW_S)}`, RAW, "")).toBe(
            false,
        );
    });

    it("refuses a t outside the tolerance, and accepts one just inside", () => {
        const stale = NOW_S - STRIPE_SIGNATURE_TOLERANCE_S - 1;
        expect(verify(`t=${stale},v1=${sign(RAW, stale)}`)).toBe(false);
        const ahead = NOW_S + STRIPE_SIGNATURE_TOLERANCE_S + 1;
        expect(verify(`t=${ahead},v1=${sign(RAW, ahead)}`)).toBe(false);
        const edge = NOW_S - STRIPE_SIGNATURE_TOLERANCE_S;
        expect(verify(`t=${edge},v1=${sign(RAW, edge)}`)).toBe(true);
    });

    it("accepts any one of several v1 (a secret being rolled)", () => {
        const header = `t=${NOW_S},v1=${sign(RAW, NOW_S, "whsec_old")},v1=${sign(RAW, NOW_S)}`;
        expect(verify(header)).toBe(true);
    });

    it("ignores v0: a v0-only header is refused", () => {
        expect(verify(`t=${NOW_S},v0=${sign(RAW, NOW_S)}`)).toBe(false);
    });

    it("never throws on a malformed header", () => {
        for (const header of ["", "garbage", "t=abc,v1=zz", `t=${NOW_S},v1=`]) {
            expect(verify(header)).toBe(false);
        }
    });
});

function fixture(name: string): unknown {
    return JSON.parse(
        readFileSync(
            join(__dirname, "__fixtures__", "stripe", `${name}.json`),
            "utf8",
        ),
    );
}

describe("StripeWebhookProvider.parseEvent", () => {
    // The job re-parses a stored body with no headers: the id is the body's.
    const parse = (name: string) =>
        stripe.parseEvent({ payload: fixture(name), headers: {} });

    it("payment_intent.succeeded → SUCCEEDED with the charge and what was collected", () => {
        expect(parse("payment_intent.succeeded")).toEqual({
            providerEventId: "evt_3MtwBwLkdIwHu7ix0succeeded",
            eventType: "payment_intent.succeeded",
            outcome: "SUCCEEDED",
            providerIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
            providerPaymentRef: "ch_3MtwBwLkdIwHu7ix28a3tqPa",
            orderRef: "cmorder000000000000000001",
            capturedAmountCents: 2000,
            capturedCurrency: "USD",
        });
    });

    it("payment_intent.* reads Saroh's intent id from a Checkout payment's metadata", () => {
        const body = fixture("payment_intent.succeeded") as {
            data: { object: { metadata: Record<string, string> } };
        };
        body.data.object.metadata.saroh_intent = "cmintent000000000000000001";
        expect(stripe.parseEvent({ payload: body, headers: {} })).toMatchObject(
            {
                outcome: "SUCCEEDED",
                providerIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
                sarohIntentId: "cmintent000000000000000001",
            },
        );
    });

    const SESSION =
        "cs_test_a1SarohFixtureMadeUp0000000000000000000000000000000001";
    const session = {
        providerCheckoutId: SESSION,
        sarohIntentId: "cmintent000000000000000001",
        orderRef: "cminvoice00000000000000001",
    };

    it("checkout.session.completed, paid → SUCCEEDED with the PaymentIntent, amount and session", () => {
        expect(parse("checkout.session.completed")).toEqual({
            providerEventId: "evt_1SarohFixtureCompleted",
            eventType: "checkout.session.completed",
            outcome: "SUCCEEDED",
            providerIntentId: "pi_3SarohFixtureMadeUp0001",
            providerPaymentRef: "pi_3SarohFixtureMadeUp0001",
            capturedAmountCents: 2000,
            capturedCurrency: "USD",
            ...session,
        });
    });

    it("checkout.session.completed, unpaid (a slow method) → PROCESSING, nothing captured", () => {
        expect(parse("checkout.session.completed.unpaid")).toEqual({
            providerEventId: "evt_1SarohFixtureCompletedUnpaid",
            eventType: "checkout.session.completed",
            outcome: "PROCESSING",
            providerIntentId: "pi_3SarohFixtureMadeUp0001",
            ...session,
        });
    });

    it("async_payment_succeeded → SUCCEEDED; async_payment_failed → FAILED", () => {
        expect(parse("checkout.session.async_payment_succeeded")).toMatchObject(
            {
                outcome: "SUCCEEDED",
                providerIntentId: "pi_3SarohFixtureMadeUp0001",
                capturedAmountCents: 2000,
                capturedCurrency: "USD",
                ...session,
            },
        );
        const failed = parse("checkout.session.async_payment_failed");
        expect(failed).toMatchObject({ outcome: "FAILED", ...session });
        expect(failed.capturedAmountCents).toBeUndefined();
    });

    it("checkout.session.expired → CLOSED, with no PaymentIntent", () => {
        expect(parse("checkout.session.expired")).toEqual({
            providerEventId: "evt_1SarohFixtureExpired",
            eventType: "checkout.session.expired",
            outcome: "CLOSED",
            ...session,
        });
    });

    it("payment_intent.payment_failed → FAILED, nothing captured", () => {
        expect(parse("payment_intent.payment_failed")).toEqual({
            providerEventId: "evt_3MtwBwLkdIwHu7ix0paymentfailed",
            eventType: "payment_intent.payment_failed",
            outcome: "FAILED",
            providerIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
            providerPaymentRef: "ch_3MtwBwLkdIwHu7ix1declined",
            orderRef: "cmorder000000000000000001",
            capturedAmountCents: undefined,
            capturedCurrency: undefined,
        });
    });

    it.each([
        ["refund.created", "evt_1Nispe2eZvKYlo2C0refundcreated", "REFUNDED"],
        ["refund.updated", "evt_1Nispe2eZvKYlo2C0refundupdated", "REFUNDED"],
        ["refund.failed", "evt_1Nispe2eZvKYlo2C0refundfailed", "REFUND_FAILED"],
    ])("%s → %s, with Saroh's reference", (name, id, outcome) => {
        expect(parse(name)).toEqual({
            providerEventId: id,
            eventType: name,
            outcome,
            providerIntentId: "pi_3MtwBwLkdIwHu7ix28a3tqPa",
            providerPaymentRef: "ch_3MtwBwLkdIwHu7ix28a3tqPa",
            providerRefundId: "re_1Nispe2eZvKYlo2Cd31jOCgZ",
            refundAmountCents: 1000,
            refundReference: "cmrefund00000000000000001",
        });
    });

    it("a pending or canceled refund on refund.updated", () => {
        const body = fixture("refund.updated") as {
            data: { object: { status: string } };
        };
        body.data.object.status = "pending";
        expect(stripe.parseEvent({ payload: body, headers: {} }).outcome).toBe(
            "IGNORED",
        );
        body.data.object.status = "canceled";
        expect(stripe.parseEvent({ payload: body, headers: {} }).outcome).toBe(
            "REFUND_FAILED",
        );
    });

    it("any other event is IGNORED under its own id", () => {
        expect(parse("payment_intent.created")).toMatchObject({
            providerEventId: "evt_3MtwBwLkdIwHu7ix0created",
            outcome: "IGNORED",
        });
        expect(
            stripe.parseEvent({
                payload: { id: "evt_x", type: "charge.refunded" },
                headers: {},
            }),
        ).toEqual({
            providerEventId: "evt_x",
            eventType: "charge.refunded",
            outcome: "IGNORED",
        });
    });
});
