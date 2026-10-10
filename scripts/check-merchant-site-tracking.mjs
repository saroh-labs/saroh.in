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
 * **Saroh's advertising tags live on saroh.in and nowhere else** (DEC-127).
 * Saroh advertises its own business with Google Ads and the Meta Pixel, and
 * those tags load on its marketing site alone (`apps/saroh.in/lib/tags.ts`).
 * So this also fails when, anywhere under the merchant sites' roots, the
 * workspace (`apps/app.saroh.in`), the console (`apps/admin.saroh.in`) or
 * sign-in (`apps/accounts.saroh.in`):
 *
 *   7. one of Saroh's own ad ids or labels is named (`…GOOGLE_ADS_ID`,
 *      `…GOOGLE_ADS_…_LABEL`, `…META_PIXEL_ID`), in code or in a config;
 *   8. an ad tag's address appears (Google's tag, Google Ads, DoubleClick,
 *      the Pixel's script or its `/tr` endpoint);
 *   9. an ad tag is called or loaded (`gtag(…)`, `fbq(…)`, `gtag/js`,
 *      `fbevents`).
 *
 * Rules 8 and 9 leave the merchant's OWN trackers alone (#889): a merchant
 * adds their Google Analytics, Google Ads or Meta Pixel to their site by
 * its public id, and that loader, its consent wiring and the settings
 * screen's tests are the files in `MERCHANT_OWN_AD_TAGS`. Rule 7 has no
 * exceptions: none of those files reads an id of Saroh's.
 *
 * Run from the repo root. `problemsIn` is exported for the unit tests
 * (`apps/saroh.app/lib/no-saroh-tracker.test.ts`,
 * `apps/saroh.in/lib/ad-tags-only-here.test.ts`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const MERCHANT_SITE_ROOTS = ["apps/saroh.app", "packages/site-blocks"];

/** Where none of Saroh's advertising tags may ever be (DEC-127). */
export const AD_FREE_ROOTS = [
    ...MERCHANT_SITE_ROOTS,
    "apps/app.saroh.in",
    "apps/admin.saroh.in",
    "apps/accounts.saroh.in",
];

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
 * The merchant's own trackers (#889): the loader and its test, the
 * component that tells them the visitor's consent, and the settings
 * screen's test, which pastes a Google tag snippet to prove only its id is
 * kept.
 */
const MERCHANT_OWN_AD_TAGS = new Set([
    "apps/saroh.app/lib/trackers.ts",
    "apps/saroh.app/lib/trackers.test.ts",
    "apps/saroh.app/components/site-trackers.tsx",
    "apps/app.saroh.in/components/sites/site-search-tracking.test.tsx",
]);

/** The same shape as RULES, for every root in AD_FREE_ROOTS. */
const AD_RULES = [
    [
        /(?:GOOGLE_ADS|META_PIXEL)_(?:ID|[A-Z_]*LABEL)\b/u,
        "names one of Saroh's own ad ids or labels (they belong to saroh.in alone)",
        new Set(),
    ],
    [
        /googletagmanager\.com|googleadservices\.com|doubleclick\.net|connect\.facebook\.net|facebook\.com\/tr\b/iu,
        "holds an ad tag's address",
        MERCHANT_OWN_AD_TAGS,
    ],
    [
        /\b(?:gtag|fbq)\s*(?:\?\.)?\(|\bfbevents\b|\bgtag\/js\b/u,
        "calls or loads an ad tag",
        MERCHANT_OWN_AD_TAGS,
    ],
];

const under = (roots, path) =>
    roots.some((root) => path.startsWith(`${root}/`));

/**
 * The problems in a set of files, as "path: what" lines.
 * @param {{ path: string, text: string }[]} files
 */
export function problemsIn(files) {
    const problems = [];
    for (const { path, text } of files) {
        if (under(AD_FREE_ROOTS, path))
            for (const [shape, what, allowed] of AD_RULES)
                if (!allowed.has(path) && shape.test(text))
                    problems.push(`${path}: ${what}`);
        if (!under(MERCHANT_SITE_ROOTS, path)) continue;
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

/** Every tracked, readable file under the merchant sites' roots. */
export function merchantSiteFiles(cwd = process.cwd()) {
    return filesUnder(MERCHANT_SITE_ROOTS, cwd);
}

/** Every tracked, readable file this check reads: all of AD_FREE_ROOTS. */
export function scannedFiles(cwd = process.cwd()) {
    return filesUnder(AD_FREE_ROOTS, cwd);
}

function filesUnder(roots, cwd) {
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
    const files = scannedFiles();
    const problems = problemsIn(files);
    if (problems.length) {
        console.error(
            "check:merchant-site-tracking: merchant sites never load a tracker of Saroh's (DEC-125), and Saroh's ad tags live on saroh.in alone (DEC-127):\n  " +
                problems.join("\n  "),
        );
        process.exit(1);
    }
    console.log(`check:merchant-site-tracking: ${files.length} files, ok`);
}
