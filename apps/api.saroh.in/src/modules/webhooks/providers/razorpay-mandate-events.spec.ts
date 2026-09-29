// Razorpay's recurring-payment deliveries → the webhook port (round-2 D19).
// Pure: the real verifier and normaliser over bodies shaped as the D11
// spike and Razorpay's webhook docs show them. No env, Prisma or network.
import { createHmac } from "node:crypto";

import {
    authLink,
    authPayment,
    cardToken,
    chargePayment,
    delivery,
    notice,
    RZP,
    token,
} from "../../../../test/fixtures/razorpay-recurring";
import { RazorpayWebhookProvider } from "./razorpay.webhook";

const SECRET = "whsec_business_own";
const rzp = new RazorpayWebhookProvider();

function parse(body: unknown, eventId?: string) {
    return rzp.parseEvent({
        payload: body,
        headers: eventId ? { "x-razorpay-event-id": eventId } : {},
    });
}

describe("signature: the business's own webhook secret over the raw body", () => {
    const raw = Buffer.from(
        JSON.stringify(
            delivery("token.confirmed", { token: token("confirmed") }),
        ),
    );
    const sign = (secret: string) =>
        createHmac("sha256", secret).update(raw).digest("hex");

    it("passes with the business's secret", () => {
        expect(
            rzp.verifySignature({
                rawBody: raw,
                headers: { "X-Razorpay-Signature": sign(SECRET) },
                secret: SECRET,
            }),
        ).toBe(true);
    });

    it("fails with another business's secret, or an altered body", () => {
        expect(
            rzp.verifySignature({
                rawBody: raw,
                headers: {
                    "x-razorpay-signature": sign("whsec_other_business"),
                },
                secret: SECRET,
            }),
        ).toBe(false);
        expect(
            rzp.verifySignature({
                rawBody: Buffer.from(
                    raw.toString().replace("confirmed", "cancelled"),
                ),
                headers: { "x-razorpay-signature": sign(SECRET) },
                secret: SECRET,
            }),
        ).toBe(false);
    });
});

describe("token events → the mandate's state", () => {
    it("token.confirmed → ACTIVE, with method, masked handle, limit and expiry", () => {
        const event = parse(
            delivery("token.confirmed", { token: token("confirmed") }),
            "evt_1",
        );
        expect(event).toEqual({
            providerEventId: "evt_1",
            eventType: "token.confirmed",
            outcome: "MANDATE",
            mandate: {
                status: "ACTIVE",
                providerMandateId: RZP.tokenId,
                method: "UPI",
                displayHint: "te•••@razorpay",
                maxAmountCents: 50000,
                expiresAt: new Date(2105000000 * 1000),
                failureReason: undefined,
            },
        });
        expect(JSON.stringify(event)).not.toContain("test.user");
    });

    it("a card token's hint is its last four", () => {
        const event = parse(
            delivery("token.confirmed", { token: cardToken() }),
        );
        expect(event.mandate?.method).toBe("CARD");
        expect(event.mandate?.displayHint).toBe("•••• 1111");
    });

    it.each([
        ["token.paused", "paused", "PAUSED"],
        ["token.cancelled", "cancelled", "CANCELLED"],
        ["token.rejected", "rejected", "FAILED"],
    ] as const)("%s → %s", (eventType, status, expected) => {
        const event = parse(delivery(eventType, { token: token(status) }));
        expect(event.outcome).toBe("MANDATE");
        expect(event.mandate?.status).toBe(expected);
        expect(event.mandate?.providerMandateId).toBe(RZP.tokenId);
    });

    it("token.rejected keeps Razorpay's reason code", () => {
        const event = parse(
            delivery("token.rejected", { token: token("rejected") }),
        );
        expect(event.mandate?.failureReason).toBe("mandate_rejected");
    });

    it("a token event with no token is ignored", () => {
        expect(parse(delivery("token.confirmed", {})).outcome).toBe("IGNORED");
    });

    it("a token paused twice is two inbox keys when the header is missing", () => {
        const first = parse(
            delivery("token.paused", { token: token("paused") }, 100),
        );
        const again = parse(
            delivery("token.paused", { token: token("paused") }, 200),
        );
        expect(first.providerEventId).not.toBe(again.providerEventId);
        expect(first.providerEventId).toBe(`token.paused:${RZP.tokenId}:100`);
    });
});

describe("registration link events", () => {
    it("invoice.expired → FAILED, found by the link", () => {
        const event = parse(
            delivery("invoice.expired", {
                invoice: authLink({ status: "expired" }),
            }),
        );
        expect(event.outcome).toBe("MANDATE");
        expect(event.mandate).toEqual({
            status: "FAILED",
            setupReference: RZP.linkId,
            failureReason: "setup_expired",
        });
    });

    it("invoice.paid links the token to the set-up, and moves no money", () => {
        const event = parse(
            delivery("invoice.paid", {
                invoice: authLink({
                    status: "paid",
                    payment_id: RZP.authPaymentId,
                }),
                payment: authPayment(),
                order: { id: RZP.authOrderId, status: "paid" },
            }),
        );
        expect(event.outcome).toBe("IGNORED");
        expect(event.mandateLink).toEqual({
            providerMandateId: RZP.tokenId,
            providerCustomerId: RZP.customerId,
            setupReferences: [RZP.linkId, RZP.authOrderId],
        });
    });
});

describe("payments", () => {
    it("the authorisation's payment.captured links its token and still settles as a payment", () => {
        const event = parse(
            delivery("payment.captured", { payment: authPayment() }),
        );
        expect(event.outcome).toBe("SUCCEEDED");
        expect(event.providerIntentId).toBe(RZP.authOrderId);
        expect(event.mandateLink).toEqual({
            providerMandateId: RZP.tokenId,
            providerCustomerId: RZP.customerId,
            setupReferences: [RZP.linkId, RZP.authOrderId],
        });
    });

    it("a recurring charge's payment.captured settles its order's intent, with the fee", () => {
        const event = parse(
            delivery("payment.captured", {
                payment: chargePayment("captured"),
            }),
            "evt_c",
        );
        expect(event).toMatchObject({
            outcome: "SUCCEEDED",
            providerIntentId: RZP.chargeOrderId,
            providerPaymentRef: RZP.chargePaymentId,
            feeCents: 2832,
        });
    });

    it("a recurring charge's payment.failed fails its order's intent", () => {
        const event = parse(
            delivery("payment.failed", { payment: chargePayment("failed") }),
        );
        expect(event.outcome).toBe("FAILED");
        expect(event.providerIntentId).toBe(RZP.chargeOrderId);
    });

    it("a card or netbanking payment without a token links nothing", () => {
        const event = parse(
            delivery("payment.captured", {
                payment: authPayment({ token_id: null, method: "netbanking" }),
            }),
        );
        expect(event.mandateLink).toBeUndefined();
    });
});

describe("pre-debit notices", () => {
    it.each([
        ["order.notification.delivered", "delivered", "DELIVERED"],
        ["order.notification.failed", "failed", "FAILED"],
    ] as const)(
        "%s → PRE_DEBIT %s on the charge order",
        (eventType, status, expected) => {
            const event = parse(
                delivery(eventType, { notification: notice(status) }),
            );
            expect(event).toMatchObject({
                outcome: "PRE_DEBIT",
                providerIntentId: RZP.chargeOrderId,
                preDebitStatus: expected,
            });
            expect(event.providerEventId).toBe(
                `${eventType}:${RZP.notificationId}:1790000200`,
            );
        },
    );

    it("a notice without its order is ignored", () => {
        expect(
            parse(
                delivery("order.notification.delivered", { notification: {} }),
            ).outcome,
        ).toBe("IGNORED");
    });
});
