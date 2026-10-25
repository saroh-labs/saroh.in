// The words check on fixture trees (#1186): it fails on the marketing
// site's old "Join the waitlist" and lets the product's class waitlist
// through. Run by `pnpm run check:words`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const SCRIPT = join(import.meta.dirname, "check-words.mjs");

/** Runs the check on a tree holding `files` ({path: source}). */
function check(files) {
    const root = mkdtempSync(join(tmpdir(), "check-words-"));
    try {
        for (const [path, source] of Object.entries(files)) {
            mkdirSync(join(root, dirname(path)), { recursive: true });
            writeFileSync(join(root, path), source);
        }
        return spawnSync(process.execPath, [SCRIPT, root], {
            encoding: "utf8",
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('fails on "Join the waitlist" in saroh.in content', () => {
    const r = check({
        "apps/saroh.in/content/band.ts":
            'export const band = { body: "Join the waitlist, and we\'ll email you." };\n',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /content\/band\.ts:1: "Join the waitlist"/);
});

test('fails on "announced at launch" in a saroh.in page', () => {
    const r = check({
        "apps/saroh.in/app/(v2)/page.tsx":
            "export default () => <p>Plan details are announced at launch.</p>;\n",
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /"announced at launch"/);
});

test("passes on the product's class waitlist in Help, and the waitlist page", () => {
    const r = check({
        "apps/help.saroh.in/content/bookings.mdx":
            "When a class is full, a customer can join the class waitlist.\n",
        "apps/saroh.in/content/help/classes.mdx":
            "Customers on the waitlist get the next free place.\n",
        "apps/saroh.in/content/waitlist.ts":
            'export const h = "Join the waitlist";\n',
    });
    assert.equal(r.status, 0, r.stderr);
});
