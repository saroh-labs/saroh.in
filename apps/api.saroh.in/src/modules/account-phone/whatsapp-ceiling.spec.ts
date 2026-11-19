jest.mock("@saroh/database", () => ({ prisma: {} }));

import { Logger } from "@nestjs/common";

import { FixedWindowRateLimiter } from "../rate-limits/fixed-window";
import { resetCeilingAlert, WhatsappCeiling } from "./whatsapp-ceiling";

// 03-H1: anyone could make Saroh's number send codes to any Indian mobile,
// with no ceiling on the total.
describe("WhatsappCeiling", () => {
    let error: jest.SpyInstance;
    beforeEach(() => {
        resetCeilingAlert();
        error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => {});
    });
    afterEach(() => error.mockRestore());

    function ceiling(perHour: number, perDay: number) {
        const send = jest.fn().mockResolvedValue(1);
        const made = new WhatsappCeiling(
            perHour,
            perDay,
            new FixedWindowRateLimiter(perHour, 60 * 60_000),
            new FixedWindowRateLimiter(perDay, 24 * 60 * 60_000),
            { send },
        );
        return { made, send };
    }

    it("refuses past the hour's ceiling until the hour turns, and alerts once", async () => {
        const { made, send } = ceiling(3, 100);
        for (let i = 0; i < 3; i++) expect(await made.allows(i)).toBe(true);
        expect(await made.allows(10)).toBe(false);
        expect(await made.allows(20)).toBe(false);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].subject).toContain("paused");
        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0][0])).toContain(
            "account_phone_whatsapp_ceiling",
        );
        expect(await made.allows(60 * 60_000)).toBe(true);
    });

    it("refuses past the day's ceiling even when each hour is under its own", async () => {
        const { made } = ceiling(2, 3);
        expect(await made.allows(0)).toBe(true);
        expect(await made.allows(1)).toBe(true);
        expect(await made.allows(60 * 60_000)).toBe(true);
        expect(await made.allows(60 * 60_000 + 1)).toBe(false);
        expect(await made.allows(2 * 60 * 60_000)).toBe(false);
    });
});
