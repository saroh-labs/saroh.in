import { FakeOtpTransport } from "./fake-otp-transport";
import { Msg91OtpTransport } from "./msg91.provider";
import { createOtpTransport } from "./otp-transport.factory";

// #1237: the MSG91 WhatsApp auth-template send. `fetch` is stubbed: no network.
const KEY = "test-auth-key-very-secret";
const config = {
    authKey: KEY,
    whatsappNumber: "919000000001",
    whatsappTemplate: "saroh_code",
    baseUrl: "https://msg91.test/",
};

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

describe("Msg91OtpTransport", () => {
    it("sends a well-formed authentication template and returns the id", async () => {
        const fetchFn = jest.fn().mockResolvedValue(
            reply(200, {
                hasError: false,
                status: "success",
                data: { message_uuid: "m-1" },
            }),
        );
        const t = new Msg91OtpTransport(config, fetchFn);

        await expect(
            t.sendWhatsappAuth({ toE164: "+919812345678", code: "482913" }),
        ).resolves.toEqual({
            outcome: "accepted",
            providerMessageId: "m-1",
        });

        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://msg91.test/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
        );
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({
            authkey: KEY,
            "Content-Type": "application/json",
        });
        expect(JSON.parse(init.body as string)).toEqual({
            integrated_number: "919000000001",
            content_type: "template",
            payload: {
                messaging_product: "whatsapp",
                type: "template",
                template: {
                    name: "saroh_code",
                    language: { code: "en", policy: "deterministic" },
                    to_and_components: [
                        {
                            to: ["919812345678"],
                            components: {
                                body_1: { type: "text", value: "482913" },
                                button_1: {
                                    subtype: "url",
                                    type: "text",
                                    value: "482913",
                                },
                            },
                        },
                    ],
                },
            },
        });
    });

    it("reads a not-on-WhatsApp refusal as ineligible", async () => {
        const fetchFn = jest.fn().mockResolvedValue(
            reply(400, {
                hasError: true,
                errors: "Number is not on WhatsApp",
            }),
        );
        const t = new Msg91OtpTransport(config, fetchFn);
        await expect(
            t.sendWhatsappAuth({ toE164: "+919812345678", code: "1" }),
        ).resolves.toEqual({
            outcome: "ineligible",
        });
    });

    it("sanitizes other failures and never carries the key or the code", async () => {
        const fetchFn = jest.fn().mockResolvedValue(
            reply(401, {
                hasError: true,
                errors: `bad authkey ${KEY} for 482913`,
            }),
        );
        const t = new Msg91OtpTransport(config, fetchFn);
        const result = await t.sendWhatsappAuth({
            toE164: "+919812345678",
            code: "482913",
        });
        expect(result).toEqual({ outcome: "rejected", reason: "unauthorized" });
        expect(JSON.stringify(result)).not.toContain(KEY);
    });

    it("treats a 200 with hasError as rejected", async () => {
        const fetchFn = jest
            .fn()
            .mockResolvedValue(
                reply(200, { hasError: true, errors: "template not found" }),
            );
        const t = new Msg91OtpTransport(config, fetchFn);
        await expect(
            t.sendWhatsappAuth({ toE164: "+91981", code: "1" }),
        ).resolves.toEqual({
            outcome: "rejected",
            reason: "provider_error",
        });
    });

    it("throws a secret-free error on a network failure", async () => {
        const fetchFn = jest
            .fn()
            .mockRejectedValue(new Error(`timeout with ${KEY}`));
        const t = new Msg91OtpTransport(config, fetchFn);
        const err = await t
            .sendWhatsappAuth({ toE164: "+91981", code: "482913" })
            .catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).not.toContain(KEY);
        expect((err as Error).message).not.toContain("482913");
    });

    it("fails naming the missing variable when unconfigured", async () => {
        const fetchFn = jest.fn();
        const t = new Msg91OtpTransport({}, fetchFn);
        await expect(
            t.sendWhatsappAuth({ toE164: "+91981", code: "1" }),
        ).rejects.toThrow("MSG91_AUTH_KEY");
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe("FakeOtpTransport", () => {
    it("records sends and plays ineligible and rejected numbers", async () => {
        const fake = new FakeOtpTransport();
        fake.markIneligible("+911");
        fake.reject("+912", "rate_limited");
        await expect(
            fake.sendWhatsappAuth({ toE164: "+910", code: "1" }),
        ).resolves.toEqual({
            outcome: "accepted",
            providerMessageId: "fake_whatsapp_1",
        });
        await expect(
            fake.sendWhatsappAuth({ toE164: "+911", code: "2" }),
        ).resolves.toEqual({ outcome: "ineligible" });
        await expect(
            fake.sendWhatsappAuth({ toE164: "+912", code: "3" }),
        ).resolves.toEqual({
            outcome: "rejected",
            reason: "rate_limited",
        });
        expect(fake.sends.map((s) => s.code)).toEqual(["1", "2", "3"]);
    });
});

describe("createOtpTransport", () => {
    const none = {
        MSG91_AUTH_KEY: undefined,
        MSG91_WHATSAPP_NUMBER: undefined,
        MSG91_WHATSAPP_TEMPLATE: undefined,
        MSG91_BASE_URL: undefined,
    };
    it("uses the fake only in a declared dev or test run without credentials", () => {
        expect(createOtpTransport(none, "test")).toBeInstanceOf(
            FakeOtpTransport,
        );
        expect(createOtpTransport(none, "production")).toBeInstanceOf(
            Msg91OtpTransport,
        );
        expect(createOtpTransport(none, undefined)).toBeInstanceOf(
            Msg91OtpTransport,
        );
        expect(
            createOtpTransport(
                {
                    ...none,
                    MSG91_AUTH_KEY: "k",
                    MSG91_WHATSAPP_NUMBER: "n",
                    MSG91_WHATSAPP_TEMPLATE: "t",
                },
                "development",
            ),
        ).toBeInstanceOf(Msg91OtpTransport);
    });
});
