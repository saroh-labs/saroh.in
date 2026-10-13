import { describe, expect, it } from "vitest";

import {
    carriedReferral,
    REFERRAL_COOKIE,
    referralCookieDomain,
} from "./referral-carry";

/**
 * The referral code setup takes from the browser's cookie (DEC-156): sent
 * only when shaped like a code, and cleared on the domain saroh.in set it
 * on. The codes are made up.
 */
describe("the cookie saroh.in sets", () => {
    it("has the name saroh.in gives it", () => {
        // `apps/saroh.in/lib/referral.ts`: change one, change both.
        expect(REFERRAL_COOKIE).toBe("saroh_ref");
    });
});

describe("the code that goes to the API", () => {
    it("is the cookie's value, trimmed and lower-cased", () => {
        expect(carriedReferral("abcd2345")).toBe("abcd2345");
        expect(carriedReferral(" ABCD2345 ")).toBe("abcd2345");
    });

    it.each([
        undefined,
        "",
        "abc",
        "abcd23456",
        // 0, 1, i, l and o are left out of the alphabet.
        "abcd0345",
        "abcdefgl",
        "you@example.com",
        "a".repeat(5000),
    ])("is nothing for %j, so a bad cookie never stops a setup", (value) => {
        expect(carriedReferral(value)).toBeUndefined();
    });
});

describe("the domain the cookie is cleared on", () => {
    it.each([
        ["app.saroh.in", "saroh.in"],
        ["app.saroh.io", "saroh.io"],
        ["app.saroh.localhost", "saroh.localhost"],
        ["APP.Saroh.In:443", "saroh.in"],
    ])("for %s is %s", (host, domain) => {
        expect(referralCookieDomain(host)).toBe(domain);
    });

    it.each([null, "", "localhost", "localhost:3000", "saroh.in", "127.0.0.1"])(
        "is the app's own host for %j",
        (host) => {
            expect(referralCookieDomain(host)).toBeUndefined();
        },
    );
});
