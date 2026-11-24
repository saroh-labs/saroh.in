// A route on React Query never `router.refresh()`es (DEC-259, KTD-9): its
// changeable values come from queries, and a refresh would re-render the
// server half while the client half keeps its cache, so the screen would
// show two answers. The routes are the globs in `lib/query/rq-routes.ts`;
// the check reads every file in a registered route's folder and every app
// file they import, at any depth.
//
// Excepted: a chrome entry (`lib/query/chrome-refresh.ts`, at most 6), whose
// writes change server-rendered chrome, and a line marked `rq-refresh-ok`
// (on it or the line above) with its reason. `revalidatePath` in a React
// Query domain's actions (`RQ_DOMAINS`) is listed as a warning until it
// reaches zero or is marked `rq-revalidate-ok`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const APP = "apps/app.saroh.in/";
export const CHROME_CAP = 6;

/** The string literals of `export const <name> … = [ … ]` in `text`. */
export function stringList(text, name) {
    const m = new RegExp(
        `export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]\\s*;`,
    ).exec(text ?? "");
    if (!m) return [];
    return [...m[1].matchAll(/["']([^"']+)["']/g)].map((s) => s[1]);
}

/** A file's route under `app/`, or null: groups, slots and `_private` folders dropped. */
export function routeOf(file) {
    if (!file.startsWith(`${APP}app/`)) return null;
    const segs = dirname(file.slice(`${APP}app/`.length))
        .split("/")
        .filter((s) => s !== "." && !/^\(.*\)$|^@|^_/.test(s));
    return `/${segs.join("/")}`;
}

/** Whether `path` is the route `glob` names (`[param]` is one segment). */
export function matchRoute(glob, path) {
    const trim = (p) => p.replace(/(.)\/$/, "$1").split("/");
    const want = trim(glob);
    const got = trim(path);
    return (
        want.length === got.length &&
        want.every((part, i) => part === got[i] || /^\[[^/\]]+\]$/.test(part))
    );
}

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

/** The app files `file` imports, resolved against `files`. */
function importsOf(file, text, files) {
    const out = [];
    for (const [, spec] of text.matchAll(IMPORT)) {
        let base;
        if (spec.startsWith("@/")) base = APP + spec.slice(2);
        else if (spec.startsWith("."))
            base = normalize(join(dirname(file), spec));
        else continue;
        const hit = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
            .map((ext) => base + ext)
            .find((f) => files.has(f));
        if (hit) out.push(hit);
    }
    return out;
}

const REFRESH = /\.refresh\(\s*\)/g;

// React Query's own plumbing refreshes on purpose and is not walked: a
// business switch or a stale business list (KTD-6), and live refresh, which
// asks the route registry itself (KTD-11).
export const PLUMBING = [
    `${APP}lib/query/`,
    `${APP}components/shared/query/`,
    `${APP}components/shared/live-refresh/`,
];

/** Lines (1-based) calling `.refresh()` outside comments and not marked. */
export function refreshLines(text) {
    const lines = text.split("\n");
    // Blank out comments, keeping line breaks, so a doc line naming
    // `router.refresh()` is not a call.
    const code = text
        .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
        .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
    const out = [];
    for (const m of code.matchAll(REFRESH)) {
        const n = code.slice(0, m.index).split("\n").length;
        const marked = [lines[n - 1], lines[n - 2]].some((l) =>
            l?.includes("rq-refresh-ok"),
        );
        if (!marked) out.push(n);
    }
    return out;
}

/**
 * The check over a tree: `files` the app's tracked files, `read(file)` their
 * text (undefined when missing). Returns `{ errors, warnings }`.
 */
export function checkRefresh(files, read) {
    const all = new Set(files);
    const errors = [];
    const warnings = [];
    const rqRoutes = stringList(
        read(`${APP}lib/query/rq-routes.ts`),
        "RQ_ROUTES",
    );
    const domains = stringList(
        read(`${APP}lib/query/rq-routes.ts`),
        "RQ_DOMAINS",
    );
    const chrome = stringList(
        read(`${APP}lib/query/chrome-refresh.ts`),
        "CHROME_REFRESH_ROUTES",
    );
    if (chrome.length > CHROME_CAP) {
        errors.push(
            `${APP}lib/query/chrome-refresh.ts: ${chrome.length} chrome entries, at most ${CHROME_CAP}`,
        );
    }
    const routes = rqRoutes.filter((g) => !chrome.includes(g));
    for (const glob of routes) {
        const seeds = files.filter((f) => {
            const r = routeOf(f);
            return r && /\.tsx?$/.test(f) && matchRoute(glob, r);
        });
        const seen = new Set(seeds);
        const queue = [...seeds];
        while (queue.length) {
            const file = queue.pop();
            const text = read(file) ?? "";
            for (const line of refreshLines(text)) {
                errors.push(
                    `${file}:${line}: .refresh() on React Query route ${glob}: invalidate its queries instead (or list the route in chrome-refresh.ts)`,
                );
            }
            for (const next of importsOf(file, text, all)) {
                if (PLUMBING.some((p) => next.startsWith(p))) continue;
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push(next);
                }
            }
        }
    }
    for (const domain of domains) {
        const prefix = `${APP}lib/${domain}/`;
        for (const file of files) {
            if (!file.startsWith(prefix) || !/actions[^/]*\.ts$/.test(file))
                continue;
            const lines = (read(file) ?? "").split("\n");
            lines.forEach((l, i) => {
                if (
                    /\brevalidatePath\(/.test(l) &&
                    ![l, lines[i - 1]].some((x) =>
                        x?.includes("rq-revalidate-ok"),
                    )
                ) {
                    warnings.push(
                        `${file}:${i + 1}: revalidatePath in React Query domain ${domain}: drop it or mark rq-revalidate-ok with the reason`,
                    );
                }
            });
        }
    }
    // A file reached from two routes is reported once per route; say it once.
    return { errors: [...new Set(errors)], warnings, routes: rqRoutes.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files = execFileSync(
        "git",
        ["ls-files", "--", `${APP}*.ts`, `${APP}*.tsx`],
        { cwd: root, encoding: "utf8" },
    )
        .split("\n")
        .filter(Boolean);
    const read = (f) =>
        existsSync(join(root, f))
            ? readFileSync(join(root, f), "utf8")
            : undefined;
    const { errors, warnings, routes } = checkRefresh(files, read);
    for (const w of warnings) console.warn(`warning: ${w}`);
    for (const e of errors) console.error(e);
    if (errors.length) process.exitCode = 1;
    else
        console.log(`rq-refresh: ${routes} React Query routes, none refreshes`);
}
