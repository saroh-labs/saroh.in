#!/usr/bin/env node
/**
 * The apps run on Cloudflare Workers, so the visitor's address and country
 * come from Cloudflare's headers (`cf-connecting-ip`, `cf-ipcountry`).
 * A file that reads a platform header naming the visitor (`x-real-ip`,
 * `x-vercel-ip-*`) must read Cloudflare's too: behind Cloudflare those name
 * Cloudflare's edge or aren't sent at all.
 *
 * Twice missed: saroh.app's relay (7 Oct 2026) and saroh.in's waitlist and
 * link-preview limits (8 Oct), which keyed every visitor on one stand-in
 * address and lost the country (DEV_LEARNINGS).
 *
 * Run from the repo root. Tests are left alone.
 */
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync(
    "git",
    ["ls-files", "apps/*.ts", "apps/*.tsx", "packages/*.ts", "packages/*.tsx"],
    { encoding: "utf8" },
)
    .split("\n")
    .filter(
        (f) => f && !/\.(test|spec)\.tsx?$/u.test(f) && !f.includes("/e2e/"),
    );

/** A platform header -> the Cloudflare header that must sit beside it. */
const PAIRS = [
    ["x-real-ip", "cf-connecting-ip"],
    ["x-vercel-ip-country", "cf-ipcountry"],
    ["x-vercel-ip-city", "cf-ipcity"],
];
const quoted = (name) => new RegExp(`["'\`]${name}["'\`]`, "iu");

const problems = [];
for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const [platform, cloudflare] of PAIRS)
        if (quoted(platform).test(text) && !quoted(cloudflare).test(text))
            problems.push(`${file}: reads ${platform} but not ${cloudflare}`);
}

if (problems.length) {
    console.error(
        "check:edge-headers: these read a visitor header Cloudflare doesn't send:\n  " +
            problems.join("\n  "),
    );
    process.exit(1);
}
console.log(`check:edge-headers: ${files.length} files, ok`);
