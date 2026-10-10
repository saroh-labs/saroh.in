import { describe, expect, it } from "vitest";

import { gaMeasurementId, hasAdTags, tagConfig } from "./ga";

describe("gaMeasurementId", () => {
    it("loads GA only on a production deployment with an id", () => {
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "production" }),
        ).toBe("G-TEST123");
    });

    it("never loads it locally, on a preview or without an id", () => {
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: undefined }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "preview" }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: "G-TEST123", vercelEnv: "development" }),
        ).toBeUndefined();
        expect(
            gaMeasurementId({ id: undefined, vercelEnv: "production" }),
        ).toBeUndefined();
    });
});

/** The ids are made up. */
describe("tagConfig (DEC-127)", () => {
    const set = {
        gaId: "G-TEST123",
        adsId: "AW-123456789",
        adsWaitlistLabel: "waitLabel",
        adsSignupLabel: "signLabel",
        pixelId: "1234567890",
    };

    it("is every id that is set, on a production deployment", () => {
        expect(tagConfig({ ...set, vercelEnv: "production" })).toEqual(set);
    });

    it.each([undefined, "preview", "development"])(
        "is empty anywhere else (%s), even with every id in a local .env",
        (vercelEnv) => {
            const config = tagConfig({ ...set, vercelEnv });
            expect(config).toEqual({});
            expect(hasAdTags(config)).toBe(false);
        },
    );

    it("is empty with no id set: nothing loads, nothing is sent", () => {
        const config = tagConfig({
            gaId: undefined,
            adsId: undefined,
            adsWaitlistLabel: undefined,
            adsSignupLabel: undefined,
            pixelId: undefined,
            vercelEnv: "production",
        });
        expect(config).toEqual({});
        expect(hasAdTags(config)).toBe(false);
    });

    it("drops Google Ads' labels when there is no Google Ads id", () => {
        expect(
            tagConfig({ ...set, adsId: undefined, vercelEnv: "production" }),
        ).toEqual({ gaId: "G-TEST123", pixelId: "1234567890" });
    });

    it("advertises with either tag alone", () => {
        expect(hasAdTags({ adsId: "AW-123456789" })).toBe(true);
        expect(hasAdTags({ pixelId: "1234567890" })).toBe(true);
        expect(hasAdTags({ gaId: "G-TEST123" })).toBe(false);
    });
});
