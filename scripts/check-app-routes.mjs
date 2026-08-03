#!/usr/bin/env node
/**
 * Fail the build when the API hands the app a destination that has no page
 * behind it.
 *
 * The API composes user-facing calls to action — Home's "next best actions",
 * module readiness blockers, provider health — and each carries an `href` the
 * merchant will click. Those strings live in `api.saroh.in`; the routes they
 * name live in `app.saroh.in`. Nothing connected the two, so `/payments`,
 * `/communications` and `/stores` were emitted for a long time without ever
 * being routes: every one of those calls to action landed on a 404.
 *
 * This checks the invariant directly rather than trusting a convention. It
 * reads the app's real route tree off disk and resolves every `href` /
 * `actionHref` literal the API emits against it.
 *
 * Deliberately narrow: only `href:` and `actionHref:` OBJECT KEYS are treated
 * as destinations. The API is full of unrelated path strings (its own endpoint
 * paths, `/stores` among them) and flagging those would make the check
 * worthless. Anything user-facing must therefore travel in a named field —
 * which is also why `connectedHealth` takes an options object.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = join(ROOT, "apps/app.saroh.in/app");
const API_SRC = join(ROOT, "apps/api.saroh.in/src");

/** Walk a directory tree, yielding absolute file paths. */
function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === "node_modules" || entry.startsWith(".")) continue;
            yield* walk(full);
        } else {
            yield full;
        }
    }
}

/**
 * Every route the app serves, as a regex. Route groups `(shell)` are stripped
 * (they never appear in a URL) and dynamic segments `[id]` / `[...slug]` become
 * wildcards, so `/stores/[storeId]` matches a concrete `/stores/abc123`.
 */
function appRoutePatterns() {
    const patterns = [];
    for (const file of walk(APP_DIR)) {
        if (!/[/\\]page\.tsx?$/.test(file)) continue;
        const segments = relative(APP_DIR, file)
            .replace(/[/\\]page\.tsx?$/, "")
            .split(/[/\\]/)
            .filter((s) => s && !/^\(.*\)$/.test(s));

        const source = segments
            .map((s) =>
                /^\[\.\.\..+\]$/.test(s)
                    ? ".+"
                    : /^\[.+\]$/.test(s)
                      ? "[^/]+"
                      : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            )
            .join("/");

        patterns.push({
            route: "/" + segments.join("/"),
            regex: new RegExp(`^/${source}$`),
        });
    }
    return patterns;
}

/** Destinations the API emits, with the file and line that emit them. */
function emittedHrefs() {
    const found = [];
    for (const file of walk(API_SRC)) {
        if (!/\.tsx?$/.test(file) || /\.spec\.tsx?$/.test(file)) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            for (const m of line.matchAll(
                /\b(?:action)?[Hh]ref:\s*"(\/[^"]*)"/g,
            )) {
                found.push({
                    href: m[1],
                    file: relative(ROOT, file),
                    line: i + 1,
                });
            }
        });
    }
    return found;
}

const patterns = appRoutePatterns();
if (patterns.length === 0) {
    console.error(`No routes found under ${relative(ROOT, APP_DIR)}.`);
    process.exit(1);
}

const broken = emittedHrefs().filter(({ href }) => {
    // Compare paths only; a query string or fragment does not change the route.
    const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    return !patterns.some((p) => p.regex.test(path));
});

if (broken.length > 0) {
    console.error(
        `\n${broken.length} destination(s) emitted by api.saroh.in have no route in app.saroh.in:\n`,
    );
    for (const { href, file, line } of broken) {
        console.error(`  ${href}\n      ${file}:${line}`);
    }
    console.error(
        "\nEither add the route, or point the href at one that exists.\n",
    );
    process.exit(1);
}

console.log(
    `check-app-routes: ${emittedHrefs().length} emitted destination(s) all resolve against ${patterns.length} app route(s).`,
);
