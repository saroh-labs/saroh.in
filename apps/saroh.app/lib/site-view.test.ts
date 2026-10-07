import { describe, expect, it } from "vitest";

import {
    asksNotToTrack,
    isPrivatePath,
    referrerOrigin,
    siteViewBody,
    siteViewUrl,
} from "./site-view";

const base = {
    path: "/about",
    referrer: "",
    ownHost: "flowers.saroh.app",
    signals: {},
};

describe("site view beacon", () => {
    it("sends a page view with only the path, stamped anonymous", () => {
        expect(siteViewBody(base)).toEqual({
            type: "site.view",
            schemaVersion: 1,
            consent: "anonymous",
            properties: { path: "/about" },
        });
    });

    it("never sends the query or the hash", () => {
        const body = siteViewBody({ ...base, path: "/shop?release=abc#top" });
        expect(body?.properties).toEqual({ path: "/shop" });
    });

    it("sends nothing when the browser asks not to be tracked", () => {
        expect(asksNotToTrack({ doNotTrack: "1" })).toBe(true);
        expect(asksNotToTrack({ globalPrivacyControl: true })).toBe(true);
        expect(asksNotToTrack({ doNotTrack: "0" })).toBe(false);
        expect(
            siteViewBody({ ...base, signals: { globalPrivacyControl: true } }),
        ).toBeNull();
    });

    it("sends nothing from the signed-in account area", () => {
        expect(isPrivatePath("/account")).toBe(true);
        expect(isPrivatePath("/account/orders/ORD-1")).toBe(true);
        expect(isPrivatePath("/accounting-tips")).toBe(false);
        expect(siteViewBody({ ...base, path: "/account/messages" })).toBeNull();
    });

    it("keeps only another site's origin as the referrer", () => {
        expect(
            referrerOrigin(
                "https://www.google.com/search?q=flowers",
                base.ownHost,
            ),
        ).toBe("https://www.google.com");
        expect(
            referrerOrigin("https://flowers.saroh.app/blog", base.ownHost),
        ).toBeUndefined();
        expect(referrerOrigin("not a url", base.ownHost)).toBeUndefined();
        expect(referrerOrigin("", base.ownHost)).toBeUndefined();
    });

    it("posts to the site's public intake", () => {
        expect(siteViewUrl("https://api.saroh.in/", "site 1")).toBe(
            "https://api.saroh.in/public/sites/site%201/analytics/events",
        );
    });
});
