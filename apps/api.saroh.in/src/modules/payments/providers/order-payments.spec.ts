// Network-free: `fetch` is replaced per test. Asking a provider which
// payments an order has (P1), and checking Razorpay's signed return.
import { createHmac } from "node:crypto";

import { CashfreeProvider } from "./cashfree.provider";
import {
    toOrderPayment,
    verifyRazorpaySignature,
} from "./razorpay-order-payments";
import { RazorpayProvider } from "./razorpay.provider";

const CREDS = { keyId: "rzp_key", keySecret: "rzp_secret" };

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
});

function answer(status: number, body: unknown = {}) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

describe("verifyRazorpaySignature (P1)", () => {
    const signed = (order: string, payment: string, secret = "rzp_secret") =>
        createHmac("sha256", secret)
            .update(`${order}|${payment}`)
            .digest("hex");
    const check = (signature: string, payment = "pay_1") =>
        verifyRazorpaySignature({
            providerIntentId: "order_1",
            providerPaymentRef: payment,
            signature,
            credentials: CREDS,
        });

    it("accepts the HMAC of order_id|payment_id by the key secret", () => {
        expect(check(signed("order_1", "pay_1"))).toBe(true);
        expect(check(signed("order_1", "pay_1").toUpperCase())).toBe(true);
    });

    it("refuses another secret, another payment, and junk", () => {
        expect(check(signed("order_1", "pay_1", "other"))).toBe(false);
        expect(check(signed("order_1", "pay_2"))).toBe(false);
        expect(check("zz")).toBe(false);
        expect(check("")).toBe(false);
    });
});

describe("RazorpayProvider.findOrderPayments (P1)", () => {
    it("reads the order's payments with the account's key", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                entity: "collection",
                count: 2,
                items: [
                    {
                        id: "pay_failed",
                        status: "failed",
                        amount: 50000,
                        currency: "INR",
                    },
                    {
                        id: "pay_ok",
                        status: "captured",
                        amount: 50000,
                        currency: "INR",
                        fee: 1180,
                    },
                ],
            }),
        );
        const out = await new RazorpayProvider().findOrderPayments({
            providerIntentId: "order_1",
            merchantRef: "inv_1",
            credentials: CREDS,
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.razorpay.com/v1/orders/order_1/payments");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            `Basic ${Buffer.from("rzp_key:rzp_secret").toString("base64")}`,
        );
        expect(out).toEqual([
            {
                providerPaymentRef: "pay_failed",
                status: "FAILED",
                amountCents: 50000,
                currency: "INR",
                feeCents: undefined,
            },
            {
                providerPaymentRef: "pay_ok",
                status: "CAPTURED",
                amountCents: 50000,
                currency: "INR",
                feeCents: 1180,
            },
        ]);
    });

    it("keeps only the HTTP status of a refusal, never the body or the key", async () => {
        fetchMock.mockReturnValue(
            answer(401, { error: { description: "rzp_secret is wrong" } }),
        );
        const err = (await new RazorpayProvider()
            .findOrderPayments({
                providerIntentId: "order_1",
                merchantRef: null,
                credentials: CREDS,
            })
            .catch((e: unknown) => e)) as Error;
        expect(err.message).toBe("Razorpay payment lookup failed (HTTP 401)");
        expect(err.message).not.toContain("rzp_secret");
    });

    it("says which recurring token an authorisation's payment made", () => {
        expect(
            toOrderPayment({
                id: "pay_auth",
                status: "captured",
                amount: 100,
                currency: "inr",
                method: "upi",
                token_id: "token_1",
                customer_id: "cust_1",
            }),
        ).toMatchObject({
            currency: "INR",
            recurring: {
                tokenId: "token_1",
                customerId: "cust_1",
                method: "upi",
            },
        });
        expect(toOrderPayment({ status: "captured" })).toBeNull();
        expect(
            toOrderPayment({ id: "pay_x", status: "refunded" }),
        ).toMatchObject({ status: "OTHER", amountCents: null });
    });
});

describe("CashfreeProvider.findOrderPayments (P1)", () => {
    it("looks the order up by Saroh's reference and reads rupees as paise", async () => {
        fetchMock.mockReturnValue(
            answer(200, [
                {
                    cf_payment_id: 91234,
                    payment_status: "SUCCESS",
                    payment_amount: 400.5,
                    payment_currency: "INR",
                },
                {
                    cf_payment_id: "91233",
                    payment_status: "USER_DROPPED",
                    payment_amount: "400.50",
                    payment_currency: "INR",
                },
            ]),
        );
        const out = await new CashfreeProvider().findOrderPayments({
            providerIntentId: "2149460581",
            merchantRef: "inv_1",
            credentials: CREDS,
        });
        expect(fetchMock.mock.calls[0][0]).toBe(
            "https://api.cashfree.com/pg/orders/inv_1/payments",
        );
        expect(out).toEqual([
            {
                providerPaymentRef: "91234",
                status: "CAPTURED",
                amountCents: 40050,
                currency: "INR",
            },
            {
                providerPaymentRef: "91233",
                status: "FAILED",
                amountCents: 40050,
                currency: "INR",
            },
        ]);
    });

    it("has nothing to ask without a merchant reference, and 404 is no payment", async () => {
        await expect(
            new CashfreeProvider().findOrderPayments({
                providerIntentId: "1",
                merchantRef: null,
                credentials: CREDS,
            }),
        ).resolves.toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockReturnValue(answer(404, { message: "not found" }));
        await expect(
            new CashfreeProvider().findOrderPayments({
                providerIntentId: "1",
                merchantRef: "inv_2",
                credentials: CREDS,
            }),
        ).resolves.toEqual([]);
    });

    it("a server error is an error, not an empty answer", async () => {
        fetchMock.mockReturnValue(answer(503));
        await expect(
            new CashfreeProvider().findOrderPayments({
                providerIntentId: "1",
                merchantRef: "inv_3",
                credentials: CREDS,
            }),
        ).rejects.toThrow("Cashfree payment lookup failed (HTTP 503)");
    });
});
