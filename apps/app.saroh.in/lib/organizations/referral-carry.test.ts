import { describe, expect, it } from "vitest";

import {
    carriedManagerLink,
    carriedReferral,
    MANAGER_COOKIE,
    managerCodeProblem,
    REFERRAL_COOKIE,
    referralCookieDomain,
    typedManagerCode,
} from "./referral-carry";

/**
 * The referral code setup takes from the browser's cookie (DEC-156): sent
 * only when shaped like a code, and cleared on the domain saroh.in set it
 * on. The same for an account manager's link (DEC-169), with when it was
 * kept, and the code an owner typed. The codes are made up.
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

describe("an account manager's link (DEC-169)", () => {
    const AT = new Date("2026-11-29T09:00:00.000Z");
    const seconds = AT.getTime() / 1000;

    it("has the name saroh.in gives it", () => {
        // `apps/saroh.in/lib/referral.ts`: change one, change both.
        expect(MANAGER_COOKIE).toBe("saroh_am");
    });

    it("sends the code and when it was kept", () => {
        expect(carriedManagerLink(`ABCD2345.${seconds}`)).toEqual({
            managerLinkCode: "ABCD2345",
            managerLinkSetAt: AT.toISOString(),
        });
    });

    it("sends the code alone when the time isn't one", () => {
        expect(carriedManagerLink("ABCD2345")).toEqual({
            managerLinkCode: "ABCD2345",
        });
        expect(carriedManagerLink("ABCD2345.soon")).toEqual({
            managerLinkCode: "ABCD2345",
        });
    });

    it.each([
        undefined,
        "",
        "ABCD234.1764000000",
        "ABCD0345.1764000000",
        "you@example.com",
        "A".repeat(5000),
    ])("is nothing for %j, so a bad cookie never stops a setup", (value) => {
        expect(carriedManagerLink(value)).toBeUndefined();
    });
});

describe("a code the owner typed (DEC-169)", () => {
    it("is sent as stored, however it was typed", () => {
        expect(typedManagerCode("ABCD2345")).toBe("ABCD2345");
        expect(typedManagerCode(" abcd-2345 ")).toBe("ABCD2345");
        expect(typedManagerCode("abcd 2345")).toBe("ABCD2345");
    });

    it("is nothing when left empty, with nothing to say", () => {
        expect(typedManagerCode(undefined)).toBeUndefined();
        expect(typedManagerCode("  ")).toBeUndefined();
        expect(managerCodeProblem(undefined)).toBeNull();
        expect(managerCodeProblem("  ")).toBeNull();
        expect(managerCodeProblem("abcd-2345")).toBeNull();
    });

    it("says what a code looks like when it can't be one", () => {
        expect(typedManagerCode("ABCD0345")).toBeUndefined();
        expect(managerCodeProblem("ABCD0345")).toMatch(/8 letters and numbers/);
        expect(managerCodeProblem("hello")).toMatch(/8 letters and numbers/);
    });
});
