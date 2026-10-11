import {
    CODE_RESEND_SECONDS,
    VERIFICATION_OTP_EXPIRY_SECONDS,
} from "@saroh/auth/constants";
import { describe, expect, it, vi } from "vitest";

import type { CodeClient } from "./sign-in-code";
import {
    checkCode,
    CODE_WORDS,
    codeDigits,
    codeLead,
    resendLabel,
    resendWait,
    sendCode,
    waitFromServer,
} from "./sign-in-code";

/**
 * Signing up and signing in with an emailed code (owner, 10 Oct 2026): what
 * the steps send and what each answer says. The server's side of it, on the
 * real library, is `packages/auth/src/sign-in-code.test.ts`.
 */

function client(over: Partial<CodeClient> = {}): CodeClient {
    return {
        send: vi.fn().mockResolvedValue({ error: null }),
        check: vi.fn().mockResolvedValue({ error: null }),
        ...over,
    };
}

describe("the code step's words match a merchant's own site", () => {
    it("uses the sign-in sheet's labels", () => {
        expect(CODE_WORDS.label).toBe("Code");
        expect(CODE_WORDS.changeEmail).toBe("Change email");
        expect(CODE_WORDS.sendNew).toBe("Send a new code");
        expect(CODE_WORDS.submit).toBe("Sign in");
        expect(CODE_WORDS.checking).toBe("Checking…");
        expect(resendLabel(24)).toBe("Resend code in 24s");
        expect(resendLabel(0)).toBe("Resend code");
    });

    it("says where the code went and how long it lasts, from the server's value", () => {
        expect(codeLead("asha@example.com")).toBe(
            `We sent a 6-digit code to asha@example.com. It lasts ${VERIFICATION_OTP_EXPIRY_SECONDS / 60} minutes.`,
        );
    });

    it("tells someone to look in spam", () => {
        expect(CODE_WORDS.spam).toBe("Not there? Look in spam.");
    });
});

describe("codeDigits", () => {
    it("keeps digits only, so a paste with spaces fits", () => {
        expect(codeDigits("039 147")).toBe("039147");
        expect(codeDigits("Code: 039147.")).toBe("039147");
        expect(codeDigits("0391478888")).toBe("039147");
    });
});

describe("the Resend countdown", () => {
    it("counts whole seconds down to zero", () => {
        expect(resendWait(null, 1_000)).toBe(0);
        expect(resendWait(31_000, 1_000)).toBe(30);
        expect(resendWait(31_000, 30_500)).toBe(1);
        expect(resendWait(31_000, 31_000)).toBe(0);
        expect(resendWait(31_000, 99_000)).toBe(0);
    });

    it("takes the server's wait from a refusal, and falls back when it names none", () => {
        expect(waitFromServer("42")).toBe(42);
        expect(waitFromServer("41.2")).toBe(42);
        expect(waitFromServer(null)).toBe(CODE_RESEND_SECONDS);
        expect(waitFromServer("soon")).toBe(CODE_RESEND_SECONDS);
        expect(waitFromServer("-3")).toBe(CODE_RESEND_SECONDS);
        // Never a countdown longer than the code itself lasts.
        expect(waitFromServer("86400")).toBe(600);
    });
});

describe("sendCode: asking for a code", () => {
    it("asks for a sign-in code and gives the wait before Resend", async () => {
        const c = client();
        expect(await sendCode(c, { email: "  asha@example.com " })).toEqual({
            ok: true,
            resendAfterSeconds: CODE_RESEND_SECONDS,
        });
        expect(c.send).toHaveBeenCalledWith({
            email: "asha@example.com",
            kind: "sign-in",
        });
    });

    it("says the same for a new address and one with an account: it is told neither", async () => {
        // The server answers both alike, and nothing here asks which.
        const c = client();
        const fresh = await sendCode(c, { email: "new@example.com" });
        const known = await sendCode(c, { email: "owner@example.com" });
        expect(fresh).toEqual(known);
    });

    it("stops something that is not an address before it is sent", async () => {
        const c = client();
        const result = await sendCode(c, { email: "asha" });
        expect(result).toEqual({
            ok: false,
            message:
                "That doesn't look like an email address. Check it and try again.",
            resendAfterSeconds: null,
        });
        expect(c.send).not.toHaveBeenCalled();
    });

    it("a refusal for asking too often says so and counts the server's wait down", async () => {
        const c = client({
            send: vi.fn().mockResolvedValue({
                error: { status: 429 },
                retryAfter: "37",
            }),
        });
        expect(await sendCode(c, { email: "asha@example.com" })).toEqual({
            ok: false,
            message: "Too many codes asked for. Wait a moment, then try again.",
            resendAfterSeconds: 37,
        });
    });

    it("a dropped connection is said, never left hanging", async () => {
        const c = client({
            send: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
        });
        expect(await sendCode(c, { email: "asha@example.com" })).toEqual({
            ok: false,
            message:
                "Couldn't reach Saroh. Check your connection and try again.",
            resendAfterSeconds: null,
        });
    });

    it("never shows the library's own message", async () => {
        const c = client({
            send: vi.fn().mockResolvedValue({
                error: { code: "SOMETHING_NEW", message: "boom" },
            }),
        });
        const result = await sendCode(c, { email: "asha@example.com" });
        expect(result).toMatchObject({
            ok: false,
            message: "Couldn't send the code. Try again.",
        });
    });
});

describe("checkCode: the code path", () => {
    it("signs in with the six digits, however they were pasted", async () => {
        const c = client();
        expect(
            await checkCode(c, { email: "asha@example.com", code: "039 147" }),
        ).toEqual({ ok: true });
        expect(c.check).toHaveBeenCalledWith({
            email: "asha@example.com",
            code: "039147",
            kind: "sign-in",
        });
    });

    it("carries a name only when one was given (someone joining a business)", async () => {
        const c = client();
        await checkCode(c, {
            email: "ravi@example.com",
            code: "123456",
            name: "  Ravi K ",
        });
        expect(c.check).toHaveBeenLastCalledWith(
            expect.objectContaining({ name: "Ravi K" }),
        );
        await checkCode(c, {
            email: "ravi@example.com",
            code: "123456",
            name: "   ",
        });
        expect(c.check).toHaveBeenLastCalledWith({
            email: "ravi@example.com",
            code: "123456",
            kind: "sign-in",
        });
    });

    it("checks a password account's confirmation code the same way", async () => {
        const c = client();
        await checkCode(c, {
            email: "priya@example.com",
            code: "123456",
            kind: "email-verification",
        });
        expect(c.check).toHaveBeenCalledWith(
            expect.objectContaining({ kind: "email-verification" }),
        );
    });

    it("asks for all six digits before sending anything", async () => {
        const c = client();
        expect(
            await checkCode(c, { email: "asha@example.com", code: "0391" }),
        ).toEqual({
            ok: false,
            message: "Enter all 6 digits of the code.",
            spent: false,
        });
        expect(c.check).not.toHaveBeenCalled();
    });

    it.each([
        [
            "INVALID_OTP",
            "That code isn't right. Check the email and try again.",
            false,
        ],
        ["OTP_EXPIRED", "That code has expired. Send a new one.", true],
        ["TOO_MANY_ATTEMPTS", "Too many wrong codes. Send a new one.", true],
    ])(
        "%s: says it, and offers a new code when it is spent",
        async (code, message, spent) => {
            const c = client({
                check: vi.fn().mockResolvedValue({ error: { code } }),
            });
            expect(
                await checkCode(c, {
                    email: "asha@example.com",
                    code: "111111",
                }),
            ).toEqual({ ok: false, message, spent });
        },
    );

    it("too many checks in a minute is the limiter's sentence, and the code is kept", async () => {
        const c = client({
            check: vi.fn().mockResolvedValue({ error: { status: 429 } }),
        });
        expect(
            await checkCode(c, { email: "asha@example.com", code: "111111" }),
        ).toEqual({
            ok: false,
            message: "Too many tries. Wait a minute, then try again.",
            spent: false,
        });
    });
});
