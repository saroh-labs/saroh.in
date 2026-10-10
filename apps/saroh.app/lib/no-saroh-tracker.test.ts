import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    merchantSiteFiles,
    problemsIn,
} from "../../../scripts/check-merchant-site-tracking.mjs";

/**
 * Merchant sites never load a tracker of Saroh's (DEC-123): a site's
 * visitors are the merchant's customers. The rule and its reasons are in
 * `scripts/check-merchant-site-tracking.mjs` (`pnpm run
 * check:merchant-site-tracking`, in prepush and CI); this runs the same scan
 * with the unit tests and proves it would catch each way of breaking it.
 *
 * The forbidden strings below are assembled from parts, because this file is
 * inside the scanned tree itself.
 */
const SDK = ["post", "hog-js"].join("");
const SDK_HOST = ["eu.i.post", "hog.com"].join("");
const PUBLIC_KEY = ["NEXT_PUBLIC_", "POST", "HOG_KEY"].join("");
const BROWSER_HALF = ["@saroh/error-tracking/", "browser"].join("");
const SERVER_KEY = ["POST", "HOG_KEY"].join("");

const repoRoot = path.resolve(__dirname, "../../..");

describe("merchant sites never load a tracker of Saroh's", () => {
    it("reads this app and the blocks every site is built from", () => {
        const files = merchantSiteFiles(repoRoot).map((f) => f.path);
        expect(files).toContain("apps/saroh.app/worker.ts");
        expect(files).toContain("apps/saroh.app/package.json");
        expect(files).toContain("apps/saroh.app/lib/error-tracking.ts");
        expect(
            files.some((f) => f.startsWith("packages/site-blocks/src/")),
        ).toBe(true);
    });

    it("finds nothing today", () => {
        expect(problemsIn(merchantSiteFiles(repoRoot))).toEqual([]);
    });

    it.each([
        [
            "the browser SDK imported by a block",
            "packages/site-blocks/src/blocks/hero.tsx",
            `import tracker from "${SDK}";`,
        ],
        [
            "the browser SDK loaded lazily",
            "apps/saroh.app/components/site-trackers.tsx",
            `const sdk = await import('${SDK}/dist/module.no-external');`,
        ],
        [
            "the SDK as a dependency",
            "apps/saroh.app/package.json",
            `{ "dependencies": { "${SDK}": "1.0.0" } }`,
        ],
        [
            "the server SDK",
            "apps/saroh.app/lib/x.ts",
            `import { Client } from "${SDK.replace("-js", "-node")}";`,
        ],
        [
            "the browser half of Saroh's wrapper",
            "apps/saroh.app/app/layout.tsx",
            `import { createBrowserTracking } from "${BROWSER_HALF}";`,
        ],
        [
            "a tracker address in a script tag",
            "apps/saroh.app/app/[domain]/layout.tsx",
            `<script src="https://${SDK_HOST}/static/array.js" />`,
        ],
        [
            "a tracker address in a fetch",
            "packages/site-blocks/src/lib/beacon.ts",
            `void fetch("https://${SDK_HOST}/i/v0/e/", { method: "POST" });`,
        ],
        [
            "the key under a public name",
            "apps/saroh.app/env.ts",
            `${PUBLIC_KEY}: process.env.${PUBLIC_KEY},`,
        ],
        [
            "client instrumentation",
            "apps/saroh.app/instrumentation-client.ts",
            "export {};",
        ],
    ])("would catch %s", (_what, file, text) => {
        expect(problemsIn([{ path: file, text }])).toHaveLength(1);
    });

    it("leaves the other apps alone: the workspace may use the SDK for errors", () => {
        expect(
            problemsIn([
                {
                    path: "apps/app.saroh.in/lib/error-tracking-browser.ts",
                    text: `load: () => import("${SDK}/dist/module.no-external")`,
                },
            ]),
        ).toEqual([]);
    });

    it("allows the server-side reporter and its server-only settings", () => {
        expect(
            problemsIn([
                {
                    path: "apps/saroh.app/lib/error-tracking.ts",
                    text: `import type { AppTrackingSettings } from "@saroh/error-tracking/server";\nkey: env.${SERVER_KEY}`,
                },
            ]),
        ).toEqual([]);
    });

    it("would catch Saroh's key read anywhere else, a component above all", () => {
        expect(
            problemsIn([
                {
                    path: "apps/saroh.app/components/site-trackers.tsx",
                    text: `const key = process.env.${SERVER_KEY};`,
                },
            ]),
        ).toHaveLength(1);
    });

    it("allows the merchant's own tracker its address, and nowhere else (#889)", () => {
        const text = `const host = "https://${SDK_HOST}";`;
        expect(
            problemsIn([{ path: "apps/saroh.app/lib/trackers.ts", text }]),
        ).toEqual([]);
        expect(
            problemsIn([{ path: "apps/saroh.app/lib/site-head.ts", text }]),
        ).toHaveLength(1);
        // And even there, never Saroh's key.
        expect(
            problemsIn([
                {
                    path: "apps/saroh.app/lib/trackers.ts",
                    text: `init(env.${SERVER_KEY})`,
                },
            ]),
        ).toHaveLength(1);
    });
});
