jest.mock("@saroh/database", () => ({ prisma: {} }));
jest.mock("../../env", () => ({ env: {} }));

import { Logger } from "@nestjs/common";

import {
    accountLevel,
    isFailing,
    MemoryHealthStore,
    metaCode,
    RedisHealthStore,
    topReasons,
    WhatsappSignInHealth,
} from "./whatsapp-signin-health";

// Owner, 19 Nov: phone sign-in answers every number alike and sends after
// the answer, so a failing send is invisible to the person. Saroh notices.
describe("WhatsApp sign-in health", () => {
    let error: jest.SpyInstance;
    let clock: number;
    beforeEach(() => {
        clock = 1_000_000_000_000;
        error = jest
            .spyOn(Logger.prototype, "error")
            .mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
        jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    });
    afterEach(() => jest.restoreAllMocks());

    function health(template = "saroh_login_code") {
        const send = jest.fn().mockResolvedValue(1);
        const made = new WhatsappSignInHealth(
            new MemoryHealthStore(() => clock),
            { send },
            5,
            30,
            template,
        );
        return { made, send };
    }
    const logged = () => error.mock.calls.map((c) => String(c[0]));

    describe("the rules", () => {
        it("reads Meta's code from a short reason, and nothing else", () => {
            expect(metaCode("whatsapp_131026")).toBe(131026);
            expect(metaCode("unauthorized")).toBeNull();
            expect(metaCode("whatsapp_abc")).toBeNull();
        });

        it("maps Meta's account-level codes, and leaves one number's alone", () => {
            for (const code of [
                0, 3, 10, 190, 200, 299, 368, 131031, 131042, 131045, 132001,
                132015, 132016, 133010,
            ]) {
                expect(accountLevel(`whatsapp_${code}`)).toBeTruthy();
            }
            expect(accountLevel("unauthorized")).toBeTruthy();
            for (const reason of [
                "whatsapp_131026",
                "whatsapp_130429",
                "whatsapp_300",
                "not_on_whatsapp",
                "rate_limited",
                "transport_error",
                "undelivered",
            ]) {
                expect(accountLevel(reason)).toBeNull();
            }
        });

        it("is failing at the minimum count and the share together", () => {
            expect(isFailing(10, 4, 5, 30)).toBe(false); // under the count
            expect(isFailing(20, 5, 5, 30)).toBe(false); // 25%
            expect(isFailing(16, 5, 5, 30)).toBe(true); // 31%
            expect(isFailing(0, 5, 5, 30)).toBe(true); // failures with no sends seen
        });

        it("names the commonest reasons first", () => {
            expect(topReasons({ a: 1, whatsapp_131026: 4, b: 2, c: 1 })).toBe(
                "whatsapp_131026 ×4, b ×2, a ×1",
            );
        });
    });

    it("alerts once an hour when failures cross the threshold, with the top codes", async () => {
        const { made, send } = health();
        for (let i = 0; i < 10; i++) await made.sent(`m${i}`, clock);
        for (let i = 0; i < 4; i++) await made.failed("not_on_whatsapp", clock);
        expect(send).not.toHaveBeenCalled();
        await made.failed("whatsapp_131026", clock);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].path).toBe("/health");
        expect(logged()).toEqual([
            expect.stringContaining(
                "account_phone_whatsapp_failing failures=5 sends=10 window=15m top=not_on_whatsapp ×4, whatsapp_131026 ×1",
            ),
        ]);
        for (let i = 0; i < 5; i++) await made.failed("not_on_whatsapp", clock);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("stays quiet below the share", async () => {
        const { made, send } = health();
        for (let i = 0; i < 40; i++) await made.sent(`m${i}`, clock);
        for (let i = 0; i < 6; i++) await made.failed("not_on_whatsapp", clock);
        expect(send).not.toHaveBeenCalled();
        expect(logged()).toEqual([]);
    });

    it("alerts on a single account-level error, once an hour per code", async () => {
        const { made, send } = health();
        await made.sent(undefined, clock);
        await made.failed("whatsapp_190", clock);
        await made.failed("whatsapp_190", clock + 1000);
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].lines[0]).toContain("whatsapp_190");
        expect(logged()[0]).toContain(
            "account_phone_whatsapp_account_error reason=whatsapp_190",
        );
        await made.failed("whatsapp_132015", clock + 2000);
        expect(send).toHaveBeenCalledTimes(2);
        clock += 61 * 60_000;
        await made.failed("whatsapp_190", clock);
        expect(send).toHaveBeenCalledTimes(3);
    });

    // Owner, 24 Nov: every send would fail alike, so nobody spends tries.
    it("pauses WhatsApp codes for five minutes on an account-level error only", async () => {
        const { made } = health();
        await made.failed("whatsapp_131026", clock);
        await expect(made.paused()).resolves.toBe(false);
        await made.failed("whatsapp_10", clock);
        await expect(made.paused()).resolves.toBe(true);
        clock += 5 * 60_000 + 1;
        await expect(made.paused()).resolves.toBe(false);
        await made.failed("unauthorized", clock);
        await made.resume();
        await expect(made.paused()).resolves.toBe(false);
    });

    it("counts Meta's failed status only for a sign-in message, and only once", async () => {
        const { made } = health();
        await made.sent("wamid.ours", clock);
        await made.deliveryFailed("wamid.other", "whatsapp_131026", clock);
        await made.deliveryFailed("wamid.ours", "whatsapp_131026", clock);
        await made.deliveryFailed("wamid.ours", "whatsapp_131026", clock);
        expect(await made.lastHour(clock)).toEqual({
            sends: 1,
            failures: 1,
            lastError: "whatsapp_131026",
            failing: false,
        });
    });

    it("sums the last hour and drops what is older", async () => {
        const { made } = health();
        await made.sent("a", clock - 70 * 60_000);
        await made.sent("b", clock - 40 * 60_000);
        await made.sent("c", clock);
        expect((await made.lastHour(clock)).sends).toBe(2);
    });

    describe("Meta's template webhooks", () => {
        const status = (event: string, name = "saroh_login_code") => ({
            event,
            message_template_name: name,
            message_template_id: 1,
            message_template_language: "en_US",
            reason: "NONE",
        });

        it("alerts once per change when the sign-in template is paused, disabled or rejected", async () => {
            const { made, send } = health();
            await made.templateEvent(
                "message_template_status_update",
                status("PAUSED"),
            );
            await made.templateEvent(
                "message_template_status_update",
                status("PAUSED"),
            );
            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0].subject).toContain("paused");
            expect(logged()[0]).toContain(
                "account_phone_whatsapp_template template=saroh_login_code status=PAUSED",
            );
            await made.templateEvent(
                "message_template_status_update",
                status("APPROVED"),
            );
            await made.templateEvent(
                "message_template_status_update",
                status("DISABLED"),
            );
            await made.templateEvent(
                "message_template_status_update",
                status("REJECTED"),
            );
            expect(send).toHaveBeenCalledTimes(3);
        });

        it("alerts when its quality drops to RED, not on GREEN or YELLOW", async () => {
            const { made, send } = health();
            const quality = (score: string) => ({
                message_template_name: "saroh_login_code",
                previous_quality_score: "GREEN",
                new_quality_score: score,
            });
            await made.templateEvent(
                "message_template_quality_update",
                quality("YELLOW"),
            );
            expect(send).not.toHaveBeenCalled();
            await made.templateEvent(
                "message_template_quality_update",
                quality("RED"),
            );
            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0].subject).toContain("RED");
        });

        it("never acts on a template that isn't the configured sign-in one", async () => {
            const { made, send } = health();
            await made.templateEvent(
                "message_template_status_update",
                status("DISABLED", "someone_elses"),
            );
            const unset = health(undefined as unknown as string);
            await unset.made.templateEvent(
                "message_template_status_update",
                status("DISABLED", ""),
            );
            expect(send).not.toHaveBeenCalled();
            expect(unset.send).not.toHaveBeenCalled();
            expect(logged()).toEqual([]);
        });

        it("only notes a components change", async () => {
            const { made, send } = health();
            await made.templateEvent("message_template_components_update", {
                message_template_name: "saroh_login_code",
            });
            expect(send).not.toHaveBeenCalled();
        });
    });

    it("falls back to memory on a Redis error, never failing the send", async () => {
        const broken = {
            multi: () => {
                throw new Error("down");
            },
            hgetall: jest.fn().mockRejectedValue(new Error("down")),
            set: jest.fn().mockRejectedValue(new Error("down")),
            del: jest.fn().mockRejectedValue(new Error("down")),
            get: jest.fn().mockRejectedValue(new Error("down")),
            pexpire: jest.fn(),
        };
        const made = new WhatsappSignInHealth(
            new RedisHealthStore(broken as never),
            { send: jest.fn() },
            5,
            30,
            "t",
        );
        await made.sent("x");
        await made.failed("not_on_whatsapp");
        expect((await made.lastHour()).failures).toBe(1);
    });
});
