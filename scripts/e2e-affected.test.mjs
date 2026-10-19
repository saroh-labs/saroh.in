// What `check:e2e-covers` accepts in a spec's `// @covers` line: a key of a
// surface it knows (the operator console's `admin:` among them, plan U23)
// and nothing it doesn't. Runs the real validator over the real tree
// (`--check-keys`). Run by `pnpm run check:e2e-covers`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const SCRIPT = resolve(import.meta.dirname, "e2e-affected.mjs");

function checkKeys(...keys) {
    const res = spawnSync(process.execPath, [SCRIPT, "--check-keys", ...keys], {
        encoding: "utf8",
    });
    return { status: res.status, stderr: res.stderr };
}

test("the operator console's routes are keys", () => {
    const r = checkKeys("admin:/", "admin:/businesses", "api:admin");
    assert.equal(r.status, 0, r.stderr);
});

test("an admin route that does not exist is refused", () => {
    const r = checkKeys("admin:/no-such-screen");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown key admin:\/no-such-screen/);
});

test("a prefix no surface has is refused", () => {
    const r = checkKeys("admin:/", "console:/");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown key console:\//);
    assert.doesNotMatch(r.stderr, /unknown key admin:\//);
});

test("the other surfaces still answer", () => {
    const r = checkKeys("app:/", "accounts:/login", "web:/", "api:orders");
    assert.equal(r.status, 0, r.stderr);
});
