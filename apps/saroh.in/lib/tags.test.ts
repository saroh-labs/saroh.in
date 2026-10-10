// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { track } from "./analytics";
import { writeChoices, writeConsent } from "./consent";
import type { TagConfig } from "./ga";
import {
    allowedNow,
    analyticsDestination,
    fireConversion,
    NOTHING_ALLOWED,
    resetTags,
    syncTags,
} from "./tags";

/**
 * The tags saroh.in loads (DEC-127): nothing before it is allowed, Google
 * Consent Mode v2 in the documented order, taking consent back stops both,
 * and each conversion goes once and only where its id is set. The ids and
 * labels are made up.
 */
const GA = "G-TEST123";
const ADS = "AW-123456789";
const PIXEL = "1234567890";
const ALL: TagConfig = {
    gaId: GA,
    adsId: ADS,
    adsWaitlistLabel: "waitLabel",
    adsSignupLabel: "signLabel",
    pixelId: PIXEL,
};
const BOTH = { analytics: true, ads: true };

const scripts = () =>
    Array.from(document.querySelectorAll("script")).map((s) => s.src);
const googleScript = () =>
    scripts().filter((s) => s.startsWith("https://www.googletagmanager.com"));
const metaScript = () =>
    scripts().filter((s) => s.startsWith("https://connect.facebook.net"));
/** Everything pushed to Google's tag, as plain arrays. */
const layer = () =>
    (window.dataLayer ?? []).map((entry) =>
        Array.from(entry as ArrayLike<unknown>),
    );
const pixelCalls = () => (window.fbq?.queue ?? []) as unknown[][];
const DENIED = {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
};

function setCookie(value: string) {
    document.cookie = `${value}; path=/`;
}

function expireCookies() {
    for (const part of document.cookie.split(";")) {
        const name = part.split("=")[0]?.trim();
        if (name)
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
}

beforeEach(() => {
    resetTags();
    writeConsent(null);
    window.localStorage.clear();
    expireCookies();
});
afterEach(() => vi.unstubAllGlobals());

describe("syncTags: nothing loads until it is allowed", () => {
    it("loads no script and defines no tag when nothing is allowed", () => {
        syncTags(ALL, NOTHING_ALLOWED);
        expect(scripts()).toEqual([]);
        expect(window.gtag).toBeUndefined();
        expect(window.dataLayer).toBeUndefined();
        expect(window.fbq).toBeUndefined();
    });

    it("loads nothing without an id, whatever is allowed", () => {
        syncTags({}, BOTH);
        expect(scripts()).toEqual([]);
        expect(window.gtag).toBeUndefined();
        expect(window.fbq).toBeUndefined();
        expect(fireConversion("waitlist_joined")).toEqual({
            google: false,
            meta: false,
        });
    });

    it("visit counts alone load Google's tag for Analytics, with every ad consent denied, and no Pixel", () => {
        syncTags(ALL, { analytics: true, ads: false });
        expect(googleScript()).toEqual([
            `https://www.googletagmanager.com/gtag/js?id=${GA}`,
        ]);
        expect(metaScript()).toEqual([]);
        expect(window.fbq).toBeUndefined();
        expect(layer()).toEqual([
            ["consent", "default", DENIED],
            ["consent", "update", { ...DENIED, analytics_storage: "granted" }],
            ["js", expect.any(Date)],
            ["config", GA],
        ]);
    });

    it("advertising alone loads Google Ads and the Pixel, and never configures Analytics", () => {
        syncTags(ALL, { analytics: false, ads: true });
        expect(googleScript()).toEqual([
            `https://www.googletagmanager.com/gtag/js?id=${ADS}`,
        ]);
        expect(metaScript()).toEqual([
            "https://connect.facebook.net/en_US/fbevents.js",
        ]);
        expect(layer()).toEqual([
            ["consent", "default", DENIED],
            [
                "consent",
                "update",
                {
                    ad_storage: "granted",
                    ad_user_data: "granted",
                    ad_personalization: "granted",
                    analytics_storage: "denied",
                },
            ],
            ["js", expect.any(Date)],
            ["config", ADS, { allow_enhanced_conversions: false }],
        ]);
        expect(analyticsDestination()).toBeNull();
    });

    it("sets consent before anything that measures: default, update, then config", () => {
        syncTags(ALL, BOTH);
        const order = layer().map((e) => `${String(e[0])} ${String(e[1])}`);
        expect(order.slice(0, 2)).toEqual([
            "consent default",
            "consent update",
        ]);
        expect(order.indexOf("config " + GA)).toBeGreaterThan(1);
        expect(order.indexOf("config " + ADS)).toBeGreaterThan(1);
    });

    it("gives the Pixel the id alone: consent granted, automatic reading off, no advanced matching", () => {
        syncTags(ALL, BOTH);
        expect(pixelCalls()).toEqual([
            ["consent", "grant"],
            ["set", "autoConfig", false, PIXEL],
            ["init", PIXEL],
            ["track", "PageView"],
        ]);
    });

    it("loads each script once however often it is asked", () => {
        syncTags(ALL, BOTH);
        syncTags(ALL, BOTH);
        syncTags(ALL, BOTH);
        expect(googleScript()).toHaveLength(1);
        expect(metaScript()).toHaveLength(1);
        expect(layer().filter((e) => e[0] === "config")).toHaveLength(2);
        expect(pixelCalls().filter((c) => c[0] === "init")).toHaveLength(1);
    });

    it("a Pixel without Google Ads leaves Google's ad consent denied", () => {
        syncTags({ gaId: GA, pixelId: PIXEL }, BOTH);
        expect(layer()[1]).toEqual([
            "consent",
            "update",
            { ...DENIED, analytics_storage: "granted" },
        ]);
        expect(metaScript()).toHaveLength(1);
    });
});

describe("syncTags: taking consent back", () => {
    it("tells Google every consent is denied, switches Analytics off, revokes the Pixel and clears the cookies", () => {
        syncTags(ALL, BOTH);
        setCookie("_ga=GA1.1");
        setCookie("_ga_TEST123=GS1");
        setCookie("_gcl_au=1.1");
        setCookie("_gcl_aw=GCL.1");
        setCookie("_fbp=fb.1");
        setCookie("_fbc=fb.2");
        setCookie("session=keep");

        syncTags(ALL, NOTHING_ALLOWED);

        expect(layer().at(-1)).toEqual(["consent", "update", DENIED]);
        expect(
            (window as unknown as Record<string, unknown>)[`ga-disable-${GA}`],
        ).toBe(true);
        expect(pixelCalls().at(-1)).toEqual(["consent", "revoke"]);
        expect(document.cookie).toBe("session=keep");
        expect(analyticsDestination()).toBeNull();
    });

    it("sends no conversion and no Analytics event once it is taken back", () => {
        syncTags(ALL, BOTH);
        syncTags(ALL, NOTHING_ALLOWED);
        const before = { google: layer().length, meta: pixelCalls().length };
        expect(fireConversion("waitlist_joined")).toEqual({
            google: false,
            meta: false,
        });
        track("referral_copy", {});
        expect(layer()).toHaveLength(before.google);
        expect(pixelCalls()).toHaveLength(before.meta);
    });

    it("refusing advertising alone keeps visit counts and stops the ad tags", () => {
        syncTags(ALL, BOTH);
        setCookie("_ga=GA1.1");
        setCookie("_fbp=fb.1");
        syncTags(ALL, { analytics: true, ads: false });
        expect(layer().at(-1)).toEqual([
            "consent",
            "update",
            { ...DENIED, analytics_storage: "granted" },
        ]);
        expect(pixelCalls().at(-1)).toEqual(["consent", "revoke"]);
        expect(document.cookie).toBe("_ga=GA1.1");
        expect(analyticsDestination()).toBe(GA);
        expect(
            (window as unknown as Record<string, unknown>)[`ga-disable-${GA}`],
        ).toBe(false);
    });

    it("accepting again grants again, without a second script", () => {
        syncTags(ALL, BOTH);
        syncTags(ALL, NOTHING_ALLOWED);
        syncTags(ALL, BOTH);
        expect(layer().at(-1)?.[1]).toBe("update");
        expect(layer().at(-1)?.[2]).toMatchObject({ ad_storage: "granted" });
        expect(pixelCalls().at(-1)).toEqual(["consent", "grant"]);
        expect(googleScript()).toHaveLength(1);
        expect(metaScript()).toHaveLength(1);
    });
});

describe("allowedNow: who is never tagged", () => {
    const accept = () => writeChoices({ analytics: "granted", ads: "granted" });

    it("is the visitor's own answers", () => {
        expect(allowedNow()).toEqual(NOTHING_ALLOWED);
        writeChoices({ analytics: "granted", ads: "refused" });
        expect(allowedNow()).toEqual({ analytics: true, ads: false });
        accept();
        expect(allowedNow()).toEqual(BOTH);
    });

    it("having accepted visit counts is not having accepted advertising", () => {
        writeConsent("granted");
        expect(allowedNow()).toEqual({ analytics: true, ads: false });
    });

    it("allows nothing in a team browser, whatever was accepted", () => {
        accept();
        setCookie("saroh_team=1");
        expect(allowedNow()).toEqual(NOTHING_ALLOWED);
    });

    it("reads Global Privacy Control as a refusal", () => {
        accept();
        vi.stubGlobal("navigator", { globalPrivacyControl: true });
        expect(allowedNow()).toEqual(NOTHING_ALLOWED);
    });

    it("reads Do Not Track as a refusal", () => {
        accept();
        vi.stubGlobal("navigator", { doNotTrack: "1" });
        expect(allowedNow()).toEqual(NOTHING_ALLOWED);
    });
});

describe("fireConversion", () => {
    it("tells Google Ads and Meta that someone joined the waitlist, and nothing else", () => {
        syncTags(ALL, BOTH);
        const before = { google: layer().length, meta: pixelCalls().length };
        expect(fireConversion("waitlist_joined")).toEqual({
            google: true,
            meta: true,
        });
        expect(layer().slice(before.google)).toEqual([
            ["event", "conversion", { send_to: `${ADS}/waitLabel` }],
        ]);
        expect(pixelCalls().slice(before.meta)).toEqual([["track", "Lead"]]);
    });

    it("tells them a sign-up finished, with only its stamp", () => {
        syncTags(ALL, BOTH);
        const before = { google: layer().length, meta: pixelCalls().length };
        fireConversion("sign_up_completed", { id: "1760000000000" });
        expect(layer().slice(before.google)).toEqual([
            [
                "event",
                "conversion",
                {
                    send_to: `${ADS}/signLabel`,
                    transaction_id: "1760000000000",
                },
            ],
        ]);
        expect(pixelCalls().slice(before.meta)).toEqual([
            ["track", "CompleteRegistration", {}, { eventID: "1760000000000" }],
        ]);
    });

    it("sends a stamped conversion once, however often it is asked, and across a reload", () => {
        syncTags(ALL, BOTH);
        const sent = () =>
            layer().filter((e) => e[0] === "event" && e[1] === "conversion")
                .length;
        fireConversion("sign_up_completed", { id: "1760000000000" });
        fireConversion("sign_up_completed", { id: "1760000000000" });
        expect(sent()).toBe(1);

        // A reload: the page's memory is gone, the browser's is not.
        resetTags();
        syncTags(ALL, BOTH);
        expect(
            fireConversion("sign_up_completed", { id: "1760000000000" }),
        ).toEqual({ google: false, meta: false });
        expect(sent()).toBe(0);
    });

    it("sends nothing before advertising cookies are accepted", () => {
        syncTags(ALL, { analytics: true, ads: false });
        const before = layer().length;
        expect(fireConversion("waitlist_joined")).toEqual({
            google: false,
            meta: false,
        });
        expect(layer()).toHaveLength(before);
        expect(window.fbq).toBeUndefined();
    });

    it("tells only the platform whose id is set", () => {
        syncTags({ pixelId: PIXEL }, BOTH);
        expect(fireConversion("waitlist_joined")).toEqual({
            google: false,
            meta: true,
        });
        expect(window.gtag).toBeUndefined();

        resetTags();
        syncTags({ adsId: ADS, adsWaitlistLabel: "waitLabel" }, BOTH);
        expect(fireConversion("waitlist_joined")).toEqual({
            google: true,
            meta: false,
        });
        expect(window.fbq).toBeUndefined();
    });

    it("doesn't tell Google Ads of a conversion with no label", () => {
        syncTags({ adsId: ADS, pixelId: PIXEL }, BOTH);
        const before = layer().length;
        expect(fireConversion("sign_up_completed", { id: "1" })).toEqual({
            google: false,
            meta: true,
        });
        expect(layer()).toHaveLength(before);
    });

    it("never carries a person: no email, phone or name can be passed", () => {
        syncTags(ALL, BOTH);
        fireConversion("waitlist_joined");
        fireConversion("sign_up_completed", { id: "1760000000000" });
        const sent = JSON.stringify([layer(), pixelCalls()]);
        expect(sent).not.toMatch(/email|phone|name|@/i);
        expect(sent).not.toContain('allow_enhanced_conversions":true');
    });
});

describe("track: Google Analytics events", () => {
    it("names Analytics as the destination, so the Ads account never gets one", () => {
        syncTags(ALL, BOTH);
        track("pricing_toggle", { control: "gst", value: true });
        expect(layer().at(-1)).toEqual([
            "event",
            "pricing_toggle",
            { control: "gst", value: true, send_to: GA },
        ]);
    });

    it("sends nothing when only advertising was accepted", () => {
        syncTags(ALL, { analytics: false, ads: true });
        const before = layer().length;
        track("referral_copy", {});
        expect(layer()).toHaveLength(before);
    });
});
