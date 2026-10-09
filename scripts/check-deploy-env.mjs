#!/usr/bin/env node
/**
 * Every app on Cloudflare knows which environment it is built for, and its
 * deploy build would pass its own required-variables check.
 *
 * The apps keep Vercel's names for the environment (DEC-107): `VERCEL_ENV`
 * (`production` | `preview`), `VERCEL_GIT_COMMIT_REF` (`main` |
 * `development`) and, where an app's env.ts reads it, `NEXT_PUBLIC_VERCEL_ENV`.
 * Each app's wrangler.jsonc sets them, and the deploy workflow builds with its
 * vars (scripts/cf-env.mjs). Without them a production build skips
 * next.config's required-variables check and any "not in production" lock
 * reads as off. saroh.app's Worker ran so until 9 Oct 2026 (DEV_LEARNINGS).
 *
 * For each app and environment this:
 *   1. requires the markers in its wrangler.jsonc vars;
 *   2. loads its next.config in a clean process with only what the deploy
 *      build would have (those vars, plus the secrets deploy-frontends.yml
 *      passes, as placeholders) and fails if the config refuses;
 *   3. loads it again with only the marker set, and fails if the config
 *      accepts that: it must still have a check to run.
 *
 * Offline: reads files only, prints names never values. Run from the repo
 * root.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { appVars } from "./cf-env.mjs";
import { APPS } from "./cf-plan.mjs";

const WORKFLOW = ".github/workflows/deploy-frontends.yml";

/** What each environment's vars must say. */
const MARKERS = {
    production: { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" },
    development: {
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "development",
    },
};

/**
 * The secrets the deploy's "Secrets" step adds to the build for this app,
 * as deploy-frontends.yml decides them. Its conditions are checked below,
 * so this can't drift from the workflow unnoticed.
 */
function workflowSecrets(pkg, environment) {
    const names = [];
    if (environment === "development" && pkg !== "sites")
        names.push("DEV_ACCESS_KEY");
    if (pkg === "web" || pkg === "sites") names.push("SITE_RELAY_SECRET");
    return names;
}
const WORKFLOW_CONDITIONS = [
    '[ "${{ matrix.env }}" = development ] && [ "${{ matrix.pkg }}" != sites ]',
    '[ "${{ matrix.pkg }}" = web ] || [ "${{ matrix.pkg }}" = sites ]',
    "DEV_ACCESS_KEY: ${{ secrets.DEV_ACCESS_KEY }}",
    "SITE_RELAY_SECRET: ${{ secrets.SITE_RELAY_SECRET }}",
    'node scripts/cf-env.mjs "${{ matrix.dir }}" "${{ matrix.env }}" >> "$GITHUB_ENV"',
];

function nextConfig(dir) {
    for (const name of ["next.config.js", "next.config.mjs"]) {
        const file = join(dir, name);
        if (existsSync(file)) return file;
    }
    throw new Error(`${dir}: no next.config`);
}

/** Loads a config with exactly `env` (plus PATH); returns its error or null. */
function loadError(file, env) {
    const url = pathToFileURL(join(process.cwd(), file)).href;
    try {
        execFileSync(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                `await import(${JSON.stringify(url)})`,
            ],
            {
                env: { PATH: process.env.PATH, NODE_ENV: "production", ...env },
                stdio: ["ignore", "ignore", "pipe"],
                encoding: "utf8",
            },
        );
        return null;
    } catch (error) {
        const lines = String(error.stderr ?? error.message).split("\n");
        return lines.find((l) => /Error:/u.test(l))?.trim() ?? "refused";
    }
}

const problems = [];

const workflow = readFileSync(WORKFLOW, "utf8");
for (const condition of WORKFLOW_CONDITIONS)
    if (!workflow.includes(condition))
        problems.push(
            `${WORKFLOW}: no longer says ${condition}; update workflowSecrets() here to match`,
        );

for (const [pkg, dir] of Object.entries(APPS)) {
    const config = nextConfig(dir);
    const envTs = existsSync(join(dir, "env.ts"))
        ? readFileSync(join(dir, "env.ts"), "utf8")
        : "";
    const readsPublicMarker = envTs.includes("NEXT_PUBLIC_VERCEL_ENV");

    for (const [environment, markers] of Object.entries(MARKERS)) {
        const where = `${dir}/wrangler.jsonc (${environment === "production" ? "env.production.vars" : "vars"})`;
        const vars = appVars(dir, environment);

        for (const [key, value] of Object.entries(markers))
            if (vars[key] !== value)
                problems.push(`${where}: ${key} must be "${value}"`);
        if (
            readsPublicMarker &&
            vars.NEXT_PUBLIC_VERCEL_ENV !== markers.VERCEL_ENV
        )
            problems.push(
                `${where}: NEXT_PUBLIC_VERCEL_ENV must be "${markers.VERCEL_ENV}" (env.ts reads it)`,
            );

        const secrets = Object.fromEntries(
            workflowSecrets(pkg, environment).map((n) => [n, "set-by-check"]),
        );
        const deployError = loadError(config, { ...vars, ...secrets });
        if (deployError)
            problems.push(
                `${config}: a ${environment} deploy build would refuse: ${deployError}`,
            );

        const bareError = loadError(config, markers);
        if (!bareError)
            problems.push(
                `${config}: a ${environment} build with no settings loads; its required-variables check is gone`,
            );
    }
}

if (problems.length) {
    console.error(`check:deploy-env:\n  ${problems.join("\n  ")}`);
    process.exit(1);
}
console.log(
    `check:deploy-env: ${Object.keys(APPS).length} apps, production and development, ok`,
);
