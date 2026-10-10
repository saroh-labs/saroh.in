import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    merchantSiteFiles,
    problemsIn,
    recorderProblemsIn,
    recorderScanFiles,
} from "../../../scripts/check-merchant-site-tracking.mjs";

/**
 * Merchant sites never load a tracker of Saroh's (DEC-125): a site's
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
const RECORDER = ["post", "hog-recorder"].join("");
const START = ["start", "Session", "Recording"].join("");
const REPLAY_SWITCH = ["NEXT_PUBLIC_", "POST", "HOG_REPLAY"].join("");
const HAND_OVER = ["load", "Recorder"].join("");

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

/**
 * Session replay is the workspace and saroh.in, and no other app (DEC-125,
 * 10 Oct): never a merchant site, accounts or the admin console.
 */
describe("only the workspace and saroh.in may record sessions", () => {
    it("finds nothing today, across every app", () => {
        const files = recorderScanFiles(repoRoot);
        const paths = files.map((f) => f.path);
        for (const app of [
            "apps/saroh.app",
            "apps/accounts.saroh.in",
            "apps/admin.saroh.in",
            "apps/app.saroh.in",
            "apps/saroh.in",
        ])
            expect(paths.some((p) => p.startsWith(`${app}/`))).toBe(true);
        expect(recorderProblemsIn(files)).toEqual([]);
    });

    it.each([
        ["a merchant site", "apps/saroh.app/components/site-trackers.tsx"],
        ["a site block", "packages/site-blocks/src/blocks/hero.tsx"],
        ["accounts", "apps/accounts.saroh.in/app/layout.tsx"],
        ["the admin console", "apps/admin.saroh.in/lib/tracking.ts"],
        ["the help site", "apps/help.saroh.in/app/layout.tsx"],
        ["an app made later", "apps/new.saroh.in/app/layout.tsx"],
    ])("would catch the recorder in %s", (_where, file) => {
        for (const text of [
            `${HAND_OVER}: () => import("${RECORDER}")`,
            `instance.${START}();`,
            `tracking.startReplay(facts);`,
            `tracking.startSiteReplay(facts);`,
            `replay: env.${REPLAY_SWITCH},`,
        ])
            expect(recorderProblemsIn([{ path: file, text }])).toHaveLength(1);
    });

    it("allows the two that may, in the one file that makes the tracker", () => {
        const text = `${HAND_OVER}: () => import("${SDK}/dist/${RECORDER}")`;
        for (const app of ["apps/app.saroh.in", "apps/saroh.in"]) {
            expect(
                recorderProblemsIn([
                    { path: `${app}/lib/error-tracking-browser.ts`, text },
                ]),
            ).toEqual([]);
            // Anywhere else in them, handing it over is caught.
            expect(
                recorderProblemsIn([
                    { path: `${app}/components/anything.tsx`, text },
                ]),
            ).toHaveLength(1);
        }
    });

    it("leaves the merchant's own tracker alone (#889)", () => {
        expect(
            recorderProblemsIn([
                {
                    path: "apps/saroh.app/lib/trackers.ts",
                    text: `stub.${START} = () => undefined;`,
                },
            ]),
        ).toEqual([]);
    });
});
