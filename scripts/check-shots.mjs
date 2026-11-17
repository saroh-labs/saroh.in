// The marketing shots' release check (DEC-221; devops-tooling-and-deploy.md →
// "Marketing screenshots are taken fresh for every production release").
//
// For saroh.in and saroh.tech it lists every shot key the site's pages name
// (any `SHOT_KEYS` key or `help-…-<n>` key written in its app/, components/,
// content/ or lib/, tests and the manifests aside) and fails when one has no
// image under the site's `public/shots/`. Allowed without one:
//   - saroh.tech: a key in `content/shots.ts`'s PENDING_SHOTS (its reason is
//     printed);
//   - saroh.in: a help article's shot while its feature's release switch is
//     off in production (`feature:` in its frontmatter; the feature-release
//     check holds it once the switch is on).
// It prints each image's age for the reviewer: its last commit's date, or
// its file time when it isn't committed (a capture just taken).
//
//   node scripts/check-shots.mjs                       every named key has an image
//   node scripts/check-shots.mjs --since=2026-11-17T09:00Z
//                                                      … and was written since then
//
// `--since` is the release run's: a key whose image is older than the capture
// wasn't retaken and fails too, except one India's or Global's spec marks
// `supplied` (another product's screen, put in place by hand).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
    helpArticle,
    parseJsonc,
    releaseSwitches,
    switchesOn,
} from "./check-feature-release.mjs";

export const SITES = {
    "saroh.in": {
        dir: "apps/saroh.in",
        config: "e2e/marketing-shots/shots.config.ts",
    },
    "saroh.tech": {
        dir: "apps/saroh.tech",
        config: "e2e/marketing-shots/shots.global.ts",
        pending: "apps/saroh.tech/content/shots.ts",
    },
};
const TYPES = "packages/marketing/src/content/types.ts";
const SWITCHES = "packages/marketing/src/content/feature-switches.ts";
const WRANGLER = "apps/saroh.in/wrangler.jsonc";
const SCANNED = ["app", "components", "content", "lib"];

/** `SHOT_KEYS` in the kit's content types. */
export function shotKeys(typesSource) {
    const block =
        typesSource.match(/SHOT_KEYS = \[([\s\S]*?)\] as const/)?.[1] ?? "";
    return new Set([...block.matchAll(/"([\w-]+)"/g)].map((m) => m[1]));
}

/** Each key a source names, with the files naming it. */
export function referencedKeys(files, known) {
    const used = new Map();
    for (const { path, text } of files) {
        for (const [, key] of text.matchAll(
            /(?<![\w-])([a-z]+(?:-[a-z0-9]+)+)(?![\w-])/g,
        )) {
            if (!known.has(key) && !/^help-[a-z0-9-]+-\d+$/.test(key)) continue;
            if (!used.has(key)) used.set(key, new Set());
            used.get(key).add(path);
        }
    }
    return used;
}

/** PENDING_SHOTS: key → reason, the reason's constant read through. */
export function pendingShots(source) {
    const consts = Object.fromEntries(
        [...source.matchAll(/^const (\w+) =\s*"((?:[^"\\]|\\.)*)";/gm)].map(
            (m) => [m[1], m[2]],
        ),
    );
    const block =
        source.match(/PENDING_SHOTS[^=]*= \{([\s\S]*?)\n\};/)?.[1] ?? "";
    return new Map(
        [
            ...block.matchAll(
                /^\s*"([\w-]+)":\s*(?:(\w+)|"((?:[^"\\]|\\.)*)")\s*,/gm,
            ),
        ].map((m) => [m[1], m[3] ?? consts[m[2]] ?? m[2]]),
    );
}

/** Keys a capture spec marks `supplied`: put in place by hand, never taken. */
export function suppliedKeys(configSource) {
    const keys = new Set();
    const parts = configSource.split(/(?=(?:\bkey: |\bsameAs\()"[\w-]+")/);
    for (const part of parts) {
        const key = part.match(/^(?:key: |sameAs\()"([\w-]+)"/)?.[1];
        if (key && /^\s*supplied:/m.test(part)) keys.add(key);
    }
    return keys;
}

/** Help shots whose article waits for a switch production has off: key → feature. */
export function helpWaiting(helpTexts, offFeatures) {
    const waiting = new Map();
    for (const text of helpTexts) {
        const a = helpArticle(text);
        if (!a.feature || !offFeatures.includes(a.feature)) continue;
        for (const shot of a.shots) waiting.set(shot, a.feature);
    }
    return waiting;
}

/** Where a key's image is, under the site's `public/`. */
export const imageOf = (key) =>
    key.startsWith("help-") ? `shots/help/${key}.webp` : `shots/v2/${key}.webp`;

/**
 * One site's result. `ageOf(file)` → `{ time, committed }` or null when the
 * file is missing; `allowed` maps a key to why it may have none.
 */
export function checkSite({ used, allowed, supplied, ageOf, since }) {
    const errors = [];
    const rows = [];
    for (const key of [...used.keys()].sort()) {
        const file = imageOf(key);
        const age = ageOf(file);
        if (!age) {
            if (allowed.has(key)) {
                rows.push({ key, status: `pending: ${allowed.get(key)}` });
            } else {
                errors.push(
                    `${key}: no image (${file}), named in ${[...used.get(key)].sort().join(", ")}`,
                );
                rows.push({ key, status: "MISSING" });
            }
            continue;
        }
        const stale = since && age.time < since && !supplied.has(key);
        if (stale)
            errors.push(
                `${key}: not retaken since ${since.toISOString()} (${file})`,
            );
        rows.push({
            key,
            status: stale
                ? "NOT RETAKEN"
                : supplied.has(key)
                  ? "supplied"
                  : "ok",
            time: age.time,
            committed: age.committed,
        });
    }
    return { errors, rows };
}

const git = (root, ...args) =>
    execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 64 * 1024 * 1024,
    });

/** Each file's last commit time under `dir`, and the files changed or new there. */
function gitTimes(root, dir) {
    const times = new Map();
    const changed = new Set();
    try {
        let at = null;
        for (const line of git(
            root,
            "log",
            "--format=@%ct",
            "--name-only",
            "--",
            dir,
        ).split("\n")) {
            if (line.startsWith("@"))
                at = new Date(Number(line.slice(1)) * 1000);
            else if (line && !times.has(line)) times.set(line, at);
        }
        for (const line of git(root, "status", "--porcelain", "--", dir).split(
            "\n",
        )) {
            if (line) changed.add(line.slice(3));
        }
    } catch {
        // Not a git checkout: every file reads as uncommitted.
    }
    return { times, changed };
}

function listFiles(root, dir) {
    const out = [];
    const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) {
                if (e.name !== "node_modules" && !e.name.startsWith("."))
                    walk(p);
            } else if (
                /\.(tsx?|mdx?)$/.test(e.name) &&
                !/\.test\.tsx?$/.test(e.name) &&
                !/^shots(\.captured)?\.ts$/.test(e.name)
            ) {
                out.push({
                    path: relative(root, p),
                    text: readFileSync(p, "utf8"),
                });
            }
        }
    };
    for (const sub of SCANNED)
        if (existsSync(join(root, dir, sub))) walk(join(root, dir, sub));
    return out;
}

const fmtAge = (time, now) => {
    const days = Math.floor((now - time) / 86_400_000);
    return days < 1 ? "today" : `${days} d`;
};

function main(argv) {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const read = (p) => readFileSync(join(root, p), "utf8");
    const sinceArg = argv.find((a) => a.startsWith("--since="))?.slice(8);
    const since = sinceArg
        ? new Date(/^\d+$/.test(sinceArg) ? Number(sinceArg) * 1000 : sinceArg)
        : null;
    if (since && Number.isNaN(since.getTime())) {
        console.error(`shots: --since=${sinceArg} isn't a date`);
        return 2;
    }
    const known = shotKeys(read(TYPES));
    const switches = releaseSwitches(read(SWITCHES));
    const on = switchesOn(
        parseJsonc(read(WRANGLER)).env?.production?.vars,
        switches,
    );
    const off = Object.keys(switches).filter((k) => !on.includes(k));
    const now = new Date();
    let failed = 0;

    for (const [name, site] of Object.entries(SITES)) {
        const files = listFiles(root, site.dir);
        const used = referencedKeys(files, known);
        const allowed = site.pending
            ? pendingShots(read(site.pending))
            : helpWaiting(
                  files
                      .filter((f) => f.path.endsWith(".mdx"))
                      .map((f) => f.text),
                  off,
              );
        if (!site.pending) {
            for (const [k, feature] of allowed)
                allowed.set(k, `waits for ${feature}`);
        }
        const { times, changed } = gitTimes(root, `${site.dir}/public/shots`);
        const ageOf = (file) => {
            const rel = `${site.dir}/public/${file}`;
            const abs = join(root, rel);
            if (!existsSync(abs)) return null;
            const committed = times.has(rel) && !changed.has(rel);
            return {
                time: committed ? times.get(rel) : statSync(abs).mtime,
                committed,
            };
        };
        const { errors, rows } = checkSite({
            used,
            allowed,
            supplied: suppliedKeys(read(site.config)),
            ageOf,
            since,
        });
        console.log(`\n## ${name}: ${used.size} keys named\n`);
        console.log("| Key | Status | Age | Taken |");
        console.log("| --- | --- | --- | --- |");
        for (const r of rows) {
            const taken = r.time
                ? `${r.time.toISOString().slice(0, 16).replace("T", " ")}${r.committed ? "" : " (uncommitted)"}`
                : "";
            console.log(
                `| ${r.key} | ${r.status} | ${r.time ? fmtAge(r.time, now) : ""} | ${taken} |`,
            );
        }
        if (errors.length) {
            failed += errors.length;
            console.error(
                `\nshots: ${name}: ${errors.length} problem(s):\n${errors.map((e) => `  ${e}`).join("\n")}`,
            );
        }
    }
    if (failed) return 1;
    console.log(
        `\nshots: every named key has ${since ? "a fresh" : "an"} image`,
    );
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
