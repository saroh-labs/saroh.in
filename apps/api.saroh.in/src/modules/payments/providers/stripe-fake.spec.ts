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

    it("makes an intent whose client secret names it, and finds no payment", async () => {
        const made = await fake.createOrderIntent({
            amountCents: 2500,
            currency: "USD",
            orderId: "inv_1",
            credentials,
        });
        expect(made.providerIntentId).toMatch(/^pi_fake_[0-9a-f]{32}$/);
        expect(made.clientParams).toEqual({
            stripePaymentIntentId: made.providerIntentId,
            clientSecret: `${made.providerIntentId}_secret_fake`,
        });
        await expect(fake.findOrderPayments()).resolves.toEqual([]);
        await expect(
            fake.createOrderIntent({
                amountCents: 500,
                currency: "JPY",
                orderId: "inv_2",
                credentials,
            }),
        ).rejects.toThrow("JPY");
    });
});
