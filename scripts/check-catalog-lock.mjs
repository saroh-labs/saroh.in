#!/usr/bin/env node
/**
 * Every exactly pinned catalog entry in pnpm-workspace.yaml must be the
 * version pnpm-lock.yaml resolved for it.
 *
 * On 7 Oct 2026 the `next16` catalog moved 16.3.6 -> 16.3.8 and pnpm 9.9
 * rewrote the lockfile's specifier but kept `version: 16.3.6`: every app
 * still installed 16.3.6, `pnpm install --frozen-lockfile` passed, and
 * nothing said so (DEV_LEARNINGS). A range (`^1.2.0`) is left alone; only an
 * exact `x.y.z` pin promises one version.
 *
 * Run from the repo root.
 */
import { readFile } from "node:fs/promises";

const lock = await readFile("pnpm-lock.yaml", "utf8");
const start = lock.indexOf("\ncatalogs:\n");
if (start === -1) {
    console.log("check:catalog-lock: no catalogs in the lockfile");
    process.exit(0);
}
// The catalogs block ends at the next top-level key.
const rest = lock.slice(start + "\ncatalogs:\n".length);
const end = rest.search(/\n[^\s\n]/u);
const block = end === -1 ? rest : rest.slice(0, end);

const EXACT = /^\d+\.\d+\.\d+$/u;
const problems = [];
let catalog = "";
let pkg = "";
let specifier = "";
for (const line of block.split("\n")) {
    const c = line.match(/^ {2}(\S[^:]*):$/u);
    if (c) {
        catalog = c[1];
        continue;
    }
    const p = line.match(/^ {4}'?([^:']+)'?:$/u);
    if (p) {
        pkg = p[1];
        specifier = "";
        continue;
    }
    const s = line.match(/^ {6}specifier: '?([^']+?)'?$/u);
    if (s) {
        specifier = s[1];
        continue;
    }
    const v = line.match(/^ {6}version: '?([^'(]+)/u);
    if (v && EXACT.test(specifier) && v[1] !== specifier) {
        problems.push(
            `${catalog} › ${pkg}: pinned ${specifier}, but the lockfile resolved ${v[1]}`,
        );
    }
}

if (problems.length > 0) {
    console.error("check:catalog-lock failed:");
    for (const p of problems) console.error(`  ${p}`);
    console.error(
        "Fix: set the lockfile entry's version to the pin and run `pnpm install`.",
    );
    process.exit(1);
}
console.log("check:catalog-lock: every pinned catalog entry matches the lockfile");
