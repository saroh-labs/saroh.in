import { FakeMessagingProvider } from "./fake-messaging-provider";
import {
    createMessagingProvider,
    parseTemplateList,
} from "./messaging-provider.factory";
import { readableNumber } from "./messaging-provider.port";
import { Msg91Provider } from "./msg91.provider";

// #1237: the MSG91 WhatsApp auth-template send. `fetch` is stubbed: no network.
const KEY = "test-auth-key-very-secret";
const config = {
    authKey: KEY,
    whatsappNumber: "919000000001",
    whatsappTemplate: "saroh_code",
    baseUrl: "https://msg91.test/",
};

const auth = (toE164: string, code: string) => ({
    toE164,
    code,
    appName: "Saroh",
    minutes: 10,
    callNumber: "+91 90000 00002",
});

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

describe("Msg91Provider", () => {
    it("sends a well-formed authentication template and returns the id", async () => {
        const fetchFn = jest.fn().mockResolvedValue(
            reply(200, {
                hasError: false,
                status: "success",
                data: { message_uuid: "m-1" },
            }),
        );
        const t = new Msg91Provider(config, fetchFn);

        await expect(
            t.sendWhatsappAuth(auth("+919812345678", "482913")),
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
                    language: { code: "en_US", policy: "deterministic" },
                    to_and_components: [
                        {
                            to: ["919812345678"],
                            components: {
                                body_1: { type: "text", value: "482913" },
                                body_2: { type: "text", value: "Saroh" },
                                body_3: { type: "text", value: "10 minutes" },
                                body_4: {
                                    type: "text",
                                    value: "+91 90000 00002",
                                },
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
        const t = new Msg91Provider(config, fetchFn);
        await expect(
            t.sendWhatsappAuth(auth("+919812345678", "1")),
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
        const t = new Msg91Provider(config, fetchFn);
        const result = await t.sendWhatsappAuth(
            auth("+919812345678", "482913"),
        );
        expect(result).toEqual({ outcome: "rejected", reason: "unauthorized" });
        expect(JSON.stringify(result)).not.toContain(KEY);
    });

    it("treats a 200 with hasError as rejected", async () => {
        const fetchFn = jest
            .fn()
            .mockResolvedValue(
                reply(200, { hasError: true, errors: "template not found" }),
            );
        const t = new Msg91Provider(config, fetchFn);
        await expect(t.sendWhatsappAuth(auth("+91981", "1"))).resolves.toEqual({
            outcome: "rejected",
            reason: "provider_error",
        });
    });

    it("throws a secret-free error on a network failure", async () => {
        const fetchFn = jest
            .fn()
            .mockRejectedValue(new Error(`timeout with ${KEY}`));
        const t = new Msg91Provider(config, fetchFn);
        const err = await t
            .sendWhatsappAuth(auth("+91981", "482913"))
            .catch((e: Error) => e);
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).not.toContain(KEY);
        expect((err as Error).message).not.toContain("482913");
    });

    it("fails naming the missing variable when unconfigured", async () => {
        const fetchFn = jest.fn();
        const t = new Msg91Provider({}, fetchFn);
        await expect(t.sendWhatsappAuth(auth("+91981", "1"))).rejects.toThrow(
            "MSG91_AUTH_KEY",
        );
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe("FakeMessagingProvider", () => {
    it("records sends and plays ineligible and rejected numbers", async () => {
        const fake = new FakeMessagingProvider();
        fake.markIneligible("+911");
        fake.reject("+912", "rate_limited");
        await expect(fake.sendWhatsappAuth(auth("+910", "1"))).resolves.toEqual(
            {
                outcome: "accepted",
                providerMessageId: expect.stringMatching(
                    /^fake_whatsapp_\w+_1$/,
                ),
            },
        );
        await expect(fake.sendWhatsappAuth(auth("+911", "2"))).resolves.toEqual(
            { outcome: "ineligible" },
        );
        await expect(fake.sendWhatsappAuth(auth("+912", "3"))).resolves.toEqual(
            {
                outcome: "rejected",
                reason: "rate_limited",
            },
        );
        expect(fake.sends.map((s) => s.code)).toEqual(["1", "2", "3"]);
    });
});

describe("createMessagingProvider", () => {
    const none = {
        MESSAGING_PROVIDER: undefined,
        MSG91_WHATSAPP_UTILITY_TEMPLATES: undefined,
        MSG91_AUTH_KEY: undefined,
        MSG91_WHATSAPP_NUMBER: undefined,
        MSG91_WHATSAPP_TEMPLATE: undefined,
        MSG91_BASE_URL: undefined,
    };
    it("uses the fake only in a declared dev or test run without credentials", () => {
        expect(createMessagingProvider(none, "test")).toBeInstanceOf(
            FakeMessagingProvider,
        );
        expect(createMessagingProvider(none, "production")).toBeInstanceOf(
            Msg91Provider,
        );
        expect(createMessagingProvider(none, undefined)).toBeInstanceOf(
            Msg91Provider,
        );
        expect(
            createMessagingProvider(
                {
                    ...none,
                    MSG91_AUTH_KEY: "k",
                    MSG91_WHATSAPP_NUMBER: "n",
                    MSG91_WHATSAPP_TEMPLATE: "t",
                },
                "development",
            ),
        ).toBeInstanceOf(Msg91Provider);
    });

    it("follows MESSAGING_PROVIDER, never the fake outside dev and test", () => {
        const configured = {
            ...none,
            MSG91_AUTH_KEY: "k",
            MSG91_WHATSAPP_NUMBER: "n",
            MSG91_WHATSAPP_TEMPLATE: "t",
        };
        expect(
            createMessagingProvider(
                { ...configured, MESSAGING_PROVIDER: "fake" },
                "development",
            ),
        ).toBeInstanceOf(FakeMessagingProvider);
        expect(
            createMessagingProvider(
                { ...configured, MESSAGING_PROVIDER: "fake" },
                "production",
            ),
        ).toBeInstanceOf(Msg91Provider);
        // Named outright, MSG91 even in a test run without credentials.
        expect(
            createMessagingProvider(
                { ...none, MESSAGING_PROVIDER: "msg91" },
                "test",
            ),
        ).toBeInstanceOf(Msg91Provider);
    });

    it("reads the utility template list", () => {
        expect(
            parseTemplateList(
                " booking_confirmed = saroh_booking_v1 ,bad,=x, ",
            ),
        ).toEqual({ booking_confirmed: "saroh_booking_v1" });
        expect(parseTemplateList(undefined)).toEqual({});
    });
});

describe("Msg91Provider beyond codes", () => {
    const ok = () =>
        jest
            .fn()
            .mockResolvedValue(
                reply(200, { hasError: false, request_id: "r-1" }),
            );

    it("sends a utility template by Saroh's key, its variables in order", async () => {
        const fetchFn = ok();
        const t = new Msg91Provider(
            { ...config, utilityTemplates: { order_ready: "saroh_order_v2" } },
            fetchFn,
        );
        await expect(
            t.sendWhatsAppTemplate({
                toE164: "+919812345678",
                template: "order_ready",
                category: "utility",
                variables: ["Asha", "ORD-12"],
            }),
        ).resolves.toEqual({ outcome: "accepted", providerMessageId: "r-1" });
        const body = JSON.parse(
            (fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string,
        );
        expect(body.payload.template.name).toBe("saroh_order_v2");
        expect(body.payload.template.to_and_components[0]).toEqual({
            to: ["919812345678"],
            components: {
                body_1: { type: "text", value: "Asha" },
                body_2: { type: "text", value: "ORD-12" },
            },
        });
    });

    it("refuses an unknown utility template without a call", async () => {
        const fetchFn = ok();
        const t = new Msg91Provider(config, fetchFn);
        await expect(
            t.sendWhatsAppTemplate({
                toE164: "+91981",
                template: "nope",
                category: "utility",
                variables: [],
            }),
        ).resolves.toEqual({ outcome: "rejected", reason: "unknown_template" });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("sends a free-form text in the body, never the URL", async () => {
        const fetchFn = ok();
        const t = new Msg91Provider(config, fetchFn);
        await t.sendWhatsAppText({ toE164: "+919812345678", text: "Hello" });
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(
            "https://msg91.test/api/v5/whatsapp/whatsapp-outbound-message/",
        );
        expect(url).not.toContain("Hello");
        expect(JSON.parse(init.body as string)).toEqual({
            integrated_number: "919000000001",
            recipient_number: "919812345678",
            content_type: "text",
            text: "Hello",
        });
    });

    it("has no SMS until DLT", async () => {
        const fetchFn = ok();
        await expect(
            new Msg91Provider(config, fetchFn).sendSms(),
        ).resolves.toEqual({ outcome: "unavailable" });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("reads the widget token's number as E.164, and refusals as typed failures", async () => {
        const verify = (status: number, body: unknown) =>
            new Msg91Provider(
                config,
                jest.fn().mockResolvedValue(reply(status, body)),
            ).verifyOtpWidgetToken("jwt");
        await expect(
            verify(200, { type: "success", message: "919812345678" }),
        ).resolves.toEqual({ ok: true, phoneE164: "+919812345678" });
        await expect(
            verify(200, {
                type: "error",
                code: "201",
                message: "AuthenticationFailure",
            }),
        ).resolves.toEqual({ ok: false, reason: "invalid_token" });
        await expect(
            verify(401, { status: "fail", hasError: true }),
        ).resolves.toEqual({ ok: false, reason: "invalid_token" });
        await expect(
            verify(200, { type: "success", message: "a@example.com" }),
        ).resolves.toEqual({ ok: false, reason: "not_a_phone" });
        await expect(verify(502, {})).resolves.toEqual({
            ok: false,
            reason: "unavailable",
        });
    });
});

describe("readableNumber (the template's number to call)", () => {
    it("reads 10 digits or 91 + 10 digits as +91 XXXXX XXXXX", () => {
        expect(readableNumber("9000000002")).toBe("+91 90000 00002");
        expect(readableNumber("919000000002")).toBe("+91 90000 00002");
        expect(readableNumber("+91 90000-00002")).toBe("+91 90000 00002");
        expect(readableNumber("4420000000")).toBe("+91 44200 00000");
        expect(readableNumber("+1 555 0100")).toBe("+1 555 0100");
    });
});
