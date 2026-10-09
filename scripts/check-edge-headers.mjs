#!/usr/bin/env node
/**
 * The apps run on Cloudflare Workers, so the visitor's address and country
 * come only from Cloudflare's headers (`cf-connecting-ip`, `cf-ipcountry`),
 * which Cloudflare writes over anything a visitor sent.
 *
 * No app or package reads another header for them: `x-real-ip`,
 * `x-forwarded-for` and Vercel's `x-vercel-ip-*` reach a Worker as the
 * visitor sent them, so a fallback to one lets a visitor pick the address a
 * rate limit counts them by, or their country. Missing Cloudflare's header
 * means unknown, never a fallback.
 *
 * Missed three times: saroh.app's relay (7 Oct 2026) and saroh.in's waitlist
 * and link-preview limits (8 Oct), which read only the old platform's
 * headers; then the fallbacks kept beside Cloudflare's (9 Oct). DEV_LEARNINGS.
 *
 * The API is behind Traefik, not a Worker, and takes the client address from
 * Express's trust-proxy setting (`apps/api.saroh.in/src/common/trust-proxy.ts`),
 * which this leaves alone. Tests and browser specs may send any header.
 *
 * Run from the repo root.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ALLOWED = new Set(["apps/api.saroh.in/src/common/trust-proxy.ts"]);

const files = execFileSync(
    "git",
    [
        "ls-files",
        "apps/*.ts",
        "apps/*.tsx",
        "apps/*.js",
        "apps/*.mjs",
        "packages/*.ts",
        "packages/*.tsx",
    ],
    { encoding: "utf8" },
)
    .split("\n")
    .filter(
        (f) =>
            f &&
            !ALLOWED.has(f) &&
            !/\.(test|spec)\.[cm]?[jt]sx?$/u.test(f) &&
            !f.includes("/e2e/"),
    );

/** A header a visitor can write -> the Cloudflare header to read instead. */
const FORBIDDEN = [
    [/^x-real-ip$/u, "cf-connecting-ip"],
    [/^x-forwarded-for$/u, "cf-connecting-ip"],
    [/^x-vercel-ip-country$/u, "cf-ipcountry"],
    [/^x-vercel-ip-/u, "Cloudflare's request.cf or cf-* header"],
];
/** Header names written as string literals ("…" or '…'), so comments pass. */
const LITERAL = /["']([a-z0-9-]+)["']/giu;

const problems = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    const seen = new Set();
    for (const [, raw] of text.matchAll(LITERAL)) {
        const name = raw.toLowerCase();
        if (seen.has(name)) continue;
        const rule = FORBIDDEN.find(([shape]) => shape.test(name));
        if (!rule) continue;
        seen.add(name);
        problems.push(`${file}: reads ${name}; read ${rule[1]} only`);
    }
}

if (problems.length) {
    console.error(
        "check:edge-headers: these read a visitor header a visitor can write:\n  " +
            problems.join("\n  "),
    );
    process.exit(1);
}
console.log(`check:edge-headers: ${files.length} files, ok`);
