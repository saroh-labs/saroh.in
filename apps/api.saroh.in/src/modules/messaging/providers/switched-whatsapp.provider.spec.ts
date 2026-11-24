jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../../../env", () => ({ env: {}, declaredNodeEnv: "test" }));

import { Logger } from "@nestjs/common";

import { createMessagingProvider } from "./messaging-provider.factory";
import type { MessagingProvider } from "./messaging-provider.port";
import { SwitchedWhatsappProvider } from "./switched-whatsapp.provider";

function sender(name: string): jest.Mocked<MessagingProvider> {
    const ok = { outcome: "accepted" as const, providerMessageId: name };
    return {
        sendWhatsappAuth: jest.fn().mockResolvedValue(ok),
        sendWhatsAppTemplate: jest.fn().mockResolvedValue(ok),
        sendWhatsAppText: jest.fn().mockResolvedValue(ok),
        sendSms: jest.fn().mockResolvedValue(ok),
        verifyOtpWidgetToken: jest.fn().mockResolvedValue({ ok: false }),
    };
}

// Owner, 24 Nov: the admin switch picks Meta or MSG91 per send.
describe("SwitchedWhatsappProvider", () => {
    const to = "+919845012345";

    it("sends WhatsApp through whichever the switch names, on every send", async () => {
        const meta = sender("meta");
        const msg91 = sender("msg91");
        let on = false;
        const p = new SwitchedWhatsappProvider(meta, msg91, () =>
            Promise.resolve(on),
        );
        await expect(
            p.sendWhatsappAuth({ toE164: to, code: "123456" }),
        ).resolves.toMatchObject({ providerMessageId: "msg91" });
        on = true;
        await expect(
            p.sendWhatsappAuth({ toE164: to, code: "123456" }),
        ).resolves.toMatchObject({ providerMessageId: "meta" });
        await p.sendWhatsAppText({ toE164: to, text: "Hi" });
        await p.sendWhatsAppTemplate({
            toE164: to,
            template: "order_ready",
            category: "utility",
            variables: [],
        });
        expect(meta.sendWhatsAppText).toHaveBeenCalledTimes(1);
        expect(meta.sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    });

    it("keeps SMS and the widget on MSG91, and MSG91 when the switch can't be read", async () => {
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
        const meta = sender("meta");
        const msg91 = sender("msg91");
        const p = new SwitchedWhatsappProvider(meta, msg91, () =>
            Promise.reject(new Error("db down")),
        );
        await expect(
            p.sendWhatsappAuth({ toE164: to, code: "123456" }),
        ).resolves.toMatchObject({ providerMessageId: "msg91" });
        await p.sendSms({ toE164: to, text: "Hi" });
        await p.verifyOtpWidgetToken("jwt");
        expect(msg91.sendSms).toHaveBeenCalled();
        expect(msg91.verifyOtpWidgetToken).toHaveBeenCalledWith("jwt");
        expect(meta.sendSms).not.toHaveBeenCalled();
    });

    it("is what the factory builds for meta when given the switch", () => {
        const source = {
            MESSAGING_PROVIDER: "meta" as const,
            MSG91_AUTH_KEY: "k",
            MSG91_WHATSAPP_NUMBER: "n",
            MSG91_WHATSAPP_TEMPLATE: "t",
            MSG91_WHATSAPP_UTILITY_TEMPLATES: undefined,
            MSG91_BASE_URL: undefined,
            META_WA_PHONE_NUMBER_ID: "1",
            META_WA_TOKEN: "x",
            META_WA_TEMPLATE_LANG: undefined,
            META_GRAPH_BASE_URL: undefined,
        };
        const viaMeta = () => Promise.resolve(true);
        expect(
            createMessagingProvider(source, "production", viaMeta),
        ).toBeInstanceOf(SwitchedWhatsappProvider);
        expect(
            createMessagingProvider(
                { ...source, MESSAGING_PROVIDER: "msg91" },
                "production",
                viaMeta,
            ),
        ).not.toBeInstanceOf(SwitchedWhatsappProvider);
    });
});
