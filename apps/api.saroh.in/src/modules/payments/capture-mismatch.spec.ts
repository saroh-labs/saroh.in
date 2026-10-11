// PAY-06 (#106): what a provider says it captured, read in paise, and the
// comparison with what Saroh asked for. No env, no Prisma, no network.
import { CashfreeWebhookProvider } from "../webhooks/providers/cashfree.webhook";
import { RazorpayWebhookProvider } from "../webhooks/providers/razorpay.webhook";
import { captureDiffers, describeMismatch } from "./capture-mismatch";

const ASKED = { amountCents: 40_050, currency: "INR" };

describe("captureDiffers", () => {
    it("matches only the exact amount, in either case of currency", () => {
        const loose = { strict: false };
        expect(
            captureDiffers(
                ASKED,
                { amountCents: 40_050, currency: "inr" },
                loose,
            ),
        ).toBe(false);
        // A partial capture and an over-capture both differ.
        expect(
            captureDiffers(
                ASKED,
                { amountCents: 40_000, currency: "INR" },
                loose,
            ),
        ).toBe(true);
        expect(
            captureDiffers(
                ASKED,
                { amountCents: 40_051, currency: "INR" },
                loose,
            ),
        ).toBe(true);
        expect(
            captureDiffers(
                ASKED,
                { amountCents: 40_050, currency: "USD" },
                loose,
            ),
        ).toBe(true);
    });

    it("a capture with no amount differs only when strict (a look-up)", () => {
        expect(captureDiffers(ASKED, {}, { strict: false })).toBe(false);
        expect(captureDiffers(ASKED, {}, { strict: true })).toBe(true);
        expect(
            captureDiffers(ASKED, { amountCents: null }, { strict: true }),
        ).toBe(true);
        expect(
            captureDiffers(ASKED, { amountCents: 40_050 }, { strict: true }),
        ).toBe(true);
        expect(
            captureDiffers(ASKED, { amountCents: 40_050 }, { strict: false }),
        ).toBe(false);
    });

    it("says both figures in minor units", () => {
        expect(
            describeMismatch(ASKED, { amountCents: 400, currency: "INR" }),
        ).toBe("captured 400 INR, asked 40050 INR (minor units)");
    });
});

describe("the captured amount, as each webhook reports it", () => {
    it("Razorpay: the payment's amount, already in paise", () => {
        const event = new RazorpayWebhookProvider().parseEvent({
            payload: {
                event: "payment.captured",
                payload: {
                    payment: {
                        entity: {
                            id: "pay_1",
                            order_id: "order_1",
                            amount: 40_050,
                            currency: "INR",
                        },
                    },
                },
            },
            headers: {},
        });
        expect(event).toMatchObject({
            outcome: "SUCCEEDED",
            capturedAmountCents: 40_050,
            capturedCurrency: "INR",
        });
    });

    it("Razorpay: an amount that isn't a whole number of paise is not read", () => {
        const event = new RazorpayWebhookProvider().parseEvent({
            payload: {
                event: "order.paid",
                payload: {
                    payment: { entity: { id: "pay_1", amount: 400.5 } },
                },
            },
            headers: {},
        });
        expect(event.capturedAmountCents).toBeUndefined();
    });

    it("Cashfree: rupees, as a number or decimal text, become paise", () => {
        const cf = new CashfreeWebhookProvider();
        for (const amount of [400.5, "400.50", "400.5"]) {
            const event = cf.parseEvent({
                payload: {
                    type: "PAYMENT_SUCCESS_WEBHOOK",
                    data: {
                        order: { order_id: "ord_1", order_currency: "INR" },
                        payment: { cf_payment_id: 9, payment_amount: amount },
                    },
                },
                headers: {},
            });
            expect(event).toMatchObject({
                outcome: "SUCCEEDED",
                capturedAmountCents: 40_050,
                capturedCurrency: "INR",
            });
        }
    });
});
