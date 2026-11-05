#!/usr/bin/env node
/**
 * The hreflang file is sound: every pair's path is unique on both sides and
 * written the same way, and the built sitemap names both directions of a pair
 * for a page it lists. `--live` also asks that both URLs answer 200, which
 * only makes sense once saroh.tech is live.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const file = join(root, "../../packages/edition/hreflang.json");
const data = JSON.parse(readFileSync(file, "utf8"));
const problems = [];

for (const side of ["tech", "in"]) {
    const seen = new Set();
    for (const pair of data.pairs) {
        const path = pair[side];
        if (!/^\/$|^(\/[a-z0-9-]+)+$/.test(path ?? "")) {
            problems.push(`${side}: "${path}" isn't a clean path`);
        }
        if (seen.has(path)) problems.push(`${side}: "${path}" is paired twice`);
        seen.add(path);
    }
}

const sitemap = join(root, "out/sitemap.xml");
if (existsSync(sitemap)) {
    const xml = readFileSync(sitemap, "utf8");
    for (const pair of data.pairs) {
        const tech = pair.tech === "/" ? data.tech : `${data.tech}${pair.tech}`;
        if (!xml.includes(`<loc>${tech}</loc>`)) continue;
        if (!xml.includes(`${data.in}${pair.in}`)) {
            problems.push(`sitemap lists ${tech} without its saroh.in pair`);
        }
    }
}

if (process.argv.includes("--live")) {
    for (const pair of data.pairs) {
        for (const url of [
            `${data.tech}${pair.tech}`,
            `${data.in}${pair.in}`,
        ]) {
            const res = await fetch(url, { redirect: "manual" });
            if (res.status !== 200)
                problems.push(`${url} answered ${res.status}`);
        }
    }
}

if (problems.length) {
    console.error(`check-hreflang:\n  ${problems.join("\n  ")}`);
    process.exit(1);
}
console.log(`check-hreflang: ${data.pairs.length} pairs sound`);
