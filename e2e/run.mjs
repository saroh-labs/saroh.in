#!/usr/bin/env node
/**
 * The browser suite, in the order it has to run (`pnpm --filter @saroh/e2e
 * test:e2e`, CI's shards and `pnpm prepush --e2e` all come through here):
 *
 *   1. setup     — each seeded person signs in once, and the shared,
 *                  never-changed fixtures are made (tests/auth.setup.ts).
 *                  Never sharded: every shard is its own stack.
 *   2. parallel  — `desk` and `phone`, fullyParallel, on the config's
 *                  workers (PW_WORKERS). Every test here owns what it
 *                  changes.
 *   3. serial    — the `@serial` tests, which change what everyone reads
 *                  (a business setting, a storefront, Northwind's site),
 *                  one at a time once nothing else is running.
 *
 * Arguments go to phases 2 and 3 as they are: spec files, `--shard=2/4`,
 * `--grep`, `--retries`. A run that names `--project` is passed to
 * Playwright untouched, for when you want one project by hand.
 *
 * Both later phases run even when the one before failed, so a red run
 * reports everything; the exit code is the worst of them.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function playwright(phase, extra) {
    const res = spawnSync("pnpm", ["exec", "playwright", "test", ...extra], {
        stdio: "inherit",
        env: phase ? { ...process.env, E2E_PHASE: phase } : process.env,
    });
    return res.status ?? 1;
}

if (args.some((a) => a === "--project" || a.startsWith("--project="))) {
    process.exit(playwright(null, args));
}

// `--list` and friends: nothing to set up.
const listing = args.includes("--list");

console.log("=== e2e: setup (sign in, shared fixtures)");
const setup = listing ? 0 : playwright("setup", ["--project=setup"]);
if (setup !== 0) {
    console.error("=== e2e: setup failed; nothing else can run signed in");
    process.exit(setup);
}

console.log("=== e2e: parallel (desk, phone)");
const parallel = playwright("parallel", [
    ...args,
    "--project=desk",
    "--project=phone",
    "--no-deps",
    "--pass-with-no-tests",
]);

console.log("=== e2e: serial (@serial, one at a time)");
const serial = playwright("serial", [
    ...args,
    "--project=desk-serial",
    "--project=phone-serial",
    "--no-deps",
    "--workers=1",
    "--pass-with-no-tests",
]);

process.exit(parallel || serial);
