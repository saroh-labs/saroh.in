import { describe, expect, it } from "vitest";

import { NO_HEAD, siteHeadOf } from "./site-head-shape";

describe("siteHeadOf (DEC-108)", () => {
    it("keeps good codes and trackers", () => {
        expect(
            siteHeadOf({
                verifications: [
                    { service: "google", code: "abcDEF123_-ghiJKL456mnoPQR" },
                ],
                trackers: [
                    { kind: "ga4", id: "G-ABC1234", region: null },
                    {
                        kind: "posthog",
                        id: "phc_abcdefghijklmnopqrstuvwxyz0123",
                        region: "eu",
                    },
                ],
                privacyUrl: "https://rye.in/privacy",
            }),
        ).toEqual({
            verifications: [
                { service: "google", code: "abcDEF123_-ghiJKL456mnoPQR" },
            ],
            trackers: [
                { kind: "ga4", id: "G-ABC1234", region: null },
                {
                    kind: "posthog",
                    id: "phc_abcdefghijklmnopqrstuvwxyz0123",
                    region: "eu",
                },
            ],
            privacyUrl: "https://rye.in/privacy",
        });
    });

    it("drops anything that isn't a safe, known value", () => {
        expect(
            siteHeadOf({
                verifications: [
                    { service: "google", code: '"><script>alert(1)</script>' },
                    { service: "yandex", code: "abc" },
                ],
                trackers: [
                    { kind: "ga4", id: 'G-1"onload=alert(1)' },
                    { kind: "gtm", id: "GTM-ABC123" },
                    { kind: "ga4", id: "GTM-ABC123" },
                    {
                        kind: "posthog",
                        id: "phc_abcdefghijklmnopqrstuvwxyz0123",
                        region: "evil.example",
                    },
                    { kind: "umami", id: "https://evil.example/script.js" },
                ],
                privacyUrl: "javascript:alert(1)",
            }),
        ).toEqual(NO_HEAD);
    });

    it("reads anything malformed as nothing", () => {
        expect(siteHeadOf(null)).toEqual(NO_HEAD);
        expect(siteHeadOf("x")).toEqual(NO_HEAD);
        expect(siteHeadOf({ trackers: "G-ABC1234" })).toEqual(NO_HEAD);
    });

    it("keeps one tracker of a kind", () => {
        const head = siteHeadOf({
            trackers: [
                { kind: "ga4", id: "G-ABC1234" },
                { kind: "ga4", id: "G-XYZ9876" },
            ],
        });
        expect(head.trackers).toEqual([
            { kind: "ga4", id: "G-ABC1234", region: null },
        ]);
    });
});
