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
const APP_ROOT = join(ROOT, "apps/app.saroh.in");
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

/** Skipped destinations, reported so silence never reads as coverage. */
const skipped = [];

/**
 * Destinations the API emits, with the file and line that emit them.
 *
 * Only `href:` / `actionHref:` OBJECT KEYS count. The API is full of unrelated
 * path strings — its own endpoint paths, `/stores` among them — and flagging
 * those would make the check worthless.
 */
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

/**
 * Destinations the app links to itself.
 *
 * The API is only one source of broken links; a `<Link href="/stores">` in the
 * app 404s just as hard. This reads `href="..."` on JSX and `router.push("...")`
 * / `redirect("...")` calls.
 *
 * Deliberately confined to app.saroh.in's own components and routes, and to
 * STRING LITERALS. `href={\`/stores/${id}\`}` cannot be resolved statically, so
 * it is counted and reported rather than guessed at — a checker that silently
 * ignores what it cannot parse invites the belief that everything was checked.
 */
function inAppLinks() {
    const found = [];
    for (const file of walk(APP_ROOT)) {
        if (!/\.tsx?$/.test(file) || /\.spec\.tsx?$/.test(file)) continue;
        if (/[/\\](node_modules|\.next)[/\\]/.test(file)) continue;
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            // Template literals and expressions: count, do not guess.
            for (const _ of line.matchAll(
                /(?:href=\{`|router\.push\(`|redirect\(`)/g,
            )) {
                skipped.push({ file: relative(ROOT, file), line: i + 1 });
            }
            for (const m of line.matchAll(
                /(?:href="(\/[^"]*)"|(?:router\.push|redirect)\(\s*"(\/[^"]*)")/g,
            )) {
                const href = m[1] ?? m[2];
                if (href === undefined) continue;
                found.push({
                    href,
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

/** Paths that are real but owned by something other than the app router. */
const NOT_APP_ROUTES = [
    /^\/api\//, // Next route handlers and the API proxy
    /^\/_next\//,
    /^\/#/, // in-page anchors
];

const all = [
    ...emittedHrefs().map((h) => ({ ...h, source: "api.saroh.in" })),
    ...inAppLinks().map((h) => ({ ...h, source: "app.saroh.in" })),
];

const broken = all.filter(({ href }) => {
    // Compare paths only; a query string or fragment does not change the route.
    const path = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
    if (NOT_APP_ROUTES.some((re) => re.test(href))) return false;
    return !patterns.some((p) => p.regex.test(path));
});

if (broken.length > 0) {
    console.error(
        `\n${broken.length} destination(s) have no route in app.saroh.in:\n`,
    );
    for (const { href, file, line, source } of broken) {
        console.error(`  ${href}   (${source})\n      ${file}:${line}`);
    }
    console.error(
        "\nEither add the route, or point the href at one that exists.\n",
    );
    process.exit(1);
}

console.log(
    `check-app-routes: ${all.length} destination(s) resolve against ${patterns.length} app route(s) ` +
        `(${skipped.length} dynamic link(s) not statically checkable).`,
);
