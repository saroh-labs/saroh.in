// UX-012: each adapter checks a business's keys on connect with one cheap
// authenticated read, and reads a 401/403 on a live call as refused keys.
// Network-free: `fetch` is replaced per test.
import { EmailCommsProvider } from "../../modules/communications/providers/email.provider";
import { CashfreeProvider } from "../../modules/payments/providers/cashfree.provider";
import { RazorpayProvider } from "../../modules/payments/providers/razorpay.provider";
import {
    attentionOf,
    isKeysRefused,
    KEYS_REFUSED,
    ProviderKeysRefusedError,
} from "./provider-attention";

const fetchMock = jest.fn();
const realFetch = global.fetch;
beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
});
afterAll(() => {
    global.fetch = realFetch;
});

function answer(status: number, body: unknown = {}) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    );
}

const RZP = { keyId: "rzp_test_Fake123", keySecret: "not-a-real-secret" };
const ORDER = {
    amountCents: 25000,
    currency: "INR",
    orderId: "order_1",
    credentials: RZP,
};

describe("Razorpay key check", () => {
    it("reads one payment with the key pair, and accepts a 200", async () => {
        fetchMock.mockReturnValue(answer(200, { items: [] }));

        await expect(
            new RazorpayProvider().verifyCredentials(RZP),
        ).resolves.toBe("ACCEPTED");

        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.razorpay.com/v1/payments?count=1");
        expect(init.method ?? "GET").toBe("GET");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            `Basic ${Buffer.from(`${RZP.keyId}:${RZP.keySecret}`).toString("base64")}`,
        );
        // The secret rides in the header only, never the address.
        expect(url).not.toContain(RZP.keySecret);
    });

    it.each([401, 403])("rejects keys Razorpay answers %i to", async (s) => {
        fetchMock.mockReturnValue(answer(s, { error: { code: "BAD" } }));
        await expect(
            new RazorpayProvider().verifyCredentials(RZP),
        ).resolves.toBe("REJECTED");
    });

    it.each([429, 500, 503])("is unsure on a %i", async (s) => {
        fetchMock.mockReturnValue(answer(s));
        await expect(
            new RazorpayProvider().verifyCredentials(RZP),
        ).resolves.toBe("UNSURE");
    });

    it("is unsure when Razorpay can't be reached", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await expect(
            new RazorpayProvider().verifyCredentials(RZP),
        ).resolves.toBe("UNSURE");
    });

    it("throws refused keys on a 401 at checkout, carrying only the status", async () => {
        fetchMock.mockReturnValue(answer(401, { error: { description: "x" } }));
        const err = await new RazorpayProvider()
            .createOrderIntent(ORDER)
            .catch((e: unknown) => e);
        expect(isKeysRefused(err)).toBe(true);
        expect((err as ProviderKeysRefusedError).httpStatus).toBe(401);
        expect((err as Error).message).toBe(
            "Razorpay order creation failed (HTTP 401)",
        );
        expect((err as Error).message).not.toContain(RZP.keySecret);
    });

    it("keeps a 500 at checkout a plain failure, not refused keys", async () => {
        fetchMock.mockReturnValue(answer(500));
        const err = await new RazorpayProvider()
            .createOrderIntent(ORDER)
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(Error);
        expect(isKeysRefused(err)).toBe(false);
    });
});

describe("Cashfree key check", () => {
    const CF = { keyId: "cf_app_fake", keySecret: "cf_not_real" };

    it("looks up an order that doesn't exist: a 404 means the keys work", async () => {
        fetchMock.mockReturnValue(answer(404, { code: "order_not_found" }));
        await expect(
            new CashfreeProvider().verifyCredentials(CF),
        ).resolves.toBe("ACCEPTED");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toMatch(/\/orders\/saroh-key-check$/);
        expect(
            (init.headers as Record<string, string>)["x-client-secret"],
        ).toBe(CF.keySecret);
    });

    it("rejects keys Cashfree answers 401 to", async () => {
        fetchMock.mockReturnValue(answer(401));
        await expect(
            new CashfreeProvider().verifyCredentials(CF),
        ).resolves.toBe("REJECTED");
    });

    it("throws refused keys on a 401 at checkout", async () => {
        fetchMock.mockReturnValue(answer(401));
        const err = await new CashfreeProvider()
            .createOrderIntent({ ...ORDER, credentials: CF })
            .catch((e: unknown) => e);
        expect(isKeysRefused(err)).toBe(true);
    });
});

describe("Resend key check", () => {
    const email = new EmailCommsProvider();
    const KEY = { apiKey: "re_fake_key" };

    it("accepts a key whose account has the sending domain verified", async () => {
        fetchMock.mockReturnValue(
            answer(200, {
                data: [
                    { name: "other.in", status: "verified" },
                    { name: "bakery.in", status: "verified" },
                ],
            }),
        );
        await expect(
            email.verifyCredentials({
                provider: "RESEND",
                credentials: KEY,
                fromAddress: "Hello <hello@Bakery.in>",
            }),
        ).resolves.toBe("ACCEPTED");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.resend.com/domains");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer re_fake_key",
        );
    });

    it("says when the sending domain isn't verified there", async () => {
        fetchMock.mockReturnValue(
            answer(200, { data: [{ name: "bakery.in", status: "pending" }] }),
        );
        await expect(
            email.verifyCredentials({
                provider: "RESEND",
                credentials: KEY,
                fromAddress: "hello@bakery.in",
            }),
        ).resolves.toBe("DOMAIN_UNVERIFIED");
    });

    it("accepts a sending-only key, which Resend proves by refusing the read as restricted", async () => {
        fetchMock.mockReturnValue(
            answer(401, { name: "restricted_api_key", statusCode: 401 }),
        );
        await expect(
            email.verifyCredentials({
                provider: "RESEND",
                credentials: KEY,
                fromAddress: "hello@bakery.in",
            }),
        ).resolves.toBe("ACCEPTED");
    });

    it.each([
        [403, { name: "invalid_api_key" }],
        [401, { name: "missing_api_key" }],
    ])("rejects a key Resend answers %i to", async (status, body) => {
        fetchMock.mockReturnValue(answer(status, body));
        await expect(
            email.verifyCredentials({ provider: "RESEND", credentials: KEY }),
        ).resolves.toBe("REJECTED");
    });

    it("doesn't check a relay: SMTP, SendGrid, or Resend pointed elsewhere", async () => {
        for (const input of [
            { provider: "SMTP", credentials: { host: "smtp.example.in" } },
            { provider: "SENDGRID", credentials: KEY },
            {
                provider: "RESEND",
                credentials: { ...KEY, baseUrl: "https://relay.example.in" },
            },
        ]) {
            await expect(email.verifyCredentials(input)).resolves.toBeNull();
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws refused keys when a send is answered 403", async () => {
        fetchMock.mockReturnValue(answer(403));
        const err = await email
            .send({ to: "a@b.in", body: "<p>hi</p>", credentials: KEY })
            .catch((e: unknown) => e);
        expect(isKeysRefused(err)).toBe(true);
        expect((err as Error).message).not.toContain("re_fake_key");
    });
});

describe("attentionOf", () => {
    it("is null while a connection works, and says why and since when otherwise", () => {
        const since = new Date("2026-10-07T10:00:00Z");
        expect(attentionOf({ attentionReason: null, attentionAt: null })).toBe(
            null,
        );
        expect(
            attentionOf({ attentionReason: KEYS_REFUSED, attentionAt: since }),
        ).toEqual({ reason: "KEYS_REFUSED", since });
    });
});
