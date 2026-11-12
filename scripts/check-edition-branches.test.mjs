// The edition-branch check (DEC-204 item 7). Run by `pnpm run check:edition-branches`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { findBranches } from "./check-edition-branches.mjs";

/**
 * The environment without git's own variables: run from the pre-push hook,
 * GIT_DIR points at the real repo, so the empty repo's `git ls-files` listed
 * the real files (same fix as check-content-dates.test.mjs).
 */
const ENV = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

test("finds an edition branch however it's written", () => {
    assert.equal(findBranches(`if (EDITION === "GLOBAL") x();`).length, 1);
    assert.equal(findBranches(`a = edition !== 'INDIA';`).length, 1);
    assert.equal(findBranches(`edition ===\n    "GLOBAL"`).length, 1);
    assert.equal(findBranches(`"INDIA" === edition`).length, 1);
    assert.equal(findBranches(`switch (e) { case "GLOBAL": }`).length, 1);
    assert.match(findBranches(`\n\nedition === "GLOBAL"`)[0], /^3: /);
});

test("leaves facts, defaults and countries alone", () => {
    assert.deepEqual(
        findBranches(`
            if (PROFILE.taxSystem === "named-line") x();
            const edition = row.edition ?? "INDIA";
            if (country === "INDIA" || p.country === "IN") y();
            if (code !== "INDIA") z();
            hostsFor("GLOBAL", "production");
        `),
        [],
    );
});

test("fails when it scans nothing", () => {
    const empty = mkdtempSync(join(tmpdir(), "edition-branches-"));
    try {
        spawnSync("git", ["init", "-q"], { cwd: empty, env: ENV });
        const run = spawnSync(
            process.execPath,
            [join(import.meta.dirname, "check-edition-branches.mjs"), empty],
            { encoding: "utf8", env: ENV },
        );
        assert.equal(run.status, 1);
        assert.match(run.stderr, /nothing to check/);
    } finally {
        rmSync(empty, { recursive: true, force: true });
    }
});
