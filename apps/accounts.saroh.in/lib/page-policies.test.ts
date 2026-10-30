import { describe, expect, it } from "vitest";

import nextConfig from "../next.config.mjs";

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

describe("accounts.saroh.in page policies", () => {
    it("reports a CSP that lets Turnstile and MSG91's code widget run", async () => {
        const { sources } = await pagePolicies();
        expect(sources("script-src")).toEqual(
            expect.arrayContaining([
                "https://challenges.cloudflare.com",
                "https://verify.msg91.com",
            ]),
        );
        expect(sources("frame-src")).toContain(
            "https://challenges.cloudflare.com",
        );
        expect(sources("connect-src")).toContain("https://*.msg91.com");
        expect(sources("object-src")).toEqual(["'none'"]);
    });

    it("names no payment or ad host, and switches payment off", async () => {
        const { sources, permissions } = await pagePolicies();
        expect(sources("script-src").join(" ")).not.toMatch(
            /razorpay|googletagmanager|facebook/,
        );
        expect(permissions).toContain("payment=()");
        expect(permissions).toContain("camera=()");
    });
});
