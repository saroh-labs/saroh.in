import { contentSecurityPolicy } from "@saroh/auth/security-headers";
import { describe, expect, it } from "vitest";

import cspSources from "../csp-sources.cjs";
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
    // Enforced per request by the proxy with a nonce (DEC-244), built from
    // the same sources the proxy uses.
    const csp = contentSecurityPolicy({ ...cspSources, nonce: "test" });
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
