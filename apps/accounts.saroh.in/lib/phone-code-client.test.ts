import { describe, expect, it, vi } from "vitest";

import type { OtpSender } from "./otp-widget";
import { tokenOf } from "./otp-widget";
import {
    phoneCodeClient,
    RESEND_FAILED,
    WRONG_PHONE_CODE,
} from "./phone-code-client";
import { refusal } from "./phone-sign-in";
import { checkCode, sendCode } from "./sign-in-code";

/**
 * A texted code on the shared code step (DEC-196): the widget's token goes
 * to the API, which decides; the widget alone never signs anyone in.
 */

function sender(over: Partial<OtpSender> = {}): OtpSender {
    return {
        captcha: false,
        send: vi.fn().mockResolvedValue(undefined),
        retry: vi.fn().mockResolvedValue(undefined),
        verify: vi.fn().mockResolvedValue("widget-token"),
        ...over,
    };
}

describe("the phone code client", () => {
    it("hands the widget's token to the API and is done only when the API says so", async () => {
        const confirm = vi.fn().mockResolvedValue({ data: {}, error: null });
        const verify = vi.fn().mockResolvedValue("widget-token");
        const s = sender({ verify });
        const result = await checkCode(phoneCodeClient(s, confirm), {
            email: "+919845012345",
            code: "123456",
        });
        expect(verify).toHaveBeenCalledWith("123456");
        expect(confirm).toHaveBeenCalledWith("widget-token");
        expect(result).toEqual({ ok: true });
    });

    it("says the API's own words when it refuses", async () => {
        const confirm = vi.fn().mockResolvedValue({
            data: null,
            error: {
                code: "NO_ACCOUNT",
                words: "Use your email to sign in, then add this phone in your account.",
            },
            retryAfter: null,
        });
        const result = await checkCode(phoneCodeClient(sender(), confirm), {
            email: "+919845012345",
            code: "123456",
        });
        expect(result).toEqual({
            ok: false,
            message:
                "Use your email to sign in, then add this phone in your account.",
            spent: false,
        });
    });

    it("never asks the API when the widget refuses the code", async () => {
        const confirm = vi.fn();
        const s = sender({
            verify: vi.fn().mockRejectedValue(new Error("no")),
        });
        const result = await checkCode(phoneCodeClient(s, confirm), {
            email: "+919845012345",
            code: "123456",
        });
        expect(confirm).not.toHaveBeenCalled();
        expect(result).toMatchObject({ ok: false, message: WRONG_PHONE_CODE });
    });

    it("resends through the widget, with no email check on a number", async () => {
        const retry = vi.fn().mockResolvedValue(undefined);
        const client = phoneCodeClient(sender({ retry }), vi.fn());
        await expect(
            sendCode(client, { email: "+919845012345" }),
        ).resolves.toMatchObject({ ok: true });
        expect(retry).toHaveBeenCalled();
        const failing = phoneCodeClient(
            sender({ retry: vi.fn().mockRejectedValue(new Error("no")) }),
            vi.fn(),
        );
        await expect(
            sendCode(failing, { email: "+919845012345" }),
        ).resolves.toMatchObject({ ok: false, message: RESEND_FAILED });
    });
});

describe("reading the widget's and the API's answers", () => {
    it("takes the token from a string or { message }, and nothing else", () => {
        expect(tokenOf("abc")).toBe("abc");
        expect(tokenOf({ type: "success", message: "abc" })).toBe("abc");
        expect(tokenOf({ type: "success" })).toBeNull();
        expect(tokenOf("")).toBeNull();
    });

    it("keeps the API's sentence and wait, and drops a 5xx's words", async () => {
        const limited = await refusal(
            new Response(
                JSON.stringify({
                    error: {
                        message:
                            "Too many tries for now. Try again in 20 seconds.",
                        details: { code: "TOO_MANY", retryAfter: 20 },
                    },
                }),
                { status: 429 },
            ),
        );
        expect(limited).toEqual({
            error: {
                code: "TOO_MANY_REQUESTS",
                status: 429,
                words: "Too many tries for now. Try again in 20 seconds.",
            },
            retryAfter: 20,
        });
        const broken = await refusal(
            new Response(
                JSON.stringify({ error: { message: "Internal server error" } }),
                { status: 500 },
            ),
        );
        expect(broken.error.words).toBeUndefined();
    });
});
