import { describe, expect, it } from "vitest";

import nextConfig from "../next.config.js";

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

describe("app.saroh.in page policies", () => {
    it("reports a CSP that lets Razorpay's checkout and R2 uploads through", async () => {
        const { sources } = await pagePolicies();
        expect(sources("script-src")).toContain(
            "https://checkout.razorpay.com",
        );
        expect(sources("frame-src")).toContain("https://api.razorpay.com");
        expect(sources("connect-src")).toContain(
            "https://*.r2.cloudflarestorage.com",
        );
        expect(sources("img-src")).toEqual(
            expect.arrayContaining([
                "https://media.saroh.in",
                "https://images.unsplash.com",
            ]),
        );
        expect(sources("script-src").join(" ")).not.toMatch(
            /googletagmanager|facebook/,
        );
    });

    it("leaves payment to Razorpay's frame and switches the camera off", async () => {
        const { permissions } = await pagePolicies();
        expect(permissions).toContain(
            'payment=(self "https://api.razorpay.com")',
        );
        expect(permissions).toContain("camera=()");
    });
});
