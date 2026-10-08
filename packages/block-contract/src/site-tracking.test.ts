import { describe, expect, it } from "vitest";

import {
    checkPrivacyUrl,
    checkTrackerId,
    checkVerificationCode,
    extractTrackerId,
    extractVerificationCode,
    looksSecret,
} from "./site-tracking";

describe("checkTrackerId (DEC-108)", () => {
    it("keeps each tool's public id", () => {
        expect(checkTrackerId("ga4", " G-ABC1234 ")).toEqual({
            ok: true,
            value: "G-ABC1234",
        });
        expect(checkTrackerId("google-ads", "AW-123456789").ok).toBe(true);
        expect(checkTrackerId("meta-pixel", "123456789012345").ok).toBe(true);
        expect(
            checkTrackerId(
                "posthog",
                "phc_abcdefghijklmnopqrstuvwxyz0123456789ABCD",
            ).ok,
        ).toBe(true);
        expect(checkTrackerId("clarity", "3t0wlogvdz").ok).toBe(true);
        expect(checkTrackerId("plausible", "pa-AbC_12-xyz").ok).toBe(true);
        expect(
            checkTrackerId("umami", "94db1cb1-74f4-4a40-ad6c-962362670409").ok,
        ).toBe(true);
    });

    it("refuses anything that isn't a bare id, so nothing can run", () => {
        for (const bad of [
            "G-<script>",
            'G-ABC" onload="x',
            "G-ABC1234;alert(1)",
            "javascript:alert(1)",
            "https://evil.example/x.js",
        ]) {
            expect(checkTrackerId("ga4", bad)).toEqual({
                ok: false,
                problem: "format",
            });
        }
        expect(
            checkTrackerId("umami", "https://umami.example/script.js"),
        ).toEqual({ ok: false, problem: "format" });
    });

    it("refuses Google Tag Manager in every field", () => {
        expect(checkTrackerId("ga4", "GTM-ABC123")).toEqual({
            ok: false,
            problem: "tag-manager",
        });
        expect(checkTrackerId("google-ads", "gtm-abc123").ok).toBe(false);
    });

    it("refuses secrets as secrets, before the format", () => {
        for (const secret of [
            "phx_abcdefghijklmnopqrstuvwxyz0123456789",
            "EAAGm0PX4ZCpsBAKZCZBabcdefghijklmnop",
            // Built at run time, so a secret scanner never reads a key shape here.
            ["sk", "live", "abcdef123456"].join("_"),
            "my api_key is 123",
            "Bearer abc.def.ghi",
            "secret=abc123",
        ]) {
            expect(checkTrackerId("posthog", secret)).toEqual({
                ok: false,
                problem: "secret",
            });
        }
    });

    it("calls an empty value empty", () => {
        expect(checkTrackerId("ga4", "   ")).toEqual({
            ok: false,
            problem: "empty",
        });
    });
});

describe("checkVerificationCode", () => {
    it("keeps each service's code", () => {
        expect(
            checkVerificationCode(
                "google",
                "abcDEF123_-ghiJKL456mnoPQR789stuVWX012yz",
            ).ok,
        ).toBe(true);
        expect(
            checkVerificationCode("bing", "0123456789ABCDEF0123456789ABCDEF")
                .ok,
        ).toBe(true);
        expect(
            checkVerificationCode("meta", "abcdefghij0123456789klmnopqrst").ok,
        ).toBe(true);
        expect(
            checkVerificationCode(
                "pinterest",
                "0123456789abcdef0123456789abcdef",
            ).ok,
        ).toBe(true);
    });

    it("refuses a whole tag or markup: only the code is stored", () => {
        expect(
            checkVerificationCode(
                "google",
                '<meta name="google-site-verification" content="abc">',
            ).ok,
        ).toBe(false);
        expect(checkVerificationCode("bing", "<script>").ok).toBe(false);
    });
});

describe("extractVerificationCode", () => {
    it("takes the code out of the tag a service gives", () => {
        expect(
            extractVerificationCode(
                "google",
                '<meta name="google-site-verification" content="abcDEF123_-ghiJKL456" />',
            ),
        ).toBe("abcDEF123_-ghiJKL456");
        expect(
            extractVerificationCode(
                "bing",
                "<meta content='0123456789ABCDEF0123456789ABCDEF' name='msvalidate.01'>",
            ),
        ).toBe("0123456789ABCDEF0123456789ABCDEF");
        expect(
            extractVerificationCode(
                "pinterest",
                '<meta name="p:domain_verify" content="0123456789abcdef0123456789abcdef"/>',
            ),
        ).toBe("0123456789abcdef0123456789abcdef");
    });

    it("leaves a bare code as it is", () => {
        expect(extractVerificationCode("meta", "  abc123  ")).toBe("abc123");
    });
});

describe("extractTrackerId", () => {
    it("takes the id out of each tool's snippet", () => {
        expect(
            extractTrackerId(
                "ga4",
                `<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234"></script>
<script>gtag('config', 'G-ABC1234');</script>`,
            ),
        ).toEqual({ id: "G-ABC1234" });
        expect(
            extractTrackerId(
                "meta-pixel",
                "<script>fbq('init', '123456789012345'); fbq('track', 'PageView');</script>",
            ),
        ).toEqual({ id: "123456789012345" });
        expect(
            extractTrackerId(
                "posthog",
                "posthog.init('phc_abcdefghijklmnopqrstuvwxyz0123', {api_host: 'https://eu.i.posthog.com'})",
            ),
        ).toEqual({ id: "phc_abcdefghijklmnopqrstuvwxyz0123", region: "eu" });
        expect(
            extractTrackerId(
                "clarity",
                `(function(c,l,a,r,i,t,y){t.src="https://www.clarity.ms/tag/"+i;})(window, document, "clarity", "script", "3t0wlogvdz");`,
            ),
        ).toEqual({ id: "3t0wlogvdz" });
        expect(
            extractTrackerId(
                "plausible",
                '<script async src="https://plausible.io/js/pa-AbC_12-xyz.js"></script>',
            ),
        ).toEqual({ id: "pa-AbC_12-xyz" });
        expect(
            extractTrackerId(
                "umami",
                '<script defer src="https://cloud.umami.is/script.js" data-website-id="94db1cb1-74f4-4a40-ad6c-962362670409"></script>',
            ),
        ).toEqual({ id: "94db1cb1-74f4-4a40-ad6c-962362670409" });
    });

    it("hands a secret back untouched, so the check refuses it as one", () => {
        const pasted = "phx_abcdefghijklmnopqrstuvwxyz0123456789";
        const { id } = extractTrackerId("posthog", pasted);
        expect(checkTrackerId("posthog", id)).toEqual({
            ok: false,
            problem: "secret",
        });
    });

    it("finds no id in a GTM snippet, and the check refuses what is left", () => {
        const { id } = extractTrackerId(
            "ga4",
            "<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-ABC123');</script>",
        );
        expect(checkTrackerId("ga4", id).ok).toBe(false);
    });
});

describe("looksSecret", () => {
    it("does not mistake public ids for secrets", () => {
        for (const v of [
            "G-ABC1234",
            "phc_abcdefghijklmnopqrstuvwxyz0123",
            "3t0wlogvdz",
            "94db1cb1-74f4-4a40-ad6c-962362670409",
        ]) {
            expect(looksSecret(v)).toBe(false);
        }
    });
});

describe("checkPrivacyUrl", () => {
    it("keeps an https address", () => {
        expect(checkPrivacyUrl(" https://rye.in/privacy ")).toBe(
            "https://rye.in/privacy",
        );
    });

    it("refuses anything else", () => {
        for (const bad of [
            "http://rye.in/privacy",
            "javascript:alert(1)",
            "https://user:pass@rye.in/privacy",
            "privacy",
            "",
        ]) {
            expect(checkPrivacyUrl(bad)).toBeNull();
        }
    });
});
