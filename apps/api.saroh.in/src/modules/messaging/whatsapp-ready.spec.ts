jest.mock("@saroh/database", () => ({ prisma: {}, Prisma: {} }));

import { whatsappReady } from "./messaging.service";

// 03-L4: readiness read MSG91's variables even with MESSAGING_PROVIDER=meta.
describe("whatsappReady", () => {
    const template = { MSG91_WHATSAPP_TEMPLATE: "saroh_code" };

    it("on Meta, needs Meta's token and number id, never MSG91's number", () => {
        expect(
            whatsappReady("meta", {
                ...template,
                META_WA_TOKEN: "t",
                META_WA_PHONE_NUMBER_ID: "1",
            }),
        ).toBe(true);
        expect(
            whatsappReady("meta", {
                ...template,
                MSG91_AUTH_KEY: "k",
                MSG91_WHATSAPP_NUMBER: "91",
            }),
        ).toBe(false);
        expect(whatsappReady("meta", { ...template, META_WA_TOKEN: "t" })).toBe(
            false,
        );
    });

    it("on MSG91, needs its key, number and template", () => {
        expect(
            whatsappReady("msg91", {
                ...template,
                MSG91_AUTH_KEY: "k",
                MSG91_WHATSAPP_NUMBER: "91",
            }),
        ).toBe(true);
        expect(
            whatsappReady("msg91", {
                ...template,
                META_WA_TOKEN: "t",
                META_WA_PHONE_NUMBER_ID: "1",
            }),
        ).toBe(false);
    });
});
