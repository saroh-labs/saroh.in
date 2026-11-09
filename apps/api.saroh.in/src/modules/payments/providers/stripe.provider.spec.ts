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
    it("reads one PaymentIntent, refund, session and customer with the key, on the pinned version", async () => {
        fetchMock.mockImplementation(() => answer(200, { data: [] }));
        await expect(
            new StripeProvider().verifyCredentials(CREDS),
        ).resolves.toBe("ACCEPTED");
        const urls = fetchMock.mock.calls.map((c) => c[0] as string).sort();
        expect(urls).toEqual([
            "https://api.stripe.com/v1/checkout/sessions?limit=1",
            "https://api.stripe.com/v1/customers?limit=1",
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
                webhookSecret: "whsec_madeup",
            }),
        ).toBe("pk_test_madeup");
    });
});

const SESSION = {
    id: "cs_test_1",
    url: "https://checkout.stripe.com/c/pay/cs_test_1",
    status: "open",
};
const HOLD = {
    amountCents: 2000,
    currency: "USD",
    orderId: "cminvoice1",
    credentials: CREDS,
    description: "Rye & Co. booking",
    hosted: {
        successUrl:
            "https://studio.example.com/paid?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://studio.example.com/paid?cancelled=1",
        expiresAt: new Date("2026-11-08T10:31:00Z"),
        instantOnly: true,
        submitType: "book" as const,
        lineName: "Haircut, 9 Nov 10:00",
        clientReference: "cmintent1",
        customerId: "cus_test_1",
        payerEmail: "asha@example.com",
        billingAddressRequired: true,
    },
};
const ORDER = {
    ...HOLD,
    orderId: "cmorder1",
    hosted: {
        ...HOLD.hosted,
        expiresAt: undefined,
        instantOnly: false,
        submitType: "pay" as const,
        lineName: "Order 1042",
        customerId: null,
        billingAddressRequired: false,
    },
};

describe("StripeProvider.createOrderIntent (hosted Checkout)", () => {
    it("a booking hold sends every session field and hands back only the URL and id", async () => {
        fetchMock.mockReturnValue(answer(200, SESSION));
        const result = await new StripeProvider().createOrderIntent(HOLD);
        const { url, init, headers, form } = call();
        expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
        expect(init.method).toBe("POST");
        expect(headers["Content-Type"]).toBe(
            "application/x-www-form-urlencoded",
        );
        expect(Object.fromEntries(form.entries())).toEqual({
            mode: "payment",
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": "2000",
            "line_items[0][price_data][product_data][name]":
                "Haircut, 9 Nov 10:00",
            client_reference_id: "cmintent1",
            "metadata[saroh_ref]": "cminvoice1",
            "metadata[saroh_intent]": "cmintent1",
            "payment_intent_data[metadata][saroh_ref]": "cminvoice1",
            "payment_intent_data[metadata][saroh_intent]": "cmintent1",
            "payment_intent_data[description]": "Rye & Co. booking",
            success_url:
                "https://studio.example.com/paid?session_id={CHECKOUT_SESSION_ID}",
            cancel_url: "https://studio.example.com/paid?cancelled=1",
            submit_type: "book",
            expires_at: String(Date.parse("2026-11-08T10:31:00Z") / 1000),
            billing_address_collection: "required",
            "allowed_payment_method_types[0]": "card",
            "allowed_payment_method_types[1]": "link",
            customer: "cus_test_1",
        });
        expect(form.has("payment_method_types[]")).toBe(false);
        expect(result).toEqual({
            providerIntentId: "cs_test_1",
            providerCheckoutId: "cs_test_1",
            clientParams: {
                checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_1",
                checkoutSessionId: "cs_test_1",
            },
        });
        expect(JSON.stringify(result)).not.toMatch(/secret/i);
    });

    it("an order is `pay`, with no method restriction, expiry or address requirement, and the email prefilled", async () => {
        fetchMock.mockReturnValue(answer(200, SESSION));
        await new StripeProvider().createOrderIntent(ORDER);
        const { form } = call();
        expect(form.get("submit_type")).toBe("pay");
        expect(form.get("customer_email")).toBe("asha@example.com");
        for (const key of [
            "expires_at",
            "billing_address_collection",
            "allowed_payment_method_types[0]",
            "customer",
        ]) {
            expect(form.has(key)).toBe(false);
        }
    });

    it("goods from an Indian account ask for the shipping address in the delivery country", async () => {
        fetchMock.mockReturnValue(answer(200, SESSION));
        await new StripeProvider().createOrderIntent({
            ...ORDER,
            hosted: { ...ORDER.hosted, shippingCountries: ["US"] },
        });
        expect(
            call().form.get(
                "shipping_address_collection[allowed_countries][0]",
            ),
        ).toBe("US");
    });

    it("no customer and no email sends neither", async () => {
        fetchMock.mockReturnValue(answer(200, SESSION));
        await new StripeProvider().createOrderIntent({
            ...ORDER,
            hosted: { ...ORDER.hosted, payerEmail: null },
        });
        expect(call().form.has("customer")).toBe(false);
        expect(call().form.has("customer_email")).toBe(false);
    });

    it("a refused key is ProviderKeysRefusedError; errors carry only the status", async () => {
        fetchMock.mockReturnValue(
            answer(403, {
                error: {
                    message: "rk_test_madeup lacks checkout_session_write",
                },
            }),
        );
        const err = await new StripeProvider()
            .createOrderIntent(HOLD)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ProviderKeysRefusedError);
        expect((err as Error).message).toBe(
            "Stripe order creation failed (HTTP 403)",
        );
    });

    it("an answer without a session id or URL is an error", async () => {
        fetchMock.mockReturnValue(answer(200, { id: "cs_test_1", url: null }));
        await expect(
            new StripeProvider().createOrderIntent(HOLD),
        ).rejects.toThrow("missing session id or URL");
    });

    it("a currency outside the two-decimal set, or no hosted details, is refused before a call", async () => {
        await expect(
            new StripeProvider().createOrderIntent({
                ...HOLD,
                amountCents: 500,
                currency: "JPY",
            }),
        ).rejects.toThrow(/JPY/);
        await expect(
            new StripeProvider().createOrderIntent({
                ...HOLD,
                hosted: undefined,
            }),
        ).rejects.toThrow(/hosted/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("StripeProvider.findOrCreateCustomer", () => {
    const input = {
        email: " Asha@Example.com ",
        name: "Asha Rao",
        organizationId: "cmorg1",
        contactRef: "cmcontact1",
        credentials: CREDS,
    };

    it("lists by the lower-cased email and returns the one found, making none", async () => {
        fetchMock.mockReturnValue(answer(200, { data: [{ id: "cus_1" }] }));
        await expect(
            new StripeProvider().findOrCreateCustomer(input),
        ).resolves.toEqual({ customerId: "cus_1" });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(call().url).toBe(
            "https://api.stripe.com/v1/customers?email=asha%40example.com&limit=1",
        );
    });

    it("none found makes one under a stable idempotency key", async () => {
        const make = async () => {
            fetchMock.mockReset();
            fetchMock
                .mockReturnValueOnce(answer(200, { data: [] }))
                .mockReturnValueOnce(answer(200, { id: "cus_new" }));
            await expect(
                new StripeProvider().findOrCreateCustomer(input),
            ).resolves.toEqual({ customerId: "cus_new" });
            return call(1);
        };
        const first = await make();
        expect(first.url).toBe("https://api.stripe.com/v1/customers");
        expect(Object.fromEntries(first.form.entries())).toEqual({
            email: "asha@example.com",
            name: "Asha Rao",
            "metadata[saroh_contact]": "cmcontact1",
        });
        const key = first.headers["Idempotency-Key"];
        expect(key).toMatch(/^saroh-customer-[0-9a-f]{64}$/);
        expect(key).not.toContain("asha");
        expect((await make()).headers["Idempotency-Key"]).toBe(key);
    });

    it("no email: no call", async () => {
        await expect(
            new StripeProvider().findOrCreateCustomer({ ...input, email: " " }),
        ).resolves.toEqual({ customerId: null });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a 403 is null with the permission missing; a 500 or network error is null", async () => {
        const p = new StripeProvider();
        fetchMock.mockReturnValue(answer(403));
        await expect(p.findOrCreateCustomer(input)).resolves.toEqual({
            customerId: null,
            permissionMissing: true,
        });
        fetchMock.mockReset();
        fetchMock
            .mockReturnValueOnce(answer(200, { data: [] }))
            .mockReturnValueOnce(answer(500));
        await expect(p.findOrCreateCustomer(input)).resolves.toEqual({
            customerId: null,
        });
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(p.findOrCreateCustomer(input)).resolves.toEqual({
            customerId: null,
        });
    });
});

describe("StripeProvider.accountCountry", () => {
    it("reads the account's country in upper case", async () => {
        fetchMock.mockReturnValue(answer(200, { country: "in" }));
        await expect(new StripeProvider().accountCountry(CREDS)).resolves.toBe(
            "IN",
        );
        expect(call().url).toBe("https://api.stripe.com/v1/account");
    });

    it.each([403, 500])("HTTP %i is null", async (status) => {
        fetchMock.mockReturnValue(answer(status));
        await expect(
            new StripeProvider().accountCountry(CREDS),
        ).resolves.toBeNull();
    });

    it("a network error or an odd country is null", async () => {
        fetchMock.mockReturnValueOnce(answer(200, { country: "India" }));
        await expect(
            new StripeProvider().accountCountry(CREDS),
        ).resolves.toBeNull();
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(
            new StripeProvider().accountCountry(CREDS),
        ).resolves.toBeNull();
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

    const lookUp = (id: string) =>
        new StripeProvider().findOrderPayments({
            providerIntentId: id,
            merchantRef: "cminvoice1",
            credentials: CREDS,
        });

    it("a session is read with its PaymentIntent expanded; paid is CAPTURED on the pi_", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "cs_test_1",
                status: "complete",
                payment_status: "paid",
                payment_intent: {
                    id: "pi_test_9",
                    status: "succeeded",
                    amount_received: 2000,
                    currency: "usd",
                    latest_charge: "ch_test_9",
                },
            }),
        );
        await expect(lookUp("cs_test_1")).resolves.toEqual([
            {
                providerPaymentRef: "ch_test_9",
                status: "CAPTURED",
                amountCents: 2000,
                currency: "USD",
                providerIntentId: "pi_test_9",
            },
        ]);
        expect(call().url).toBe(
            "https://api.stripe.com/v1/checkout/sessions/cs_test_1?expand[]=payment_intent",
        );
    });

    it("a complete but unpaid session (a slow method) is PENDING", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "cs_test_1",
                status: "complete",
                payment_status: "unpaid",
                payment_intent: {
                    id: "pi_test_9",
                    status: "processing",
                    latest_charge: "py_test_9",
                },
            }),
        );
        const [payment] = await lookUp("cs_test_1");
        expect(payment).toMatchObject({
            status: "PENDING",
            providerIntentId: "pi_test_9",
        });
    });

    it.each([
        ["open", null],
        ["expired", null],
    ])("a %s session is no payment", async (status, pi) => {
        fetchMock.mockReturnValue(
            answer(200, { id: "cs_test_1", status, payment_intent: pi }),
        );
        await expect(lookUp("cs_test_1")).resolves.toEqual([]);
    });

    it("a complete session whose PaymentIntent didn't come back expanded can't be read", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "cs_test_1",
                status: "complete",
                payment_intent: "pi_test_9",
            }),
        );
        await expect(lookUp("cs_test_1")).rejects.toThrow("not expanded");
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
    const session = { providerIntentId: "cs_test_1", credentials: CREDS };

    it("an open session is expired", async () => {
        fetchMock.mockReturnValue(answer(200, { id: "cs_test_1" }));
        await expect(new StripeProvider().cancelIntent(session)).resolves.toBe(
            true,
        );
        expect(call().url).toBe(
            "https://api.stripe.com/v1/checkout/sessions/cs_test_1/expire",
        );
        expect(call().init.method).toBe("POST");
    });

    it("a session already expired or complete (400) is false; 500 throws", async () => {
        fetchMock.mockReturnValueOnce(
            answer(400, { error: { type: "invalid_request_error" } }),
        );
        await expect(new StripeProvider().cancelIntent(session)).resolves.toBe(
            false,
        );
        fetchMock.mockReturnValue(answer(500));
        await expect(
            new StripeProvider().cancelIntent(session),
        ).rejects.toThrow("HTTP 500");
    });

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

describe("StripeProvider.createElementIntent (Saroh's card window)", () => {
    it("form-encodes a cards-only PaymentIntent with Saroh's reference and returns its client secret", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                id: "pi_test_9",
                client_secret: "pi_test_9_secret_madeup",
            }),
        );
        const result = await new StripeProvider().createElementIntent({
            amountCents: 2000,
            currency: "USD",
            orderId: "cmorder9",
            credentials: CREDS,
            description: "Walk Test Co order",
            intentId: "intent-9",
            customerId: "cus_test_9",
            receiptEmail: "payer@example.com",
        });
        const { url, form } = call();
        expect(url).toBe("https://api.stripe.com/v1/payment_intents");
        expect([...form.entries()]).toEqual([
            ["amount", "2000"],
            ["currency", "usd"],
            ["allowed_payment_method_types[]", "card"],
            ["metadata[saroh_ref]", "cmorder9"],
            ["metadata[saroh_intent]", "intent-9"],
            ["description", "Walk Test Co order"],
            ["customer", "cus_test_9"],
            ["receipt_email", "payer@example.com"],
        ]);
        expect(result.clientParams).toEqual({
            stripePaymentIntentId: "pi_test_9",
            clientSecret: "pi_test_9_secret_madeup",
        });
    });
});
