import { describe, expect, it } from "vitest";

import {
    asksNotToTrack,
    isPrivatePath,
    referrerOrigin,
    siteViewBody,
    siteViewUrl,
    visitStepBody,
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

    it("sends nothing from a page about one customer, whose path names an order or a token", () => {
        for (const path of [
            "/checkout",
            "/checkout/ord_123",
            "/pay/tok_abc",
            "/shop/order/ord_123",
            "/book/claim/tok_abc",
            "/shop/stop-waiting/tok_abc",
            "/autopay/sub_1",
            "/q/h7c",
        ]) {
            expect([path, siteViewBody({ ...base, path })]).toEqual([
                path,
                null,
            ]);
        }
        // Public pages that only start the same way still count.
        for (const path of [
            "/quotes",
            "/shop",
            "/shop/loaf",
            "/book",
            "/payments-info",
        ]) {
            expect(siteViewBody({ ...base, path })).not.toBeNull();
        }
    });

    it("sends a visit's step with its source and nothing else (U15)", () => {
        expect(
            visitStepBody("visit", { source: "instagram", ref: "diwali-post" }),
        ).toEqual({
            type: "site.visit",
            schemaVersion: 1,
            consent: "anonymous",
            properties: { source: "instagram", ref: "diwali-post" },
        });
        expect(
            visitStepBody("looked", { source: "direct", ref: null }),
        ).toEqual({
            type: "site.looked",
            schemaVersion: 1,
            consent: "anonymous",
            properties: { source: "direct" },
        });
        expect(
            visitStepBody("started", { source: "other", ref: null }).type,
        ).toBe("site.started");
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
