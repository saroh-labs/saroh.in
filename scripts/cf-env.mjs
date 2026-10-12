#!/usr/bin/env node
/**
 * Prints a Cloudflare app's settings as KEY=VALUE lines, read from its
 * `wrangler.jsonc` (`vars` at the top level for dev, `env.production.vars`
 * for production).
 *
 * The deploy workflow appends them to $GITHUB_ENV before building, so the
 * values compiled into the build (NEXT_PUBLIC_*, and what the static pages
 * read) are the same ones the Worker is given at runtime. One place to change
 * a setting, and the build and the Worker can't disagree.
 *
 *   node scripts/cf-env.mjs apps/accounts.saroh.in development
 *   node scripts/cf-env.mjs apps/accounts.saroh.in production
 *   node scripts/cf-env.mjs --routes apps/accounts.saroh.in production
 *
 * Only `vars` (settings that aren't secret). Secrets come from GitHub and are
 * never printed.
 *
 * One setting is a date: `LAUNCH_AT`, the instant early access opens (an ISO
 * time with its offset, in production `vars`). A build made at or after it
 * gets that app's launch switches (`AT_LAUNCH` below) without anyone editing
 * a file; a build before it gets exactly what the file says. A switch written
 * in `vars` wins either way. `buildVars()` is what a build is given;
 * `appVars()` is the file as written, which is what the Worker gets.
 */
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

/** JSON with comments and trailing commas, as wrangler.jsonc is written. */
export function parseJsonc(text) {
    let out = "";
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            out += c;
            if (c === "\\") out += text[++i] ?? "";
            else if (c === '"') inString = false;
        } else if (c === '"') {
            inString = true;
            out += c;
        } else if (c === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i++;
            out += "\n";
        } else if (c === "/" && text[i + 1] === "*") {
            i += 2;
            while (i < text.length && !(text[i] === "*" && text[i + 1] === "/"))
                i++;
            i++;
        } else {
            out += c;
        }
    }
    return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function appVars(appDir, environment) {
    const config = parseJsonc(
        readFileSync(join(appDir, "wrangler.jsonc"), "utf8"),
    );
    if (environment === "production") return config.env?.production?.vars ?? {};
    if (environment === "development") return config.vars ?? {};
    throw new Error(
        `environment must be development or production, not ${environment}`,
    );
}

/**
 * What each app's build switches to once `LAUNCH_AT` has passed, keyed by the
 * app's folder. Accounts has none: its gate opens by the clock at runtime
 * (`withDevAccess`, @saroh/auth/dev-access), with no build.
 */
export const AT_LAUNCH = {
    // "Start free", Sign in and Pricing on the marketing site.
    "saroh.in": { NEXT_PUBLIC_LAUNCH_MODE: "open" },
    // Plan and billing in the workspace (DEC-136).
    "app.saroh.in": { NEXT_PUBLIC_PLANS: "on" },
};

const ISO_INSTANT =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * `LAUNCH_AT` as milliseconds, or null when it isn't a full ISO instant with
 * its offset ("2026-10-17T16:00:00+05:30", or ending in "Z"). Strict on
 * purpose: a date with no time or no offset means a different moment on every
 * machine, and a value that can't be read must leave things locked. The same
 * rule as `launchInstant` in packages/auth/src/dev-access.ts; keep them alike.
 */
export function launchInstant(value) {
    if (typeof value !== "string" || !ISO_INSTANT.test(value.trim()))
        return null;
    const ms = Date.parse(value.trim());
    return Number.isFinite(ms) ? ms : null;
}

/** `vars` with the launch switches, as of `now`. A switch already set is kept. */
export function withLaunch(vars, switches, now) {
    if (vars.LAUNCH_AT === undefined || !switches) return vars;
    const at = launchInstant(vars.LAUNCH_AT);
    if (at === null || now.getTime() < at) return vars;
    return { ...switches, ...vars };
}

/** What a build of this app gets: its `vars`, with the launch switches by date. */
export function buildVars(appDir, environment, now = new Date()) {
    return withLaunch(
        appVars(appDir, environment),
        AT_LAUNCH[basename(appDir)],
        now,
    );
}

/** `--var KEY:VALUE` for each setting the build got that the file doesn't have. */
export function deployVarFlags(written, built) {
    return Object.entries(built)
        .filter(([key]) => !(key in written))
        .map(([key, value]) => `--var ${key}:${value}`)
        .join(" ");
}

/** The routes a deploy gives the Worker: `[{ pattern, zone_name }]`. */
export function appRoutes(appDir, environment) {
    const config = parseJsonc(
        readFileSync(join(appDir, "wrangler.jsonc"), "utf8"),
    );
    const routes =
        environment === "production"
            ? config.env?.production?.routes
            : config.routes;
    return Array.isArray(routes) ? routes : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
    // `--routes`: "zone pattern" lines for the deploy's fail-open step.
    if (process.argv[2] === "--routes") {
        for (const r of appRoutes(process.argv[3], process.argv[4])) {
            console.log(`${r.zone_name} ${r.pattern}`);
        }
        process.exit(0);
    }
    const [appDir, environment] = process.argv.slice(2);
    if (!appDir || !environment) {
        console.error(
            "usage: node scripts/cf-env.mjs <app dir> <development|production>",
        );
        process.exit(2);
    }
    const written = appVars(appDir, environment);
    if (
        written.LAUNCH_AT !== undefined &&
        launchInstant(written.LAUNCH_AT) === null
    )
        console.error(
            "LAUNCH_AT can't be read as an ISO time with its offset: nothing opens by date",
        );
    const vars = buildVars(appDir, environment);
    // The switches the date added aren't in wrangler.jsonc, so the deploy
    // hands them to the Worker itself (`--var`, the workflow's Deploy step):
    // decided once, here, so the build and the Worker still can't disagree.
    console.log(`LAUNCH_DEPLOY_VARS=${deployVarFlags(written, vars)}`);
    for (const [key, value] of Object.entries(vars)) {
        if (/[\r\n]/.test(String(value)))
            throw new Error(`${key} has a line break`);
        console.log(`${key}=${value}`);
    }
}
