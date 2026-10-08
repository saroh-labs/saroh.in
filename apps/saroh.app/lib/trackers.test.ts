import { describe, expect, it } from "vitest";

import type { SiteHeadTracker } from "./site-head-shape";
import {
    effectiveConsent,
    LOADER_HOSTS,
    loaderScripts,
    needsConsent,
    trackersAllowedOn,
} from "./trackers";

const ALL: SiteHeadTracker[] = [
    { kind: "ga4", id: "G-ABC1234", region: null },
    { kind: "google-ads", id: "AW-123456789", region: null },
    { kind: "meta-pixel", id: "123456789012345", region: null },
    { kind: "posthog", id: "phc_abcdefghijklmnopqrstuvwxyz0123", region: "eu" },
    { kind: "clarity", id: "3t0wlogvdz", region: null },
    { kind: "plausible", id: "pa-AbC_12-xyz", region: null },
    { kind: "umami", id: "94db1cb1-74f4-4a40-ad6c-962362670409", region: null },
];

describe("loaderScripts (DEC-108)", () => {
    it("fetches only from the fixed hosts", () => {
        const scripts = loaderScripts(ALL);
        const hosts = new Set<string>();
        for (const s of scripts) {
            if (s.src) hosts.add(new URL(s.src).host);
            const urls = (s.text ?? "").match(/https:\/\/[a-z0-9.-]+/g) ?? [];
            for (const url of urls) hosts.add(url.slice("https://".length));
        }
        // The PostHog API host the stub derives its loader host from.
        hosts.delete("eu.i.posthog.com");
        for (const host of Array.from(hosts)) {
            expect(LOADER_HOSTS).toContain(host);
        }
    });

    it("loads one gtag.js for Google Analytics and Google Ads, consent first", () => {
        const scripts = loaderScripts(ALL.slice(0, 2));
        expect(scripts.filter((s) => s.src?.includes("gtag/js"))).toHaveLength(
            1,
        );
        const text = scripts[0]?.text ?? "";
        expect(text.indexOf("'consent','default'")).toBeLessThan(
            text.indexOf("'config'"),
        );
        expect(text).toContain(`gtag('config',"G-ABC1234")`);
        expect(text).toContain(`gtag('config',"AW-123456789")`);
    });

    it("locks PostHog down and turns Meta's form matching off", () => {
        const text = loaderScripts(ALL)
            .map((s) => s.text ?? "")
            .join("\n");
        expect(text).toContain("opt_in_site_apps:false");
        expect(text).toContain("disable_web_experiments:true");
        expect(text).toContain("disable_surveys:true");
        expect(text).toContain("maskAllInputs:true");
        expect(text).toContain(
            `fbq('set','autoConfig',false,"123456789012345")`,
        );
    });

    it("skips an id that fails its check, so nothing crafted reaches a script", () => {
        const crafted = loaderScripts([
            { kind: "ga4", id: "G-ABC');alert(1);//", region: null },
            { kind: "clarity", id: "</script><script>alert(1)", region: null },
            {
                kind: "posthog",
                id: "phc_abcdefghijklmnopqrstuvwxyz0123",
                region: null,
            },
        ]);
        expect(crafted).toEqual([]);
    });
});

describe("when trackers load", () => {
    it("never on a private page", () => {
        for (const path of [
            "/account",
            "/account/orders",
            "/checkout/x",
            "/autopay",
            "/shop/order/x",
            "/pay/abc",
        ]) {
            expect(trackersAllowedOn(path), path).toBe(false);
        }
        for (const path of ["/", "/shop", "/shop/rye", "/book", "/blog/x"]) {
            expect(trackersAllowedOn(path), path).toBe(true);
        }
    });

    it("asks first for every tool but the cookieless two", () => {
        expect(
            ALL.filter((t) => !needsConsent(t.kind)).map((t) => t.kind),
        ).toEqual(["plausible", "umami"]);
    });

    it("treats Global Privacy Control as a standing no, over an earlier yes", () => {
        expect(effectiveConsent("granted", true)).toBe("refused");
        expect(effectiveConsent(null, true)).toBe("refused");
        expect(effectiveConsent("granted", false)).toBe("granted");
        expect(effectiveConsent(null, false)).toBeNull();
    });
});
