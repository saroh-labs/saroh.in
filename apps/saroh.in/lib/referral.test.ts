// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetAddress, takeAddress } from "./page-address";
import {
    keepReferral,
    keptReferral,
    REFERRAL_COOKIE,
    REFERRAL_DAYS,
    referralCookie,
    referralFromSearch,
    sharedDomain,
} from "./referral";

/**
 * The referral code a visitor arrived with, kept for the business they set
 * up later (DEC-156): only something shaped like a code, on the domain
 * accounts and the workspace share, for a stated time, the last link
 * winning, never from the waitlist page, and still found after the address
 * has been cut for the tags. The codes are made up.
 */
const ACCOUNTS = "https://accounts.saroh.in";
const open = (address: string) =>
    window.history.replaceState(null, "", address);
const forget = () => {
    document.cookie = `${REFERRAL_COOKIE}=; Max-Age=0; Path=/`;
};

beforeEach(() => {
    resetAddress();
    forget();
    open("/");
});
afterEach(() => {
    resetAddress();
    forget();
});

describe("the code in a page's address", () => {
    it("is read, trimmed and lower-cased", () => {
        expect(referralFromSearch("?ref=abcd2345")).toBe("abcd2345");
        expect(referralFromSearch("?src=site&ref=ABCD2345")).toBe("abcd2345");
    });

    it.each([
        "",
        "?src=site",
        "?ref=",
        "?ref=abc",
        "?ref=abcd23456",
        // 0, 1, i, l and o are left out of the alphabet.
        "?ref=abcd0345",
        "?ref=abcdefgl",
        "?ref=you@example.com",
        "?ref=%3Cscript%3E",
    ])("is nothing for %j", (search) => {
        expect(referralFromSearch(search)).toBeNull();
    });
});

describe("the domain the cookie is set on", () => {
    it.each([
        ["www.saroh.in", "accounts.saroh.in", "saroh.in"],
        ["saroh.in", "accounts.saroh.in", "saroh.in"],
        ["saroh.io", "accounts.saroh.io", "saroh.io"],
        ["www.saroh.localhost", "accounts.saroh.localhost", "saroh.localhost"],
        ["saroh.localhost", "accounts.saroh.localhost", "saroh.localhost"],
    ])("for %s with accounts at %s is %s", (host, accounts, domain) => {
        expect(sharedDomain(host, accounts)).toBe(domain);
    });

    it.each([
        // A preview on a host of its own shares nothing with accounts.
        ["saroh-web.example.workers.dev", "accounts.saroh.io"],
        ["localhost", "accounts.saroh.localhost"],
        // Not a suffix match on letters alone.
        ["saroh.in", "accounts.notsaroh.in"],
    ])(
        "for %s with accounts at %s is the page's own host",
        (host, accounts) => {
            expect(sharedDomain(host, accounts)).toBeNull();
        },
    );
});

describe("the cookie", () => {
    it("is the code, for the stated time, on the shared domain, never cross-site", () => {
        expect(
            referralCookie("abcd2345", {
                host: "www.saroh.in",
                accountsHost: "accounts.saroh.in",
                secure: true,
            }),
        ).toBe(
            `saroh_ref=abcd2345; Max-Age=${REFERRAL_DAYS * 86400}; Path=/; Domain=saroh.in; SameSite=Lax; Secure`,
        );
    });

    it("names no domain where accounts doesn't share one, and isn't Secure over http", () => {
        expect(
            referralCookie("abcd2345", {
                host: "localhost",
                accountsHost: "accounts.saroh.localhost",
                secure: false,
            }),
        ).toBe(
            `saroh_ref=abcd2345; Max-Age=${REFERRAL_DAYS * 86400}; Path=/; SameSite=Lax`,
        );
    });

    it("is read back from among the others", () => {
        expect(keptReferral("a=1; saroh_ref=abcd2345; saroh_team=1")).toBe(
            "abcd2345",
        );
        expect(keptReferral("saroh_team=1")).toBeNull();
        expect(keptReferral("")).toBeNull();
    });

    it("is nothing when it holds something that isn't a code", () => {
        expect(keptReferral("saroh_ref=<script>")).toBeNull();
        expect(keptReferral("saroh_ref=")).toBeNull();
        expect(keptReferral("not_saroh_ref=abcd2345")).toBeNull();
    });
});

describe("keeping the code a visitor arrived with", () => {
    // jsdom serves the tests from localhost, which shares no domain with
    // accounts, so the cookie is set on the page's own host.
    it("keeps it from the page they land on", () => {
        open("/?ref=abcd2345");
        keepReferral(ACCOUNTS);
        expect(keptReferral(document.cookie)).toBe("abcd2345");
    });

    it("keeps it from any page but the waitlist", () => {
        open("/pricing?src=site&ref=abcd2345");
        keepReferral(ACCOUNTS);
        expect(keptReferral(document.cookie)).toBe("abcd2345");
    });

    it("leaves the waitlist page's own ?ref= alone: that is an entrant's id", () => {
        open("/waitlist?ref=abcd2345");
        keepReferral(ACCOUNTS);
        expect(keptReferral(document.cookie)).toBeNull();
    });

    it("keeps nothing from a link with no code, or a malformed one", () => {
        for (const address of ["/", "/?ref=nope", "/?ref=you@example.com"]) {
            open(address);
            keepReferral(ACCOUNTS);
        }
        expect(document.cookie).not.toContain(REFERRAL_COOKIE);
    });

    it("lets the last link win", () => {
        open("/?ref=abcd2345");
        keepReferral(ACCOUNTS);
        open("/?ref=wxyz6789");
        keepReferral(ACCOUNTS);
        expect(keptReferral(document.cookie)).toBe("wxyz6789");
    });

    it("keeps what it has when a later page has no code", () => {
        open("/?ref=abcd2345");
        keepReferral(ACCOUNTS);
        open("/pricing");
        keepReferral(ACCOUNTS);
        expect(keptReferral(document.cookie)).toBe("abcd2345");
    });

    it("still finds it after the address was cut for the tags (DEC-127)", () => {
        open("/?ref=abcd2345&utm_source=site");
        takeAddress();
        expect(window.location.search).toBe("?utm_source=site");

        keepReferral(ACCOUNTS);

        expect(keptReferral(document.cookie)).toBe("abcd2345");
        // And keeping it puts nothing back in the address a tag reads.
        expect(window.location.href).not.toContain("abcd2345");
    });

    it("keeps nothing, quietly, when the accounts address isn't one", () => {
        open("/?ref=abcd2345");
        expect(() => keepReferral("not an address")).not.toThrow();
        expect(keptReferral(document.cookie)).toBeNull();
    });
});
