import { Logger } from "@nestjs/common";

import { FakeMessagingProvider } from "./fake-messaging-provider";
import { createMessagingProvider } from "./messaging-provider.factory";
import { MetaCloudProvider } from "./meta-cloud.provider";
import { Msg91Provider } from "./msg91.provider";

// #1374 U1: Saroh's WhatsApp sends on Meta's Cloud API. `fetch` is stubbed: no network.
const TOKEN = "test-meta-token-very-secret";
const TO = "+919812345678";
const CODE = "482913";
const config = {
    phoneNumberId: "1234567890",
    token: TOKEN,
    authTemplate: "saroh_login_code",
    utilityTemplates: { order_ready: "saroh_order_v2" },
    baseUrl: "https://graph.test/v27.0/",
};

function reply(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
}

const accepted = () =>
    jest.fn().mockResolvedValue(
        reply(200, {
            messaging_product: "whatsapp",
            contacts: [{ input: "919812345678", wa_id: "919812345678" }],
            messages: [{ id: "wamid.ABC" }],
        }),
    );

const metaError = (status: number, code: number) =>
    jest.fn().mockResolvedValue(
        reply(status, {
            error: {
                message: `(#${code}) refused for ${TO} with ${TOKEN}`,
                type: "OAuthException",
                code,
                fbtrace_id: "x",
            },
        }),
    );

const noSms = () => ({
    sendSms: jest.fn().mockResolvedValue({ outcome: "unavailable" }),
    verifyOtpWidgetToken: jest
        .fn()
        .mockResolvedValue({ ok: true, phoneE164: TO }),
});

function sent(fetchFn: jest.Mock) {
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    return { url, init, body: JSON.parse(init.body as string) };
}

let warn: jest.SpyInstance;
beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
});
afterEach(() => {
    // No log line ever carries the token, the number or the code.
    for (const [line] of warn.mock.calls as [string][]) {
        expect(line).not.toContain(TOKEN);
        expect(line).not.toContain("9812345678");
        expect(line).not.toContain(CODE);
    }
    warn.mockRestore();
});

describe("MetaCloudProvider", () => {
    it("sends the authentication template with the code in the body and the copy-code button", async () => {
        const fetchFn = accepted();
        const meta = new MetaCloudProvider(config, noSms(), fetchFn);
        await expect(
            meta.sendWhatsappAuth({ toE164: TO, code: CODE }),
        ).resolves.toEqual({
            outcome: "accepted",
            providerMessageId: "wamid.ABC",
        });

        const { url, init, body } = sent(fetchFn);
        expect(url).toBe("https://graph.test/v27.0/1234567890/messages");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
        });
        expect(body).toEqual({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: "919812345678",
            type: "template",
            template: {
                name: "saroh_login_code",
                language: { code: "en_US" },
                components: [
                    {
                        type: "body",
                        parameters: [{ type: "text", text: CODE }],
                    },
                    {
                        type: "button",
                        sub_type: "url",
                        index: "0",
                        parameters: [{ type: "text", text: CODE }],
                    },
                ],
            },
        });
    });

    it("sends a utility template by Saroh's key, its variables in order, in the set language", async () => {
        const fetchFn = accepted();
        const meta = new MetaCloudProvider(
            { ...config, templateLang: "en" },
            noSms(),
            fetchFn,
        );
        await expect(
            meta.sendWhatsAppTemplate({
                toE164: TO,
                template: "order_ready",
                category: "utility",
                variables: ["Asha", "ORD-12"],
            }),
        ).resolves.toEqual({
            outcome: "accepted",
            providerMessageId: "wamid.ABC",
        });
        expect(sent(fetchFn).body.template).toEqual({
            name: "saroh_order_v2",
            language: { code: "en" },
            components: [
                {
                    type: "body",
                    parameters: [
                        { type: "text", text: "Asha" },
                        { type: "text", text: "ORD-12" },
                    ],
                },
            ],
        });
    });

    it("refuses an unknown utility template without a call", async () => {
        const fetchFn = accepted();
        const meta = new MetaCloudProvider(config, noSms(), fetchFn);
        await expect(
            meta.sendWhatsAppTemplate({
                toE164: TO,
                template: "nope",
                category: "utility",
                variables: [],
            }),
        ).resolves.toEqual({ outcome: "rejected", reason: "unknown_template" });
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("sends free text as a text message, never in the URL", async () => {
        const fetchFn = accepted();
        const meta = new MetaCloudProvider(config, noSms(), fetchFn);
        await meta.sendWhatsAppText({ toE164: TO, text: "Hello" });
        const { url, body } = sent(fetchFn);
        expect(url).not.toContain("Hello");
        expect(body).toEqual({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: "919812345678",
            type: "text",
            text: { body: "Hello" },
        });
    });

    it("reads Meta's 131026 as ineligible", async () => {
        const meta = new MetaCloudProvider(
            config,
            noSms(),
            metaError(400, 131026),
        );
        await expect(
            meta.sendWhatsappAuth({ toE164: TO, code: CODE }),
        ).resolves.toEqual({ outcome: "ineligible" });
    });

    it("rejects other 4xx with a short code only, never Meta's words", async () => {
        const send = (fetchFn: jest.Mock) =>
            new MetaCloudProvider(config, noSms(), fetchFn).sendWhatsappAuth({
                toE164: TO,
                code: CODE,
            });
        const refused = await send(metaError(400, 132001));
        expect(refused).toEqual({
            outcome: "rejected",
            reason: "whatsapp_132001",
        });
        expect(JSON.stringify(refused)).not.toContain(TOKEN);
        await expect(send(metaError(400, 130429))).resolves.toEqual({
            outcome: "rejected",
            reason: "rate_limited",
        });
        await expect(send(metaError(429, 80007))).resolves.toEqual({
            outcome: "rejected",
            reason: "rate_limited",
        });
        await expect(send(metaError(401, 190))).resolves.toEqual({
            outcome: "rejected",
            reason: "unauthorized",
        });
        await expect(
            send(jest.fn().mockResolvedValue(reply(400, "not json"))),
        ).resolves.toEqual({ outcome: "rejected", reason: "refused" });
    });

    it("throws on a 5xx or a timeout, naming neither the token nor the number", async () => {
        for (const fetchFn of [
            metaError(503, 2),
            jest.fn().mockRejectedValue(new Error(`timeout ${TOKEN} ${TO}`)),
        ]) {
            const err = await new MetaCloudProvider(config, noSms(), fetchFn)
                .sendWhatsappAuth({ toE164: TO, code: CODE })
                .catch((e: Error) => e);
            expect(err).toBeInstanceOf(Error);
            const message = (err as Error).message;
            expect(message).not.toContain(TOKEN);
            expect(message).not.toContain("9812345678");
            expect(message).not.toContain(CODE);
        }
    });

    it("fails naming the missing variable when unconfigured, with no call", async () => {
        const fetchFn = accepted();
        await expect(
            new MetaCloudProvider(
                { ...config, token: undefined },
                noSms(),
                fetchFn,
            ).sendWhatsappAuth({ toE164: TO, code: CODE }),
        ).rejects.toThrow("META_WA_TOKEN");
        await expect(
            new MetaCloudProvider(
                { ...config, phoneNumberId: undefined },
                noSms(),
                fetchFn,
            ).sendWhatsAppText({ toE164: TO, text: "Hi" }),
        ).rejects.toThrow("META_WA_PHONE_NUMBER_ID");
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("hands SMS and the widget's token check to MSG91 unchanged", async () => {
        const fetchFn = accepted();
        const sms = noSms();
        const meta = new MetaCloudProvider(config, sms, fetchFn);
        await expect(meta.sendSms({ toE164: TO, text: "Hi" })).resolves.toEqual(
            { outcome: "unavailable" },
        );
        await expect(meta.verifyOtpWidgetToken("jwt")).resolves.toEqual({
            ok: true,
            phoneE164: TO,
        });
        expect(sms.sendSms).toHaveBeenCalledWith({ toE164: TO, text: "Hi" });
        expect(sms.verifyOtpWidgetToken).toHaveBeenCalledWith("jwt");
        expect(fetchFn).not.toHaveBeenCalled();
    });
});

describe("createMessagingProvider with meta", () => {
    const none = {
        MESSAGING_PROVIDER: undefined,
        MSG91_WHATSAPP_UTILITY_TEMPLATES: undefined,
        MSG91_AUTH_KEY: undefined,
        MSG91_WHATSAPP_NUMBER: undefined,
        MSG91_WHATSAPP_TEMPLATE: undefined,
        MSG91_BASE_URL: undefined,
        META_WA_PHONE_NUMBER_ID: undefined,
        META_WA_TOKEN: undefined,
        META_WA_TEMPLATE_LANG: undefined,
        META_GRAPH_BASE_URL: undefined,
    };
    const msg91 = {
        ...none,
        MSG91_AUTH_KEY: "k",
        MSG91_WHATSAPP_NUMBER: "n",
        MSG91_WHATSAPP_TEMPLATE: "t",
    };

    it("builds the Meta composite when named, MSG91 when unset", () => {
        expect(
            createMessagingProvider(
                { ...msg91, MESSAGING_PROVIDER: "meta" },
                "production",
            ),
        ).toBeInstanceOf(MetaCloudProvider);
        // Named outright, Meta even in a test run without its settings.
        expect(
            createMessagingProvider(
                { ...none, MESSAGING_PROVIDER: "meta" },
                "test",
            ),
        ).toBeInstanceOf(MetaCloudProvider);
        expect(createMessagingProvider(msg91, "production")).toBeInstanceOf(
            Msg91Provider,
        );
        expect(
            createMessagingProvider(
                { ...msg91, MESSAGING_PROVIDER: "fake" },
                "production",
            ),
        ).toBeInstanceOf(Msg91Provider);
        expect(
            createMessagingProvider(
                { ...msg91, MESSAGING_PROVIDER: "fake" },
                "test",
            ),
        ).toBeInstanceOf(FakeMessagingProvider);
    });
});
