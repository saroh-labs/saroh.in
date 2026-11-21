import { FixedWindowRateLimiter } from "../modules/rate-limits/fixed-window";
import { emailSendFailed } from "./email-send-health";

describe("emailSendFailed (04 S13)", () => {
    const deps = (min: number) => ({
        failures: new FixedWindowRateLimiter(min, 60_000),
        alerted: new FixedWindowRateLimiter(1, 60_000),
        alerts: { send: jest.fn().mockResolvedValue(1) },
    });

    it("alerts staff once when ordinary failures pass the line", async () => {
        const d = deps(2);
        const out = [];
        for (let i = 0; i < 5; i++) out.push(await emailSendFailed(null, d));
        expect(out).toEqual([false, false, true, false, false]);
        expect(d.alerts.send).toHaveBeenCalledTimes(1);
    });

    it("alerts at once for a security notice, once per kind", async () => {
        const d = deps(10);
        await expect(emailSendFailed("Owner changed", d)).resolves.toBe(true);
        await expect(emailSendFailed("Owner changed", d)).resolves.toBe(false);
        await expect(emailSendFailed("sign-in email changed", d)).resolves.toBe(
            true,
        );
        expect(d.alerts.send).toHaveBeenCalledTimes(2);
        expect(d.alerts.send.mock.calls[0][0].subject).toMatch(/security/);
    });
});
