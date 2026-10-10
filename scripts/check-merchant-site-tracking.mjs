#!/usr/bin/env node
/**
 * Merchant sites never load a tracker of Saroh's (DEC-125).
 *
 * A merchant site's visitors are the merchant's customers: Saroh processes
 * their data only for the merchant (the Privacy Policy). So nothing of
 * PostHog's may reach a visitor's browser: no SDK, no script, no request to
 * its address, no key compiled into the bundle. The only thing the merchant
 * sites do is report their own server's exceptions, from the server
 * (`apps/saroh.app/lib/error-tracking.ts`, through
 * `@saroh/error-tracking/server`).
 *
 * This fails when, anywhere under `apps/saroh.app` or `packages/site-blocks`:
 *
 *   1. a PostHog SDK is named (`posthog-js`, `posthog-node`, `@posthog/…`),
 *      in a source file or in a package.json;
 *   2. the browser half of Saroh's own wrapper is imported
 *      (`@saroh/error-tracking/browser`);
 *   3. a PostHog address appears (`…posthog.com`): the server reporter keeps
 *      its address in `@saroh/error-tracking`, so no file here needs one,
 *      but for the merchant's own tracker (below);
 *   4. the key is given a public name (`NEXT_PUBLIC_POSTHOG…`), which Next
 *      would compile into the browser bundle;
 *   5. Saroh's key or host (`POSTHOG_KEY`, `POSTHOG_HOST`) is read anywhere
 *      but the four server-side files that report this server's errors;
 *   6. `apps/saroh.app` has an `instrumentation-client` file, the one place
 *      Next runs code in every visitor's browser before the page.
 *
 * **Session replay is two apps and no other** (DEC-125, 10 Oct): the
 * workspace (`apps/app.saroh.in`) and the marketing site (`apps/saroh.in`,
 * behind its cookie notice). So it also fails when:
 *
 *   7. any other app, or `packages/site-blocks`, names Saroh's recorder
 *      (`posthog-recorder`, `loadRecorder`, `startReplay`,
 *      `startSiteReplay`, `startSessionRecording`, `…POSTHOG_REPLAY…`):
 *      never a merchant site, never accounts (sign-in, sign-up,
 *      passwords), never the admin console, never anything else;
 *   8. in either of the two, the recorder is handed over anywhere but the
 *      one file that makes the tracker (`lib/error-tracking-browser.ts`).
 *
 * Every tracked file is read, tests and comments included: there is no
 * reason for any of these to be written there at all.
 *
 * **The merchant's own tracker is a different thing** (#889). A merchant may
 * add THEIR PostHog project to THEIR site by its public id; it loads behind
 * the site's consent banner, from the id in the site's settings, and Saroh
 * sees none of it. That loader lives in `apps/saroh.app/lib/trackers.ts`,
 * the one file (with its test) allowed a PostHog address. It reads no
 * environment variable, so rule 5 keeps Saroh's key out of it.
 *
 * Run from the repo root. `problemsIn` is exported for the unit test
 * (`apps/saroh.app/lib/no-saroh-tracker.test.ts`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const MERCHANT_SITE_ROOTS = ["apps/saroh.app", "packages/site-blocks"];

/** The only two apps that may record sessions, and where each hands the recorder over. */
export const RECORDING_APPS = ["apps/app.saroh.in", "apps/saroh.in"];
const RECORDER_HANDOVER = "lib/error-tracking-browser.ts";

/** Anything that could hand over, start or switch on Saroh's recorder. */
const RECORDER =
    /posthog-recorder|loadRecorder|startReplay|startSiteReplay|startSessionRecording|POSTHOG_REPLAY/u;

/** Handing the recorder to the tracker: the bundle, or the option that takes it. */
const HANDOVER = /posthog-recorder|loadRecorder\s*:/u;

/** Source a browser or a server could run; prose and settings are not it. */
const SOURCE = /\.(?:[cm]?[jt]sx?)$/u;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;

/** Text files worth reading; images, fonts and lockfiles are skipped. */
const READABLE =
    /\.(?:[cm]?[jt]sx?|json|jsonc|css|scss|html|md|mdx|ya?ml|toml|txt|svg)$/u;

/** The merchant's own PostHog loader (#889), and its test: an address only. */
const MERCHANT_OWN_TRACKER = new Set([
    "apps/saroh.app/lib/trackers.ts",
    "apps/saroh.app/lib/trackers.test.ts",
]);

/** The server-side files that may read Saroh's key and host. */
const SERVER_REPORTER = new Set([
    "apps/saroh.app/env.ts",
    "apps/saroh.app/lib/error-tracking.ts",
    "apps/saroh.app/instrumentation.ts",
    "apps/saroh.app/worker.ts",
    "apps/saroh.app/wrangler.jsonc",
]);

/** [shape, what it means, the files it doesn't apply to] */
const RULES = [
    [
        /["'`](?:posthog-js|posthog-node|@posthog\/)[^"'`]*["'`]/iu,
        "names a PostHog SDK",
        new Set(),
    ],
    [
        /@saroh\/error-tracking\/browser/u,
        "imports the browser half of @saroh/error-tracking",
        new Set(),
    ],
    [/posthog\.com/iu, "holds a PostHog address", MERCHANT_OWN_TRACKER],
    [
        /NEXT_PUBLIC_POSTHOG/u,
        "gives the PostHog key a public name (it would ship to browsers)",
        new Set(),
    ],
    [
        /(?<![A-Z_])POSTHOG_(?:KEY|HOST)\b/u,
        "reads Saroh's PostHog key or host outside the server-side reporter",
        SERVER_REPORTER,
    ],
];

/**
 * The problems in a set of files, as "path: what" lines.
 * @param {{ path: string, text: string }[]} files
 */
export function problemsIn(files) {
    const problems = [];
    for (const { path, text } of files) {
        if (!MERCHANT_SITE_ROOTS.some((root) => path.startsWith(`${root}/`)))
            continue;
        if (
            /^apps\/saroh\.app\/instrumentation-client\.[cm]?[jt]sx?$/u.test(
                path,
            )
        )
            problems.push(
                `${path}: runs in every visitor's browser; a merchant site has no client instrumentation`,
            );
        for (const [shape, what, allowed] of RULES)
            if (!allowed.has(path) && shape.test(text))
                problems.push(`${path}: ${what}`);
    }
    return problems;
}

/**
 * Where Saroh's recorder is named outside the two apps that may record, or
 * handed over outside their one tracker file, as "path: what" lines.
 * @param {{ path: string, text: string }[]} files
 */
export function recorderProblemsIn(files) {
    const problems = [];
    for (const { path, text } of files) {
        if (!SOURCE.test(path) || TEST.test(path)) continue;
        const app = /^apps\/[^/]+/u.exec(path)?.[0];
        const inBlocks = path.startsWith("packages/site-blocks/");
        if (!app && !inBlocks) continue;
        if (app && RECORDING_APPS.includes(app)) {
            if (path !== `${app}/${RECORDER_HANDOVER}` && HANDOVER.test(text))
                problems.push(
                    `${path}: hands over the recorder; only ${app}/${RECORDER_HANDOVER} does`,
                );
            continue;
        }
        // The merchant's OWN tracker (#889): its loader stub names the
        // method on their project's SDK. Saroh's recorder is never there.
        if (MERCHANT_OWN_TRACKER.has(path)) continue;
        if (RECORDER.test(text))
            problems.push(
                `${path}: names Saroh's session recorder; only ${RECORDING_APPS.join(" and ")} may record`,
            );
    }
    return problems;
}

/** Every tracked source file of every app, and of the site blocks. */
export function recorderScanFiles(cwd = process.cwd()) {
    return listed(cwd, ["apps", "packages/site-blocks"]);
}

/** Every tracked, readable file under the merchant sites' roots. */
export function merchantSiteFiles(cwd = process.cwd()) {
    return listed(cwd, MERCHANT_SITE_ROOTS);
}

/** @param {string} cwd @param {string[]} roots */
function listed(cwd, roots) {
    // Tracked and not-yet-tracked alike: a new file counts before its commit.
    const listed = execFileSync(
        "git",
        [
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            ...roots,
        ],
        { encoding: "utf8", cwd, maxBuffer: 64 * 1024 * 1024 },
    );
    const files = [];
    for (const path of listed.split("\n")) {
        if (!path || !READABLE.test(path)) continue;
        try {
            files.push({ path, text: readFileSync(`${cwd}/${path}`, "utf8") });
        } catch {
            // Listed but deleted in the working tree.
        }
    }
    return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const files = merchantSiteFiles();
    const scanned = recorderScanFiles();
    const problems = [...problemsIn(files), ...recorderProblemsIn(scanned)];
    if (problems.length) {
        console.error(
            "check:merchant-site-tracking: merchant sites never load a tracker of Saroh's (DEC-125):\n  " +
                problems.join("\n  "),
        );
        process.exit(1);
    }
    console.log(
        `check:merchant-site-tracking: ${files.length} merchant-site files and ${scanned.length} app files, ok`,
    );
}
