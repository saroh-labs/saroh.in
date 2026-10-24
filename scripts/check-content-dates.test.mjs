// The content-dates check on a fixture repo (R3, #1187): a saroh.in content
// module whose words change fails without a new `UPDATED`, and passes with
// one. Run by `pnpm run check:content-dates`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(import.meta.dirname, "check-content-dates.mjs");

const HOME = "apps/saroh.in/content/home.ts";
const RAZORPAY = "apps/saroh.in/content/integrations/razorpay.mdx";
const BASE = {
    [HOME]: 'export const UPDATED = "2026-10-12";\nexport const h = "Old words";\n',
    [RAZORPAY]: '---\nslug: razorpay\nupdated: "2026-10-12"\n---\nOld words\n',
    "apps/saroh.in/content/types.ts": "export type A = string;\n",
};

/** A repo whose first commit (tagged `base`) holds BASE, then `edits` uncommitted. */
function check(edits) {
    const root = mkdtempSync(join(tmpdir(), "check-content-dates-"));
    const git = (...args) =>
        execFileSync("git", args, { cwd: root, stdio: "ignore" });
    const write = (files) => {
        for (const [path, source] of Object.entries(files)) {
            mkdirSync(join(root, dirname(path)), { recursive: true });
            writeFileSync(join(root, path), source);
        }
    };
    try {
        git("init", "-q");
        write(BASE);
        git("add", ".");
        git(
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.com",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-qm",
            "base",
        );
        git("tag", "base");
        write(edits);
        return spawnSync(process.execPath, [SCRIPT, "base"], {
            cwd: root,
            encoding: "utf8",
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test("fails when a content module's words change but UPDATED doesn't", () => {
    const r = check({
        [HOME]: 'export const UPDATED = "2026-10-12";\nexport const h = "New words";\n',
    });
    assert.equal(r.status, 1);
    assert.match(
        r.stderr,
        /content\/home\.ts: its words changed, its date is still 2026-10-12/,
    );
});

test("fails when a provider page's words change but updated: doesn't", () => {
    const r = check({
        [RAZORPAY]:
            '---\nslug: razorpay\nupdated: "2026-10-12"\n---\nNew words\n',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /razorpay\.mdx: its words changed/);
});

test("fails when the date is taken out", () => {
    const r = check({ [HOME]: 'export const h = "New words";\n' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /its date was removed \(was 2026-10-12\)/);
});

test("passes when the date moves with the words, and on a module with no date", () => {
    const r = check({
        [HOME]: 'export const UPDATED = "2026-10-24";\nexport const h = "New words";\n',
        "apps/saroh.in/content/types.ts": "export type A = number;\n",
    });
    assert.equal(r.status, 0, r.stderr);
});

test("skips when the base isn't there", () => {
    const root = mkdtempSync(join(tmpdir(), "check-content-dates-"));
    try {
        execFileSync("git", ["init", "-q"], { cwd: root });
        const r = spawnSync(process.execPath, [SCRIPT, "origin/nowhere"], {
            cwd: root,
            encoding: "utf8",
        });
        assert.equal(r.status, 0, r.stderr);
        assert.match(r.stdout, /skipped/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
