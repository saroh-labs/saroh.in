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

describe("admin.saroh.in page policies", () => {
    it("reports a CSP with no third party beyond Cloudflare analytics", async () => {
        const { sources } = await pagePolicies();
        expect(
            sources("script-src").filter((s) => s.startsWith("https:")),
        ).toEqual(["https://static.cloudflareinsights.com"]);
        expect(sources("frame-src")).toEqual(["'self'"]);
        expect(sources("base-uri")).toEqual(["'self'"]);
    });

    it("switches payment off with the camera and location", async () => {
        const { permissions } = await pagePolicies();
        for (const off of ["payment=()", "camera=()", "geolocation=()"])
            expect(permissions).toContain(off);
    });
});
