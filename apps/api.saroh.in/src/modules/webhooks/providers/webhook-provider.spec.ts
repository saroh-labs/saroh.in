// Pure crypto/normalization unit tests for the REAL Razorpay/Cashfree webhook
// verifiers (S5-003). No env, no Prisma, no network — just the documented HMAC
// schemes and body→normalized-event mapping.
import { createHmac } from "node:crypto";

import { CashfreeWebhookProvider } from "./cashfree.webhook";
import { RazorpayWebhookProvider } from "./razorpay.webhook";

const SECRET = "whsec_provider_test";

describe("RazorpayWebhookProvider", () => {
    const rzp = new RazorpayWebhookProvider();

    it("accepts a valid hex HMAC-SHA256 over the raw body", () => {
        const raw = Buffer.from(JSON.stringify({ event: "payment.captured" }));
        const sig = createHmac("sha256", SECRET).update(raw).digest("hex");
        expect(
            rzp.verifySignature({
                rawBody: raw,
                headers: { "x-razorpay-signature": sig },
                secret: SECRET,
            }),
        ).toBe(true);
    });

    it("rejects a tampered body / wrong secret / absent header", () => {
        const raw = Buffer.from(JSON.stringify({ event: "payment.captured" }));
        const sig = createHmac("sha256", SECRET).update(raw).digest("hex");

        // Body altered after signing.
        expect(
            rzp.verifySignature({
                rawBody: Buffer.from(
                    JSON.stringify({ event: "payment.captured", x: 1 }),
                ),
                headers: { "x-razorpay-signature": sig },
                secret: SECRET,
            }),
        ).toBe(false);

        // Wrong secret.
        expect(
            rzp.verifySignature({
                rawBody: raw,
                headers: {
                    "x-razorpay-signature": createHmac("sha256", "nope")
                        .update(raw)
                        .digest("hex"),
                },
                secret: SECRET,
            }),
        ).toBe(false);

        // Absent header.
        expect(
            rzp.verifySignature({ rawBody: raw, headers: {}, secret: SECRET }),
        ).toBe(false);
    });

    it("normalizes a captured payment to SUCCEEDED with the order + payment ids", () => {
        const event = rzp.parseEvent({
            payload: {
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: { id: "pay_9", order_id: "order_rzp_9" },
                    },
                },
            },
            headers: { "x-razorpay-event-id": "evt_rzp_9" },
        });
        expect(event).toEqual({
            providerEventId: "evt_rzp_9",
            eventType: "payment.captured",
            outcome: "SUCCEEDED",
            providerIntentId: "order_rzp_9",
            providerPaymentRef: "pay_9",
            providerRefundId: undefined,
        });
    });

    it("maps payment.failed→FAILED and refund.*→REFUNDED", () => {
        expect(
            rzp.parseEvent({
                payload: { event: "payment.failed" },
                headers: {},
            }).outcome,
        ).toBe("FAILED");
        expect(
            rzp.parseEvent({
                payload: {
                    event: "refund.processed",
                    payload: { refund: { entity: { id: "rfnd_1" } } },
                },
                headers: {},
            }).outcome,
        ).toBe("REFUNDED");
    });
});

describe("CashfreeWebhookProvider", () => {
    const cf = new CashfreeWebhookProvider();

    it("accepts a valid base64 HMAC over timestamp + raw body", () => {
        const raw = Buffer.from(
            JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" }),
        );
        const ts = "1700000000000";
        const signed = Buffer.concat([Buffer.from(ts, "utf8"), raw]);
        const sig = createHmac("sha256", SECRET)
            .update(signed)
            .digest("base64");
        expect(
            cf.verifySignature({
                rawBody: raw,
                headers: {
                    "x-webhook-signature": sig,
                    "x-webhook-timestamp": ts,
                },
                secret: SECRET,
            }),
        ).toBe(true);
    });

    it("rejects when the timestamp is missing or the signature is wrong", () => {
        const raw = Buffer.from(
            JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK" }),
        );
        const ts = "1700000000000";
        const sig = createHmac("sha256", SECRET)
            .update(Buffer.concat([Buffer.from(ts, "utf8"), raw]))
            .digest("base64");

        // Missing timestamp header.
        expect(
            cf.verifySignature({
                rawBody: raw,
                headers: { "x-webhook-signature": sig },
                secret: SECRET,
            }),
        ).toBe(false);

        // Wrong timestamp changes the signed payload.
        expect(
            cf.verifySignature({
                rawBody: raw,
                headers: {
                    "x-webhook-signature": sig,
                    "x-webhook-timestamp": "1700000000001",
                },
                secret: SECRET,
            }),
        ).toBe(false);
    });

    it("normalizes a success webhook to SUCCEEDED keyed by the merchant order id", () => {
        const event = cf.parseEvent({
            payload: {
                type: "PAYMENT_SUCCESS_WEBHOOK",
                data: {
                    order: { order_id: "order_cf_1" },
                    payment: { cf_payment_id: 55, payment_status: "SUCCESS" },
                },
            },
            headers: {},
        });
        expect(event.outcome).toBe("SUCCEEDED");
        expect(event.orderRef).toBe("order_cf_1");
        expect(event.providerPaymentRef).toBe("55");
        expect(event.providerEventId).toBe("PAYMENT_SUCCESS_WEBHOOK:55");
    });

    it("only treats a REFUND_STATUS_WEBHOOK with refund_status SUCCESS as REFUNDED", () => {
        const refunded = cf.parseEvent({
            payload: {
                type: "REFUND_STATUS_WEBHOOK",
                data: {
                    order: { order_id: "order_cf_1" },
                    refund: { cf_refund_id: 77, refund_status: "SUCCESS" },
                },
            },
            headers: {},
        });
        expect(refunded.outcome).toBe("REFUNDED");
        expect(refunded.providerRefundId).toBe("77");

        const pending = cf.parseEvent({
            payload: {
                type: "REFUND_STATUS_WEBHOOK",
                data: {
                    refund: { cf_refund_id: 77, refund_status: "PENDING" },
                },
            },
            headers: {},
        });
        expect(pending.outcome).toBe("IGNORED");
    });
});
