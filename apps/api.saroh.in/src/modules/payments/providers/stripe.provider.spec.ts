// Network-free: `fetch` is replaced per test, so what goes to Stripe and
// how each answer is read are both asserted without a live call. Every key
// here is made up.
import { GLOBAL_CURRENCIES } from "@saroh/edition";

import { ProviderKeysRefusedError } from "../../../common/providers/provider-attention";
import { publicKeyFor } from "../public-key";
import { RefundCallError } from "./provider.port";
import {
    STRIPE_API_VERSION,
    STRIPE_MINIMUM_CENTS,
    STRIPE_TWO_DECIMAL,
    stripeOrderPayments,
} from "./stripe-payments";
import { StripeProvider } from "./stripe.provider";

const CREDS = { keyId: "pk_test_madeup", keySecret: "rk_test_madeup" };
const REFUND = {
    reference: "cmrefund00000000000000001",
    providerIntentId: "pi_test_1",
    providerPaymentRef: "ch_test_1",
    amountCents: 2500,
    currency: "USD",
    credentials: CREDS,
};

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

function call(i = 0) {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return {
        url,
        init,
        headers: (init.headers ?? {}) as Record<string, string>,
        form: new URLSearchParams((init.body as string) ?? ""),
    };
}

async function outcome(p: Promise<unknown>) {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RefundCallError);
    return (err as RefundCallError).outcome;
}

describe("StripeProvider.verifyCredentials", () => {
    it("reads one PaymentIntent and one refund with the key, on the pinned version", async () => {
        fetchMock.mockImplementation(() => answer(200, { data: [] }));
        await expect(
            new StripeProvider().verifyCredentials(CREDS),
        ).resolves.toBe("ACCEPTED");
        const urls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
        expect(urls).toEqual([
            "https://api.stripe.com/v1/payment_intents?limit=1",
            "https://api.stripe.com/v1/refunds?limit=1",
        ]);
        expect(call().headers).toMatchObject({
            Authorization: "Bearer rk_test_madeup",
            "Stripe-Version": STRIPE_API_VERSION,
        });
    });

    it("401 rejects; 403 is a permission missing; 5xx and network are unsure", async () => {
        const p = new StripeProvider();
        fetchMock.mockImplementation(() => answer(401));
        await expect(p.verifyCredentials(CREDS)).resolves.toBe("REJECTED");
        fetchMock.mockImplementation((url: string) =>
            answer(url.includes("refunds") ? 403 : 200),
        );
        await expect(p.verifyCredentials(CREDS)).resolves.toBe(
            "PERMISSION_MISSING",
        );
        fetchMock.mockImplementation(() => answer(503));
        await expect(p.verifyCredentials(CREDS)).resolves.toBe("UNSURE");
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(p.verifyCredentials(CREDS)).resolves.toBe("UNSURE");
    });

    it("a full secret key is rejected without a call", async () => {
        await expect(
            new StripeProvider().verifyCredentials({
                ...CREDS,
                keySecret: "sk_live_madeup",
            }),
        ).resolves.toBe("REJECTED");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("connect refuses a full secret key before anything else", () => {
        expect(() =>
            publicKeyFor({
                provider: "STRIPE",
                keyId: "pk_test_madeup",
                keySecret: "sk_test_madeup",
            }),
        ).toThrow(/restricted key/);
        expect(
            publicKeyFor({
                provider: "STRIPE",
                keyId: "pk_test_madeup",
                keySecret: "rk_test_madeup",
                publicKey: "pk_test_madeup",
            }),
        ).toBe("pk_test_madeup");
    });
});

describe("StripeProvider.createOrderIntent", () => {
    it("form-encodes a cards-only PaymentIntent in lowercase currency with Saroh's reference", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "pi_test_1",
                client_secret: "pi_test_1_secret_madeup",
            }),
        );
        const result = await new StripeProvider().createOrderIntent({
            amountCents: 2000,
            currency: "USD",
            orderId: "cmorder1",
            credentials: CREDS,
        });
        const { url, init, headers, form } = call();
        expect(url).toBe("https://api.stripe.com/v1/payment_intents");
        expect(init.method).toBe("POST");
        expect(headers["Content-Type"]).toBe(
            "application/x-www-form-urlencoded",
        );
        expect([...form.entries()]).toEqual([
            ["amount", "2000"],
            ["currency", "usd"],
            ["allowed_payment_method_types[]", "card"],
            ["metadata[saroh_ref]", "cmorder1"],
        ]);
        expect(result).toEqual({
            providerIntentId: "pi_test_1",
            clientParams: {
                stripePaymentIntentId: "pi_test_1",
                clientSecret: "pi_test_1_secret_madeup",
            },
        });
    });

    it("a refused key is ProviderKeysRefusedError; errors carry only the status", async () => {
        fetchMock.mockReturnValue(
            answer(401, {
                error: { message: "Invalid API Key rk_test_madeup" },
            }),
        );
        const err = await new StripeProvider()
            .createOrderIntent({
                amountCents: 2000,
                currency: "USD",
                orderId: "o",
                credentials: CREDS,
            })
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ProviderKeysRefusedError);
        expect((err as Error).message).toBe(
            "Stripe order creation failed (HTTP 401)",
        );
    });

    it("a currency outside the two-decimal set is refused before a call", async () => {
        await expect(
            new StripeProvider().createOrderIntent({
                amountCents: 500,
                currency: "JPY",
                orderId: "o",
                credentials: CREDS,
            }),
        ).rejects.toThrow(/JPY/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("Stripe currencies", () => {
    it("every Global currency is a two-decimal one Stripe takes, with a minimum", () => {
        for (const currency of GLOBAL_CURRENCIES) {
            expect(STRIPE_TWO_DECIMAL.has(currency)).toBe(true);
            expect(STRIPE_MINIMUM_CENTS[currency]).toBeGreaterThan(0);
        }
    });
});

describe("StripeProvider.refund", () => {
    it("sends the reference as Idempotency-Key and metadata, against the intent", async () => {
        fetchMock.mockReturnValue(
            answer(200, { id: "re_1", status: "pending" }),
        );
        const result = await new StripeProvider().refund(REFUND);
        const { url, headers, form } = call();
        expect(url).toBe("https://api.stripe.com/v1/refunds");
        expect(headers["Idempotency-Key"]).toBe(REFUND.reference);
        expect([...form.entries()]).toEqual([
            ["payment_intent", "pi_test_1"],
            ["amount", "2500"],
            ["metadata[saroh_refund_id]", REFUND.reference],
        ]);
        expect(result).toEqual({
            providerRefundId: "re_1",
            status: "pending",
            failed: false,
        });
    });

    it.each(["failed", "canceled"])("a %s refund is failed", async (status) => {
        fetchMock.mockReturnValue(answer(200, { id: "re_1", status }));
        await expect(new StripeProvider().refund(REFUND)).resolves.toEqual({
            providerRefundId: "re_1",
            status,
            failed: true,
        });
    });

    it.each([409, 429, 500, 503])(
        "HTTP %i may have refunded: UNKNOWN",
        async (status) => {
            fetchMock.mockReturnValue(answer(status));
            expect(await outcome(new StripeProvider().refund(REFUND))).toBe(
                "UNKNOWN",
            );
        },
    );

    it("a reused key (400 idempotency_error) may have refunded: UNKNOWN", async () => {
        fetchMock.mockReturnValue(
            answer(400, { error: { type: "idempotency_error" } }),
        );
        expect(await outcome(new StripeProvider().refund(REFUND))).toBe(
            "UNKNOWN",
        );
    });

    it("a network error is UNKNOWN; any other 400 is REFUSED", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
        expect(await outcome(new StripeProvider().refund(REFUND))).toBe(
            "UNKNOWN",
        );
        fetchMock.mockReturnValue(
            answer(400, { error: { type: "invalid_request_error" } }),
        );
        expect(await outcome(new StripeProvider().refund(REFUND))).toBe(
            "REFUSED",
        );
    });

    it("a currency outside the set is REFUSED without a call", async () => {
        expect(
            await outcome(
                new StripeProvider().refund({ ...REFUND, currency: "KWD" }),
            ),
        ).toBe("REFUSED");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a full secret key is never sent", async () => {
        expect(
            await outcome(
                new StripeProvider().refund({
                    ...REFUND,
                    credentials: { ...CREDS, keySecret: "sk_test_madeup" },
                }),
            ),
        ).toBe("UNKNOWN");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("StripeProvider.findRefund", () => {
    it("matches on metadata, never on the amount", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                data: [
                    {
                        id: "re_other",
                        amount: 2500,
                        status: "succeeded",
                        metadata: {},
                    },
                    {
                        id: "re_mine",
                        amount: 2500,
                        status: "succeeded",
                        metadata: { saroh_refund_id: REFUND.reference },
                    },
                ],
            }),
        );
        await expect(new StripeProvider().findRefund(REFUND)).resolves.toEqual({
            providerRefundId: "re_mine",
            status: "succeeded",
            failed: false,
        });
        expect(call().url).toBe(
            "https://api.stripe.com/v1/refunds?payment_intent=pi_test_1&limit=100",
        );
    });

    it("none with the reference is null; an error is UNKNOWN", async () => {
        fetchMock.mockReturnValueOnce(
            answer(200, { data: [{ id: "re_x", amount: 2500, metadata: {} }] }),
        );
        await expect(
            new StripeProvider().findRefund(REFUND),
        ).resolves.toBeNull();
        fetchMock.mockReturnValue(answer(500));
        expect(await outcome(new StripeProvider().findRefund(REFUND))).toBe(
            "UNKNOWN",
        );
    });
});

describe("StripeProvider.findOrderPayments", () => {
    it("reads the intent and maps a succeeded one to CAPTURED by its charge", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "pi_test_1",
                status: "succeeded",
                amount_received: 2000,
                currency: "usd",
                latest_charge: "ch_test_1",
            }),
        );
        await expect(
            new StripeProvider().findOrderPayments({
                providerIntentId: "pi_test_1",
                merchantRef: null,
                credentials: CREDS,
            }),
        ).resolves.toEqual([
            {
                providerPaymentRef: "ch_test_1",
                status: "CAPTURED",
                amountCents: 2000,
                currency: "USD",
            },
        ]);
        expect(call().url).toBe(
            "https://api.stripe.com/v1/payment_intents/pi_test_1",
        );
    });

    it.each([
        ["requires_payment_method", null, []],
        ["requires_payment_method", "ch_d", ["FAILED"]],
        ["requires_action", "ch_a", ["PENDING"]],
        ["processing", "ch_p", ["PENDING"]],
        ["requires_capture", "ch_c", ["AUTHORIZED"]],
        ["canceled", null, ["FAILED"]],
        ["something_new", "ch_n", ["OTHER"]],
    ])("%s (charge %s) → %j", (status, charge, expected) => {
        expect(
            stripeOrderPayments({
                id: "pi_1",
                status,
                latest_charge: charge,
            }).map((p) => p.status),
        ).toEqual(expected);
    });

    it("an error throws with the status only", async () => {
        fetchMock.mockReturnValue(answer(404));
        await expect(
            new StripeProvider().findOrderPayments({
                providerIntentId: "pi_x",
                merchantRef: null,
                credentials: CREDS,
            }),
        ).rejects.toThrow("Stripe payment lookup failed (HTTP 404)");
    });
});

describe("StripeProvider.cancelIntent", () => {
    const input = { providerIntentId: "pi_test_1", credentials: CREDS };

    it("cancels as abandoned", async () => {
        fetchMock.mockReturnValue(answer(200, { id: "pi_test_1" }));
        await expect(new StripeProvider().cancelIntent(input)).resolves.toBe(
            true,
        );
        const { url, form } = call();
        expect(url).toBe(
            "https://api.stripe.com/v1/payment_intents/pi_test_1/cancel",
        );
        expect(form.get("cancellation_reason")).toBe("abandoned");
    });

    it("past cancelling is false; anything else throws", async () => {
        fetchMock.mockReturnValueOnce(
            answer(400, { error: { code: "payment_intent_unexpected_state" } }),
        );
        await expect(new StripeProvider().cancelIntent(input)).resolves.toBe(
            false,
        );
        fetchMock.mockReturnValue(answer(500));
        await expect(new StripeProvider().cancelIntent(input)).rejects.toThrow(
            "HTTP 500",
        );
    });
});
