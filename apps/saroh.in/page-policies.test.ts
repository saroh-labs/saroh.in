import { describe, expect, it } from "vitest";

import nextConfig from "./next.config.js";

/** What every page gets (pentest, 29 Oct 2026), one directive's sources by name. */
async function pagePolicies() {
    const rules = (await nextConfig.headers?.()) ?? [];
    const sent = new Map(
        rules
            .filter((rule) => rule.source === "/:path*" && !rule.has)
            .flatMap((rule) => rule.headers)
            .map((h) => [h.key.toLowerCase(), h.value]),
    );
    const csp = sent.get("content-security-policy-report-only") ?? "";
    const sources = (name: string) =>
        csp
            .split("; ")
            .find((part) => part.startsWith(`${name} `))
            ?.split(" ")
            .slice(1) ?? [];
    return { sources, permissions: sent.get("permissions-policy") ?? "" };
}

describe("saroh.in page policies", () => {
    it("reports a CSP that lets the Google tag and Meta Pixel load", async () => {
        const { sources } = await pagePolicies();
        expect(sources("script-src")).toEqual(
            expect.arrayContaining([
                "https://*.googletagmanager.com",
                "https://connect.facebook.net",
            ]),
        );
        expect(sources("connect-src")).toContain(
            "https://*.google-analytics.com",
        );
        // The downloads' bot check (Turnstile).
        expect(sources("script-src")).toContain(
            "https://challenges.cloudflare.com",
        );
        expect(sources("script-src").join(" ")).not.toMatch(/razorpay|msg91/);
    });

    it("switches payment off: nothing is bought on the marketing site", async () => {
        const { permissions } = await pagePolicies();
        expect(permissions).toContain("payment=()");
    });
});
