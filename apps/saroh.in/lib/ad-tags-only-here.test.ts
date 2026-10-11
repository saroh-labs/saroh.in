import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    AD_FREE_ROOTS,
    problemsIn,
    scannedFiles,
} from "../../../scripts/check-merchant-site-tracking.mjs";

/**
 * Saroh's advertising tags (Google Ads, the Meta Pixel) live on saroh.in and
 * nowhere else (DEC-127): never on a merchant's site, in the workspace, in
 * the console or on sign-in. The rule and its reasons are in
 * `scripts/check-merchant-site-tracking.mjs` (`pnpm run
 * check:merchant-site-tracking`, in prepush and CI); this runs the same scan
 * with the unit tests and proves it would catch each way of breaking it,
 * and that a merchant's own trackers (#889) stay allowed.
 */
const repoRoot = path.resolve(__dirname, "../../..");

const BREAKS: [string, string, string][] = [
    [
        "the Google Ads id read in the workspace",
        "apps/app.saroh.in/env.ts",
        "NEXT_PUBLIC_GOOGLE_ADS_ID: z.string().optional(),",
    ],
    [
        "a conversion label set on the sign-in Worker",
        "apps/accounts.saroh.in/wrangler.jsonc",
        '"NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL": "abc",',
    ],
    [
        "the Pixel id on the merchant sites' Worker",
        "apps/saroh.app/wrangler.jsonc",
        '"NEXT_PUBLIC_META_PIXEL_ID": "1234567890",',
    ],
    [
        "the Pixel id under a server-only name",
        "apps/admin.saroh.in/lib/control-plane.ts",
        "const pixel = env.META_PIXEL_ID;",
    ],
    [
        "Google's tag loaded on sign-in",
        "apps/accounts.saroh.in/app/layout.tsx",
        '<Script src="https://www.googletagmanager.com/gtag/js?id=AW-1" />',
    ],
    [
        "the Pixel's script in a site block",
        "packages/site-blocks/src/blocks/hero.tsx",
        's.src = "https://connect.facebook.net/en_US/fbevents.js";',
    ],
    [
        "the Pixel's no-script image in the console",
        "apps/admin.saroh.in/app/layout.tsx",
        '<img src="https://www.facebook.com/tr?id=1&ev=PageView" />',
    ],
    [
        "a Google Ads conversion address",
        "apps/app.saroh.in/components/onboarding/done.tsx",
        'fetch("https://www.googleadservices.com/pagead/conversion/1/")',
    ],
    [
        "a conversion fired from onboarding",
        "apps/app.saroh.in/components/onboarding/done.tsx",
        'window.gtag("event", "conversion", { send_to: "AW-1/abc" });',
    ],
    [
        "a Pixel event from the verify step",
        "apps/accounts.saroh.in/components/auth/verify-email-form.tsx",
        'window.fbq?.("track", "CompleteRegistration");',
    ],
    [
        "a Pixel event from a merchant site's checkout",
        "apps/saroh.app/components/checkout.tsx",
        "fbq('track', 'Purchase');",
    ],
];

describe("Saroh's ad tags live on saroh.in alone", () => {
    it("reads the merchant sites, the workspace, the console and sign-in", () => {
        expect(AD_FREE_ROOTS).toEqual([
            "apps/saroh.app",
            "packages/site-blocks",
            "apps/app.saroh.in",
            "apps/admin.saroh.in",
            "apps/accounts.saroh.in",
        ]);
        const files = scannedFiles(repoRoot).map((f) => f.path);
        for (const root of AD_FREE_ROOTS)
            expect(files.some((f) => f.startsWith(`${root}/`))).toBe(true);
        expect(files).toContain(
            "apps/accounts.saroh.in/components/auth/verify-email-form.tsx",
        );
        expect(files.some((f) => f.startsWith("apps/saroh.in/"))).toBe(false);
    });

    it("finds nothing today", () => {
        expect(problemsIn(scannedFiles(repoRoot))).toEqual([]);
    });

    it.each(BREAKS)("catches %s", (_what, file, text) => {
        const problems = problemsIn([{ path: file, text }]);
        expect(problems.length).toBeGreaterThan(0);
        expect(problems.every((p) => p.startsWith(`${file}: `))).toBe(true);
    });

    it("leaves a merchant's own trackers alone (#889)", () => {
        const own = [
            "https://www.googletagmanager.com/gtag/js?id=",
            "function gtag(){dataLayer.push(arguments);}",
            "https://connect.facebook.net/en_US/fbevents.js",
            "fbq('init', id);",
        ].join("\n");
        expect(
            problemsIn([
                { path: "apps/saroh.app/lib/trackers.ts", text: own },
                { path: "apps/saroh.app/lib/trackers.test.ts", text: own },
                {
                    path: "apps/saroh.app/components/site-trackers.tsx",
                    text: 'w.fbq?.("consent", "revoke");',
                },
            ]),
        ).toEqual([]);
    });

    it("but never one of Saroh's own ids, even there", () => {
        expect(
            problemsIn([
                {
                    path: "apps/saroh.app/lib/trackers.ts",
                    text: "const id = env.NEXT_PUBLIC_META_PIXEL_ID;",
                },
            ]),
        ).toHaveLength(1);
    });

    it("doesn't mind the words: a settings screen may name Google Ads and Meta", () => {
        expect(
            problemsIn([
                {
                    path: "apps/app.saroh.in/lib/sites/search-tracking.ts",
                    text: 'where: "In Google Ads, Tools › Data manager › Google tag. The tag ID starts AW-.", label: "Meta Pixel ID"',
                },
            ]),
        ).toEqual([]);
    });

    it("says nothing about saroh.in itself, where the tags belong", () => {
        expect(
            problemsIn([
                {
                    path: "apps/saroh.in/lib/tags.ts",
                    text: "https://connect.facebook.net/en_US/fbevents.js NEXT_PUBLIC_META_PIXEL_ID",
                },
            ]),
        ).toEqual([]);
    });
});
