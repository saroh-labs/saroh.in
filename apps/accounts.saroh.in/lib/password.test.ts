import { describe, expect, it, vi } from "vitest";

import type { PasswordClient } from "./password";
import { hasPassword, passwordProblem, setFirstPassword } from "./password";

/** A password is optional, and the first one is set with an emailed code. */

function client(over: Partial<PasswordClient> = {}): PasswordClient {
    return {
        askForCode: vi.fn().mockResolvedValue({ error: null }),
        setWithCode: vi.fn().mockResolvedValue({ error: null }),
        signIn: vi.fn().mockResolvedValue({ error: null }),
        ...over,
    };
}

describe("hasPassword", () => {
    it("is true only with a credential account linked", () => {
        expect(hasPassword([{ providerId: "credential" }])).toBe(true);
        expect(
            hasPassword([
                { providerId: "google" },
                { providerId: "credential" },
            ]),
        ).toBe(true);
        // Made with a code: nothing linked. Made with Google: only Google.
        expect(hasPassword([])).toBe(false);
        expect(hasPassword([{ providerId: "google" }])).toBe(false);
    });

    it("does not guess when the list could not be read", () => {
        expect(hasPassword(null)).toBeNull();
        expect(hasPassword(undefined)).toBeNull();
    });
});

describe("passwordProblem", () => {
    it("wants eight characters, typed the same twice", () => {
        expect(passwordProblem("short", "short")).toBe(
            "That password is too short. Use eight characters or more.",
        );
        expect(passwordProblem("long-enough", "long-enoug")).toBe(
            "Those two passwords don't match. Type them again.",
        );
        expect(passwordProblem("long-enough", "long-enough")).toBeNull();
    });
});

describe("setFirstPassword", () => {
    const input = {
        email: "asha@example.com",
        code: "039 147",
        password: "long-enough",
    };

    it("sets it with the code, then signs this device back in", async () => {
        const c = client();
        expect(await setFirstPassword(c, input)).toEqual({
            ok: true,
            signedIn: true,
        });
        expect(c.setWithCode).toHaveBeenCalledWith({
            email: "asha@example.com",
            code: "039147",
            password: "long-enough",
        });
        expect(c.signIn).toHaveBeenCalledWith({
            email: "asha@example.com",
            password: "long-enough",
        });
    });

    it("a wrong code sets nothing and signs nobody in", async () => {
        const c = client({
            setWithCode: vi
                .fn()
                .mockResolvedValue({ error: { code: "INVALID_OTP" } }),
        });
        expect(await setFirstPassword(c, input)).toEqual({
            ok: false,
            message: "That code isn't right. Check the email and try again.",
        });
        expect(c.signIn).not.toHaveBeenCalled();
    });

    it("says so when the password is set but signing back in failed", async () => {
        const c = client({
            signIn: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
        });
        expect(await setFirstPassword(c, input)).toEqual({
            ok: true,
            signedIn: false,
        });
    });

    it("never shows the library's message", async () => {
        const c = client({
            setWithCode: vi.fn().mockResolvedValue({
                error: { code: "WHO_KNOWS", message: "internal" },
            }),
        });
        expect(await setFirstPassword(c, input)).toEqual({
            ok: false,
            message: "Couldn't set your password. Try again.",
        });
    });
});
