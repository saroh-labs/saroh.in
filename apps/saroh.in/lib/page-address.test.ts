// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/unbound-method -- the tests swap the
   browser's own storage and history functions and compare them by identity. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    cleanUrl,
    guardHistory,
    mayStay,
    readAddress,
    resetAddress,
    splitSearch,
    takeAddress,
} from "./page-address";

/**
 * What a tag may see of a page's address (DEC-127): one allow-list, the
 * rest cut from the address itself, and the page still able to read what
 * was cut. The ids and addresses are made up.
 */
const open = (address: string) =>
    window.history.replaceState(null, "", address);
const shown = () =>
    window.location.pathname + window.location.search + window.location.hash;

beforeEach(() => {
    resetAddress();
    open("/");
});
afterEach(() => resetAddress());

describe("the allow-list", () => {
    it.each([
        "plan",
        "src",
        "template",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "utm_id",
        "gclid",
        "gbraid",
        "wbraid",
        "fbclid",
    ])("keeps %s: the page's own choice, or campaign data", (name) => {
        expect(mayStay(name, "value")).toBe(true);
    });

    it.each([
        "ref",
        "invite",
        "email",
        "token",
        "next",
        "site",
        "url",
        "at",
        "redirect",
        "phone",
        "name",
        "something_new",
        "UTM_SOURCE",
        "utm_",
        "utm_1",
        "",
    ])("cuts %s: about someone else, or nobody has allowed it", (name) => {
        expect(mayStay(name, "value")).toBe(false);
    });

    it("cuts an allowed parameter that holds an email address", () => {
        expect(mayStay("utm_content", "asha@example.com")).toBe(false);
        expect(mayStay("src", "asha%40example.com")).toBe(true);
        expect(splitSearch("?src=asha%40example.com")).toEqual({
            kept: "",
            cut: "src=asha%40example.com",
        });
    });
});

describe("splitSearch", () => {
    it("splits a query into what stays and what is cut, in order", () => {
        expect(
            splitSearch(
                "?plan=grow&ref=hjkmnpqr&src=pricing&email=asha%40example.com&utm_source=instagram&invite=abc&token=t&next=%2Fapps&fbclid=F1&gclid=G1&template=gym",
            ),
        ).toEqual({
            kept: "plan=grow&src=pricing&utm_source=instagram&fbclid=F1&gclid=G1&template=gym",
            cut: "ref=hjkmnpqr&email=asha%40example.com&invite=abc&token=t&next=%2Fapps",
        });
    });

    it("is empty for no query, and cuts nothing from a clean one", () => {
        expect(splitSearch("")).toEqual({ kept: "", cut: "" });
        expect(splitSearch("?plan=pro&src=nav")).toEqual({
            kept: "plan=pro&src=nav",
            cut: "",
        });
    });

    it("cuts every copy of a repeated parameter", () => {
        expect(splitSearch("?ref=a&ref=b&src=x").cut).toBe("ref=a&ref=b");
    });
});

describe("cleanUrl", () => {
    it("is the page and what may stay, with no fragment", () => {
        expect(
            cleanUrl(
                "https://www.saroh.in/waitlist?ref=hjkmnpqr&plan=grow&utm_campaign=launch#form",
            ),
        ).toBe("https://www.saroh.in/waitlist?plan=grow&utm_campaign=launch");
        expect(
            cleanUrl("https://www.saroh.in/customers?site=shop.example"),
        ).toBe("https://www.saroh.in/customers");
        expect(cleanUrl("https://www.saroh.in/")).toBe("https://www.saroh.in/");
    });
});

describe("takeAddress and readAddress", () => {
    it("cuts the address bar and still gives the page its whole query", () => {
        open("/waitlist?plan=grow&src=pricing&ref=hjkmnpqr#form");
        takeAddress();
        expect(shown()).toBe("/waitlist?plan=grow&src=pricing#form");
        expect(new URLSearchParams(readAddress()).get("ref")).toBe("hjkmnpqr");
        expect(new URLSearchParams(readAddress()).get("plan")).toBe("grow");
    });

    it("reads the address as it is when nothing has been cut", () => {
        open("/waitlist?plan=grow&ref=hjkmnpqr");
        expect(readAddress()).toBe("?plan=grow&ref=hjkmnpqr");
        open("/pricing");
        expect(readAddress()).toBe("");
    });

    it("leaves a clean address alone, and keeps the page's history state", () => {
        window.history.replaceState({ mine: 1 }, "", "/waitlist?ref=a&src=x");
        takeAddress();
        expect(window.history.state).toEqual({ mine: 1 });
        const before = shown();
        takeAddress();
        expect(shown()).toBe(before);
    });

    it("still knows what was cut after a reload of the cut address", () => {
        open("/waitlist?ref=hjkmnpqr&src=referral");
        takeAddress();
        // A reload: the address is the cut one, the tab's storage is kept.
        open("/waitlist?src=referral");
        expect(new URLSearchParams(readAddress()).get("ref")).toBe("hjkmnpqr");
    });

    it("keeps what was cut by page, and the address wins where both speak", () => {
        open("/waitlist?ref=first&src=referral");
        takeAddress();
        open("/customers");
        expect(readAddress()).toBe("");
        open("/waitlist?ref=second&plan=pro");
        expect(new URLSearchParams(readAddress()).get("ref")).toBe("second");
        expect(new URLSearchParams(readAddress()).get("plan")).toBe("pro");
    });

    it("works where the browser blocks storage", () => {
        const storage = Object.getPrototypeOf(window.sessionStorage) as Storage;
        const get = storage.getItem;
        const set = storage.setItem;
        storage.getItem = () => {
            throw new Error("blocked");
        };
        storage.setItem = () => {
            throw new Error("blocked");
        };
        try {
            open("/waitlist?ref=hjkmnpqr");
            takeAddress();
            expect(shown()).toBe("/waitlist");
            expect(readAddress()).toBe("?ref=hjkmnpqr");
        } finally {
            storage.getItem = get;
            storage.setItem = set;
        }
    });
});

describe("guardHistory", () => {
    it("cuts an address as it is pushed or replaced, and keeps what it cut", () => {
        guardHistory();
        window.history.pushState(null, "", "/waitlist?ref=hjkmnpqr&plan=grow");
        expect(shown()).toBe("/waitlist?plan=grow");
        expect(new URLSearchParams(readAddress()).get("ref")).toBe("hjkmnpqr");

        window.history.replaceState(
            null,
            "",
            "/tools/link-preview?url=https%3A%2F%2Fshop.example#report",
        );
        expect(shown()).toBe("/tools/link-preview#report");
        expect(readAddress()).toBe("?url=https%3A%2F%2Fshop.example");
    });

    it("passes a clean address, and a call with no address, straight through", () => {
        guardHistory();
        window.history.pushState({ a: 1 }, "", "/pricing?plan=pro&src=nav#faq");
        expect(shown()).toBe("/pricing?plan=pro&src=nav#faq");
        window.history.replaceState({ b: 2 }, "");
        expect(shown()).toBe("/pricing?plan=pro&src=nav#faq");
        expect(window.history.state).toEqual({ b: 2 });
    });

    it("is put on once, and taken off again", () => {
        const push = window.history.pushState;
        guardHistory();
        const guarded = window.history.pushState;
        guardHistory();
        expect(window.history.pushState).toBe(guarded);
        resetAddress();
        expect(window.history.pushState).toBe(push);
    });
});
