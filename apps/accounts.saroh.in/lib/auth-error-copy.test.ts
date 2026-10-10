import { describe, expect, it } from "vitest";

import {
    AUTH_ERROR_FALLBACK,
    authErrorCode,
    authErrorCopy,
    authFailureCopy,
    NETWORK_ERROR,
    settle,
    socialErrorCopy,
    TOO_MANY_REQUESTS,
} from "./auth-error-copy";

/**
 * The one map from a failure to what the screen says (UX audit, 10 Oct):
 * Better Auth's own messages and the browser's "Failed to fetch" reached the
 * screen through `setError(ctx.error.message)`.
 */
describe("authErrorCopy", () => {
    it("has a plain sentence for each failure a person can cause or meet", () => {
        expect(authErrorCopy("INVALID_EMAIL_OR_PASSWORD")).toBe(
            "That email or password isn't right. Check both and try again.",
        );
        expect(authErrorCopy(TOO_MANY_REQUESTS)).toBe(
            "Too many tries. Wait a minute, then try again.",
        );
        expect(authErrorCopy(NETWORK_ERROR)).toBe(
            "Couldn't reach Saroh. Check your connection and try again.",
        );
        expect(authErrorCopy("PASSWORD_TOO_SHORT")).toBe(
            "That password is too short. Use eight characters or more.",
        );
    });

    it("falls back to one sentence for anything it does not know", () => {
        expect(AUTH_ERROR_FALLBACK).toBe("That didn't work. Try again.");
        expect(authErrorCopy(undefined)).toBe(AUTH_ERROR_FALLBACK);
        expect(authErrorCopy("SOMETHING_NEW_FROM_THE_LIBRARY")).toBe(
            AUTH_ERROR_FALLBACK,
        );
        expect(authErrorCopy("")).toBe(AUTH_ERROR_FALLBACK);
        // Something every object has is not a code.
        expect(authErrorCopy("constructor")).toBe(AUTH_ERROR_FALLBACK);
        expect(authErrorCopy("toString")).toBe(AUTH_ERROR_FALLBACK);
    });

    it("lets a screen say what it was doing instead", () => {
        expect(
            authErrorCopy(undefined, "Couldn't save your name. Try again."),
        ).toBe("Couldn't save your name. Try again.");
        // A known code still wins over the screen's fallback.
        expect(authErrorCopy(NETWORK_ERROR, "Couldn't save your name.")).toBe(
            "Couldn't reach Saroh. Check your connection and try again.",
        );
    });

    it("never says which of the email and the password was wrong", () => {
        const said = authErrorCopy("INVALID_EMAIL_OR_PASSWORD");
        expect(said).toContain("email or password");
        expect(said).not.toMatch(/no account|not registered|doesn't exist/i);
    });

    it("ends every sentence with a full stop, with no em dash or semicolon", () => {
        const codes = [
            "INVALID_EMAIL_OR_PASSWORD",
            "INVALID_PASSWORD",
            "INVALID_EMAIL",
            TOO_MANY_REQUESTS,
            "TOO_MANY_ATTEMPTS",
            NETWORK_ERROR,
            "PASSWORD_TOO_SHORT",
            "PASSWORD_TOO_LONG",
            "INVALID_OTP",
            "OTP_EXPIRED",
            "INVALID_TOKEN",
            "TOKEN_EXPIRED",
            "SESSION_EXPIRED",
            "SESSION_NOT_FRESH",
            "USER_ALREADY_EXISTS",
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            undefined,
        ];
        for (const code of codes) {
            const said = authErrorCopy(code);
            if (code) expect(said, code).not.toBe(AUTH_ERROR_FALLBACK);
            expect(said, code).toMatch(/\.$/);
            expect(said, code).not.toMatch(/[—;]/);
            // The library's own words never come through.
            expect(said, code).not.toMatch(/OTP|token|Invalid/);
        }
    });
});

describe("authErrorCode", () => {
    it("is the failure's own code", () => {
        expect(authErrorCode({ code: "INVALID_OTP", status: 400 })).toBe(
            "INVALID_OTP",
        );
    });

    it("names a bare 429, which the rate limiter sends with no code", () => {
        expect(authErrorCode({ status: 429 })).toBe(TOO_MANY_REQUESTS);
        expect(authFailureCopy({ status: 429 })).toBe(
            "Too many tries. Wait a minute, then try again.",
        );
    });

    it("is undefined when there is nothing to go on", () => {
        expect(authErrorCode({ status: 500 })).toBeUndefined();
        expect(authErrorCode(null)).toBeUndefined();
        expect(authFailureCopy(undefined)).toBe(AUTH_ERROR_FALLBACK);
    });
});

describe("settle", () => {
    it("passes a call's own answer through", async () => {
        const answer = { data: { ok: true }, error: null };
        await expect(settle(() => Promise.resolve(answer))).resolves.toBe(
            answer,
        );
    });

    it("turns a request that never left into a network failure", async () => {
        const { data, error } = await settle<{
            data: null;
            error: { code?: string } | null;
        }>(() => Promise.reject(new TypeError("Failed to fetch")));
        expect(data).toBeNull();
        expect(error).toEqual({ code: NETWORK_ERROR });
        // And what the screen says is ours, not the browser's.
        expect(authFailureCopy(error)).not.toContain("fetch");
    });
});

describe("socialErrorCopy", () => {
    it("names the provider and the other way in", () => {
        expect(socialErrorCopy("Google", { status: 500 })).toBe(
            "Couldn't open Google. Try again, or use your email and password.",
        );
    });

    it("says it is the connection when it is", () => {
        expect(socialErrorCopy("Google", { code: NETWORK_ERROR })).toBe(
            "Couldn't reach Google. Check your connection and try again.",
        );
    });
});
