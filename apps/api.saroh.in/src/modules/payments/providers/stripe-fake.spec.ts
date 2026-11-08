// U8: the test-only STRIPE_FAKE switch, which lets the browser-test stack
// connect Stripe and make intents without calling Stripe. Honoured only in
// a test run, never under a declared production.
import { FakeStripeProvider, stripeFakeAllowed } from "./stripe-fake";

describe("STRIPE_FAKE: only in a test run", () => {
    it("is on for `1` under Jest or on the CI browser stack", () => {
        expect(stripeFakeAllowed("1", { nodeEnvs: ["test", "test"] })).toBe(
            true,
        );
        expect(
            stripeFakeAllowed("1", {
                nodeEnvs: [undefined, "development"],
                ci: "1",
            }),
        ).toBe(true);
    });

    it("is off unset, outside a test run, and under production", () => {
        expect(
            stripeFakeAllowed(undefined, { nodeEnvs: ["test", "test"] }),
        ).toBe(false);
        expect(
            stripeFakeAllowed("1", {
                nodeEnvs: ["development", "development"],
            }),
        ).toBe(false);
        expect(
            stripeFakeAllowed("1", {
                nodeEnvs: ["production", "production"],
                ci: "true",
            }),
        ).toBe(false);
    });
});

describe("FakeStripeProvider", () => {
    const fake = new FakeStripeProvider();
    const credentials = {
        keyId: "pk_test_example",
        keySecret: "rk_test_example",
    };

    it("accepts a restricted key and still refuses a full secret key", async () => {
        await expect(fake.verifyCredentials(credentials)).resolves.toBe(
            "ACCEPTED",
        );
        await expect(
            fake.verifyCredentials({
                ...credentials,
                keySecret: "sk_test_example",
            }),
        ).resolves.toBe("REJECTED");
    });

    const hosted = {
        successUrl:
            "https://studio.example.com/paid?session_id={CHECKOUT_SESSION_ID}",
        cancelUrl: "https://studio.example.com/paid?cancelled=1",
        instantOnly: true,
        submitType: "book" as const,
        lineName: "Haircut",
        clientReference: "cmintent1",
        billingAddressRequired: false,
    };

    it("makes a session on checkout.stripe.com that carries the return URLs, and finds no payment", async () => {
        const made = await fake.createOrderIntent({
            amountCents: 2500,
            currency: "USD",
            orderId: "inv_1",
            credentials,
            hosted,
        });
        expect(made.providerIntentId).toMatch(/^cs_fake_[0-9a-f]{32}$/);
        expect(made.providerCheckoutId).toBe(made.providerIntentId);
        const url = new URL(made.clientParams.checkoutUrl as string);
        expect(url.origin).toBe("https://checkout.stripe.com");
        expect(url.pathname).toBe(`/c/pay/${made.providerIntentId}`);
        expect(url.searchParams.get("success_url")).toBe(hosted.successUrl);
        expect(url.searchParams.get("cancel_url")).toBe(hosted.cancelUrl);
        expect(made.clientParams.checkoutSessionId).toBe(made.providerIntentId);
        await expect(fake.findOrderPayments()).resolves.toEqual([]);
        await expect(fake.cancelIntent()).resolves.toBe(true);
        await expect(
            fake.createOrderIntent({
                amountCents: 500,
                currency: "JPY",
                orderId: "inv_2",
                credentials,
                hosted,
            }),
        ).rejects.toThrow("JPY");
    });

    it("a payer with an email is a fake customer; without one, none", async () => {
        const input = { organizationId: "cmorg1", credentials };
        await expect(
            fake.findOrCreateCustomer({ ...input, email: "Asha@example.com" }),
        ).resolves.toEqual({ customerId: expect.stringMatching(/^cus_fake_/) });
        await expect(
            fake.findOrCreateCustomer({ ...input, email: null }),
        ).resolves.toEqual({ customerId: null });
    });

    it("the country is US, or IN for a publishable key with _in_", async () => {
        await expect(fake.accountCountry(credentials)).resolves.toBe("US");
        await expect(
            fake.accountCountry({ ...credentials, keyId: "pk_test_in_x" }),
        ).resolves.toBe("IN");
    });
});
