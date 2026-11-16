// The marketing shots' release check (check-shots.mjs). Run by
// `pnpm run check:shots`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
    checkSite,
    pendingShots,
    referencedKeys,
    shotKeys,
    SITES,
    suppliedKeys,
} from "./check-shots.mjs";

const ROOT = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

test("reads the kit's keys and finds them, and help keys, in sources", () => {
    const known = shotKeys(
        'export const SHOT_KEYS = [\n    "s-home",\n    "g-plans",\n] as const;',
    );
    assert.deepEqual([...known], ["s-home", "g-plans"]);
    const used = referencedKeys(
        [
            {
                path: "a.ts",
                text: 'hero: { shot: "s-home" }, cls: "xs-home-2"',
            },
            { path: "b.mdx", text: "    shot: help-add-product-1\n" },
        ],
        known,
    );
    assert.deepEqual([...used.keys()], ["s-home", "help-add-product-1"]);
});

test("reads PENDING_SHOTS' reasons through their constants", () => {
    const pending = pendingShots(`const WHY =\n    "Not on Free.";
export const PENDING_SHOTS: Partial<Record<ShotKey, string>> = {
    "g-subs": WHY,
    "r-supply":
        "India's rule.",
};`);
    assert.deepEqual(Object.fromEntries(pending), {
        "g-subs": "Not on Free.",
        "r-supply": "India's rule.",
    });
});

test("finds supplied specs in both forms", () => {
    const keys = suppliedKeys(`{
        key: "ai-hero",
        supplied: "by hand",
    },
    { key: "ai-consent", route: "/" },
    sameAs("ai-ask", {
        supplied: "by hand",
    }),
    sameAs("sh-post", { alt: "x" }),`);
    assert.deepEqual([...keys].sort(), ["ai-ask", "ai-hero"]);
});

test("the real files: Claude's screens are supplied in both editions, reasons read", () => {
    for (const site of Object.values(SITES)) {
        const supplied = suppliedKeys(read(site.config));
        for (const key of ["ai-hero", "ai-ask", "ai-connect"])
            assert.ok(supplied.has(key), `${site.config}: ${key}`);
    }
    // Saroh's own AI-app screens, kept by hand: the release stack has no MCP sign-in.
    const india = suppliedKeys(read(SITES["saroh.in"].config));
    for (const key of ["ai-consent", "ai-activity"])
        assert.ok(india.has(key), key);
    const pending = pendingShots(read(SITES["saroh.tech"].pending));
    assert.ok(pending.size > 0);
    for (const [key, why] of pending) assert.match(why, / /, key);
});

test("fails a missing key, allows a pending one, and with --since an old one", () => {
    const used = new Map([
        ["s-home", new Set(["home.ts"])],
        ["g-subs", new Set(["features.ts"])],
        ["ai-hero", new Set(["features.ts"])],
        ["s-orders", new Set(["features.ts"])],
    ]);
    const old = new Date("2026-11-01T00:00Z");
    const ages = {
        "shots/v2/s-home.webp": { time: old, committed: true },
        "shots/v2/ai-hero.webp": { time: old, committed: true },
    };
    const run = (since) =>
        checkSite({
            used,
            allowed: new Map([["g-subs", "Not on Free."]]),
            supplied: new Set(["ai-hero"]),
            ageOf: (f) => ages[f] ?? null,
            since,
        });

    const plain = run(null);
    assert.equal(plain.errors.length, 1);
    assert.match(plain.errors[0], /^s-orders: no image .* features\.ts$/);
    assert.equal(
        plain.rows.find((r) => r.key === "g-subs").status,
        "pending: Not on Free.",
    );

    const fresh = run(new Date("2026-11-17T00:00Z"));
    assert.equal(fresh.errors.length, 2);
    assert.match(fresh.errors.join("\n"), /s-home: not retaken/);
    assert.equal(
        fresh.rows.find((r) => r.key === "ai-hero").status,
        "supplied",
    );
});
