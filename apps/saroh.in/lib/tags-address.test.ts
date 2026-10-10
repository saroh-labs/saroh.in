// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "./analytics";
import { writeConsent } from "./consent";
import type { TagConfig } from "./ga";
import { readAddress } from "./page-address";
import { fireConversion, NOTHING_ALLOWED, resetTags, syncTags } from "./tags";

/**
 * The address a tag can read (DEC-127): cut back to the allow-list
 * (`lib/page-address.ts`) before Google's tag or the Meta Pixel is added to
 * the page, and kept that way as the page changes, so another entrant's
 * referral id, an invitation, an email or a token never reaches either.
 * The ids, the referral and the address are made up.
 */
const CONFIG: TagConfig = {
    gaId: "G-TEST123",
    adsId: "AW-123456789",
    adsWaitlistLabel: "waitLabel",
    pixelId: "1234567890",
};
const BOTH = { analytics: true, ads: true };
const SECRETS = ["hjkmnpqr", "asha", "inviteTok", "tokenTok", "nextTok"];
const ARRIVED =
    "/waitlist?plan=grow&src=referral&ref=hjkmnpqr&email=asha%40example.com&invite=inviteTok&token=tokenTok&next=nextTok&utm_source=instagram&gclid=G1&fbclid=F1";
const CUT =
    "/waitlist?plan=grow&src=referral&utm_source=instagram&gclid=G1&fbclid=F1";

const shown = () => window.location.pathname + window.location.search;
const layer = () =>
    (window.dataLayer ?? []).map((e) => Array.from(e as ArrayLike<unknown>));
const pixel = () => (window.fbq?.queue ?? []) as unknown[][];
const scripts = () =>
    Array.from(document.querySelectorAll("script")).map((s) => s.src);
/** Everything a tag has been handed, or could read from the page. */
const everything = () =>
    JSON.stringify([layer(), pixel(), scripts(), window.location.href]);

beforeEach(() => {
    resetTags();
    writeConsent(null);
    window.localStorage.clear();
    window.history.replaceState(null, "", ARRIVED);
});
afterEach(() => {
    vi.restoreAllMocks();
    resetTags();
});

describe("the address is cut before any tag loads", () => {
    it("is already cut when each tag's script is added and each call is queued", () => {
        const seen: string[] = [];
        const append = document.head.appendChild.bind(document.head);
        vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
            seen.push(window.location.href);
            return append(node);
        });

        syncTags(CONFIG, BOTH);

        // Google's tag and the Pixel: two scripts, both after the cut.
        expect(seen).toHaveLength(2);
        for (const href of seen)
            expect(href).toBe(`${window.location.origin}${CUT}`);
        expect(shown()).toBe(CUT);
        for (const secret of SECRETS) {
            expect(everything()).not.toContain(secret);
            expect(seen.join(" ")).not.toContain(secret);
        }
    });

    it("keeps campaign data and the page's own choices", () => {
        syncTags(CONFIG, BOTH);
        const query = new URLSearchParams(window.location.search);
        expect(Object.fromEntries(query)).toEqual({
            plan: "grow",
            src: "referral",
            utm_source: "instagram",
            gclid: "G1",
            fbclid: "F1",
        });
    });

    it("still lets the page read what was cut", () => {
        syncTags(CONFIG, BOTH);
        const query = new URLSearchParams(readAddress());
        expect(query.get("ref")).toBe("hjkmnpqr");
        expect(query.get("plan")).toBe("grow");
    });

    it("cuts it for visit counts alone, and for advertising alone", () => {
        syncTags(CONFIG, { analytics: true, ads: false });
        expect(shown()).toBe(CUT);

        resetTags();
        window.history.replaceState(null, "", ARRIVED);
        syncTags(CONFIG, { analytics: false, ads: true });
        expect(shown()).toBe(CUT);
    });

    it("leaves the address alone while nothing is allowed: no tag is there to read it", () => {
        syncTags(CONFIG, NOTHING_ALLOWED);
        expect(shown()).toBe(ARRIVED);
        expect(scripts()).toEqual([]);

        // Accepting later cuts it before the tags arrive.
        syncTags(CONFIG, BOTH);
        expect(shown()).toBe(CUT);
        for (const secret of SECRETS)
            expect(everything()).not.toContain(secret);
    });
});

describe("and stays cut", () => {
    it("cuts every later address as it is set, before a tag's listener can read it", () => {
        syncTags(CONFIG, BOTH);
        // What Google's tag and the Pixel do: wrap pushState and read the
        // address once the page has changed.
        const read: string[] = [];
        const inner = window.history.pushState.bind(window.history);
        window.history.pushState = (...args) => {
            inner(...args);
            read.push(window.location.href);
        };

        window.history.pushState(null, "", "/waitlist?ref=zzzzzzzz&src=nav");
        window.history.pushState(null, "", "/customers?site=shop.example");

        expect(read).toEqual([
            `${window.location.origin}/waitlist?src=nav`,
            `${window.location.origin}/customers`,
        ]);
        expect(readAddress()).toBe("?site=shop.example");
    });

    it("names the cut address in every event sent to Google", () => {
        syncTags(CONFIG, BOTH);
        track("referral_copy", {});
        fireConversion("waitlist_joined");
        const events = layer().filter((e) => e[0] === "event");
        expect(events).toHaveLength(2);
        for (const event of events)
            expect(event[2]).toMatchObject({
                page_location: `${window.location.origin}${CUT}`,
            });
        for (const secret of SECRETS)
            expect(everything()).not.toContain(secret);
    });
});
