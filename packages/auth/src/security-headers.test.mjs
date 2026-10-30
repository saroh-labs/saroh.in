import { describe, expect, it } from "vitest";

import {
    contentSecurityPolicy,
    pageSecurityHeaders,
    permissionsPolicy,
} from "./security-headers.cjs";

/** One directive's sources, by name. */
function directive(policy, name) {
    const found = policy
        .split("; ")
        .map((part) => part.split(" "))
        .find(([key]) => key === name);
    return found ? found.slice(1) : null;
}

describe("contentSecurityPolicy", () => {
    it("starts from self, never allows plugins and never moves the base", () => {
        const policy = contentSecurityPolicy();
        expect(directive(policy, "default-src")).toEqual(["'self'"]);
        expect(directive(policy, "object-src")).toEqual(["'none'"]);
        expect(directive(policy, "base-uri")).toEqual(["'self'"]);
        // Ignored (and logged) in a report-only policy: the enforced
        // Content-Security-Policy keeps it.
        expect(directive(policy, "frame-ancestors")).toBeNull();
    });

    it("lists first-party origins once, dropping unset and malformed ones", () => {
        const policy = contentSecurityPolicy({
            origins: [
                "https://api.saroh.in/v1",
                "https://api.saroh.in",
                undefined,
                "",
                "not a url",
            ],
        });
        const connect = directive(policy, "connect-src") ?? [];
        expect(
            connect.filter((s) => s === "https://api.saroh.in"),
        ).toHaveLength(1);
        expect(connect).not.toContain("not");
        expect(directive(policy, "img-src")).toContain("https://api.saroh.in");
    });

    it("sends errors to PostHog's EU host unless told another", () => {
        expect(directive(contentSecurityPolicy(), "connect-src")).toContain(
            "https://eu.i.posthog.com",
        );
        const own = contentSecurityPolicy({
            posthogHost: "https://us.i.posthog.com/",
        });
        expect(directive(own, "connect-src")).toContain(
            "https://us.i.posthog.com",
        );
        expect(directive(own, "connect-src")).not.toContain(
            "https://eu.i.posthog.com",
        );
        // The session recorder's worker.
        expect(directive(own, "worker-src")).toContain("blob:");
    });

    it("allows eval only under next dev", () => {
        expect(directive(contentSecurityPolicy(), "script-src")).not.toContain(
            "'unsafe-eval'",
        );
        expect(
            directive(contentSecurityPolicy({ dev: true }), "script-src"),
        ).toContain("'unsafe-eval'");
    });

    it("names a third party's hosts only for the app that loads it", () => {
        const plain = contentSecurityPolicy();
        expect(directive(plain, "script-src")).not.toContain(
            "https://checkout.razorpay.com",
        );
        // Cloudflare Web Analytics is injected into every page.
        expect(directive(plain, "script-src")).toContain(
            "https://static.cloudflareinsights.com",
        );

        const paying = contentSecurityPolicy({ uses: ["razorpay"] });
        expect(directive(paying, "script-src")).toContain(
            "https://checkout.razorpay.com",
        );
        expect(directive(paying, "frame-src")).toContain(
            "https://api.razorpay.com",
        );
    });
});

describe("permissionsPolicy", () => {
    it("switches off camera, microphone, location and USB", () => {
        const policy = permissionsPolicy();
        for (const feature of ["camera", "microphone", "geolocation", "usb"])
            expect(policy).toContain(`${feature}=()`);
        expect(policy).toContain("payment=()");
    });

    it("leaves payment to Razorpay's frame where it runs", () => {
        expect(permissionsPolicy(["razorpay"])).toContain(
            'payment=(self "https://api.razorpay.com")',
        );
    });

    it("names no feature Chrome would log as unknown", () => {
        expect(permissionsPolicy()).not.toMatch(
            /interest-cohort|browsing-topics/,
        );
    });
});

describe("pageSecurityHeaders", () => {
    it("reports the CSP and enforces the Permissions-Policy", () => {
        const headers = pageSecurityHeaders({ uses: ["razorpay"] });
        expect(headers.map((h) => h.key)).toEqual([
            "Content-Security-Policy-Report-Only",
            "Permissions-Policy",
        ]);
        expect(headers[1]?.value).toContain("api.razorpay.com");
    });
});
