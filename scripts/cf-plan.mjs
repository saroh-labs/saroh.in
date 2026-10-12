#!/usr/bin/env node
/**
 * Which Cloudflare apps to deploy: the ones whose build would differ from
 * what is live.
 *
 * Each deploy labels its Worker with the app's build fingerprint
 * (`BUILD_FINGERPRINT`, Turbo's hash of everything its build reads: its own
 * files, the workspace packages it uses, the lockfile and its settings). Here
 * each app's fingerprint is worked out for the environment and compared with
 * the live Worker's. Only a difference deploys, so a test, a doc or another
 * app's change deploys nothing, and a failed or skipped deploy is retried on
 * the next run.
 *
 *   node scripts/cf-plan.mjs development            # JSON list to deploy
 *   node scripts/cf-plan.mjs production web,sites   # only these, if changed
 *   FORCE=1 node scripts/cf-plan.mjs development web  # deploy regardless
 *   node scripts/cf-plan.mjs --launch-wait            # seconds to LAUNCH_AT
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to read the live
 * fingerprints; without them, or when a Worker can't be read, the app counts
 * as changed. Prints nothing secret.
 */
import { execFileSync } from "node:child_process";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appVars, buildVars, launchInstant, parseJsonc } from "./cf-env.mjs";

/** Turbo package name -> app directory. */
export const APPS = {
    web: "apps/saroh.in",
    application: "apps/app.saroh.in",
    auth: "apps/accounts.saroh.in",
    admin: "apps/admin.saroh.in",
    sites: "apps/saroh.app",
};

/** The Worker a deploy of this app and environment updates. */
export function workerName(dir, environment) {
    const config = parseJsonc(
        readFileSync(join(dir, "wrangler.jsonc"), "utf8"),
    );
    return environment === "production"
        ? config.env.production.name
        : config.name;
}

/**
 * Turbo's hash of the app's build, with the environment's settings set: the
 * ones a build would get now (`buildVars`). So the fingerprint changes when
 * `LAUNCH_AT` passes, and the first push after it deploys the apps it opens
 * instead of calling them unchanged. That needs every launch switch among
 * turbo.json's hashed `globalEnv`, which scripts/cf-env.test.mjs checks.
 */
export function fingerprint(pkg, environment, now = new Date()) {
    const env = { ...process.env, ...buildVars(APPS[pkg], environment, now) };
    const out = execFileSync(
        "pnpm",
        [
            "-s",
            "exec",
            "turbo",
            "run",
            "build",
            `--filter=${pkg}`,
            "--dry=json",
        ],
        { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const task = JSON.parse(out).tasks.find((t) => t.taskId === `${pkg}#build`);
    if (!task) throw new Error(`no ${pkg}#build in turbo's plan`);
    // The environment is part of the label: the same commit builds differently
    // for dev and production.
    return `${environment}-${task.hash}`;
}

/** The scheduled launch run sleeps this long at most; further off, it isn't the launch. */
export const LAUNCH_WAIT_MAX_SECONDS = 90 * 60;

/**
 * For the one-time scheduled launch run: how many seconds until every
 * production app's `LAUNCH_AT` has passed (0 when it already has; a few
 * seconds over, so the build's own clock is past it too), or "none" when the
 * run should deploy nothing: no app has a `LAUNCH_AT`, one can't be read, or
 * the launch is more than `LAUNCH_WAIT_MAX_SECONDS` away (it was moved).
 */
export function launchWait(launchAts, now) {
    if (launchAts.length === 0) return "none";
    const instants = launchAts.map(launchInstant);
    if (instants.includes(null)) return "none";
    const ms = Math.max(...instants) - now.getTime();
    if (ms <= 0) return 0;
    const seconds = Math.ceil(ms / 1000) + 5;
    return seconds > LAUNCH_WAIT_MAX_SECONDS ? "none" : seconds;
}

async function liveFingerprint(worker) {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const account = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!token || !account) return null;
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/settings`,
        { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const binding = (body.result?.bindings ?? []).find(
        (b) => b.type === "plain_text" && b.name === "BUILD_FINGERPRINT",
    );
    return binding?.text ?? null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    if (process.argv[2] === "--launch-wait") {
        const launchAts = Object.values(APPS)
            .map((dir) => appVars(dir, "production").LAUNCH_AT)
            .filter((value) => value !== undefined);
        console.log(launchWait(launchAts, new Date()));
        process.exit(0);
    }
    const [environment, only] = process.argv.slice(2);
    if (environment !== "development" && environment !== "production") {
        console.error(
            "usage: node scripts/cf-plan.mjs <development|production> [pkg,pkg]",
        );
        process.exit(2);
    }
    const pkgs = only ? only.split(",").filter(Boolean) : Object.keys(APPS);
    const plan = [];
    for (const pkg of pkgs) {
        if (!(pkg in APPS)) throw new Error(`unknown app ${pkg}`);
        const hash = fingerprint(pkg, environment);
        const live = await liveFingerprint(workerName(APPS[pkg], environment));
        const deploy = process.env.FORCE === "1" || live !== hash;
        console.error(
            `${pkg} (${environment}): ${deploy ? "deploy" : "unchanged"}` +
                `${live === hash ? "" : live ? " (live build differs)" : " (no live fingerprint)"}`,
        );
        if (deploy)
            plan.push({
                pkg,
                dir: APPS[pkg],
                env: environment,
                fingerprint: hash,
            });
    }
    console.log(JSON.stringify(plan));
}
