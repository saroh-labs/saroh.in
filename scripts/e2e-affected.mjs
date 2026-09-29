#!/usr/bin/env node
/**
 * Which browser specs cover what a branch changed.
 *
 * Every spec in `e2e/tests/*.spec.ts` names what it exercises in a header
 * comment, one or more lines of:
 *
 *     // @covers app:/commerce/orders api:orders site:/shop pkg:site-blocks
 *
 * Keys:
 *   app:/<route>       a route of app.saroh.in (route groups dropped)
 *   site:/<route>      a route of the merchant-site renderer, saroh.app
 *                      (the `[domain]` segment dropped: `site:/shop`)
 *   accounts:/<route>  a route of accounts.saroh.in
 *   api:<module>       a folder of apps/api.saroh.in/src/modules
 *   pkg:<package>      a folder of packages/
 *
 * This maps changed files to those keys and prints the specs that name one:
 *
 *   - a file of app.saroh.in, saroh.app or accounts.saroh.in (a page, a
 *     component, a lib module) → the routes whose files import it, directly
 *     or through other files (an import scan of the app). A route's layout
 *     reaches the routes beneath it; a spec on `app:/customers` is reached by
 *     `/customers/[id]`, its dynamic child, but not by a static sibling.
 *   - apps/api.saroh.in/src/modules/M/** → api:M, and every module with a
 *     file that imports M's changed file (or a file of M that reaches it).
 *     One step out, not transitively, and `*.module.ts` wiring is not
 *     followed: stock → orders → bookings → … would reach every module.
 *   - packages/X/** → pkg:X, the packages that depend on X, and every app
 *     or api file that imports one of them (then as above).
 *   - e2e/tests/X.spec.ts → X itself; a helper or fixture → the specs that
 *     import it.
 *   - Anything global → every spec: the schema, migrations and seed
 *     (packages/database), packages/ui and packages/auth, tooling, root
 *     configs, the lockfile, .github, the playwright config, the api's
 *     bootstrap and common/, this script and scripts/prepush.sh. An app's
 *     own config, middleware or root layout → every spec on that app.
 *   - docs, Markdown, unit tests and apps with no browser specs → none.
 *
 * Usage:
 *   node scripts/e2e-affected.mjs [--base <ref>] [--head <ref>] [--why]
 *                                                     diff <base>...<head>
 *                                                     (origin/development...HEAD)
 *   node scripts/e2e-affected.mjs --files a b c       these paths instead
 *   … | node scripts/e2e-affected.mjs --stdin         paths on stdin (prepush)
 *   node scripts/e2e-affected.mjs --check             every spec names valid keys
 *
 * Prints the selected spec paths on stdout (relative to e2e/, one per line)
 * and the reasons on stderr. `--check` exits 1 when a spec has no @covers
 * line or names a key that does not exist (`pnpm run check:e2e-covers`).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const E2E_TESTS = join(ROOT, "e2e/tests");

/** The three Next apps the browser specs drive, with their key prefix. */
const SURFACES = [
    { key: "app", dir: "apps/app.saroh.in", dropSegments: [] },
    { key: "site", dir: "apps/saroh.app", dropSegments: ["[domain]"] },
    { key: "accounts", dir: "apps/accounts.saroh.in", dropSegments: [] },
];
const API_DIR = "apps/api.saroh.in";
const API_MODULES = `${API_DIR}/src/modules`;

/** Changes that can break any spec: every spec runs. */
const GLOBAL = [
    [
        /^packages\/database\//,
        "the schema, migrations, seed or database client",
    ],
    [
        /^packages\/(ui|auth)\//,
        "a package every screen renders or signs in with",
    ],
    [/^tooling\//, "shared tooling"],
    [/^\.github\//, "CI"],
    [
        /^e2e\/(playwright\.config\.ts|package\.json|tsconfig\.json)$/,
        "the browser harness",
    ],
    [/^scripts\/(prepush\.sh|e2e-affected\.mjs)$/, "the gate itself"],
    [
        /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|tsconfig[^/]*\.json|\.npmrc|\.nvmrc)$/,
        "a root config or the lockfile",
    ],
    [
        /^apps\/api\.saroh\.in\/src\/(common\/|[^/]+\.ts$)/,
        "the api's bootstrap or common code",
    ],
    [
        /^apps\/api\.saroh\.in\/(package\.json|nest-cli\.json|tsconfig[^/]*\.json)$/,
        "the api's config",
    ],
];
/** Changes no browser spec can see. */
const NONE = [
    /^docs\//,
    /\.mdx?$/,
    /(^|\/)__tests__\//,
    /\.(test|spec)\.[cm]?[jt]sx?$/, // unit and integration tests (e2e specs are matched first)
    /^apps\/api\.saroh\.in\/(test|scripts)\//,
    /^apps\/api\.saroh\.in\/src\/cli\//,
    /^apps\/api\.saroh\.in\/jest[^/]*$/,
    /^e2e\/(permissions|permissions\.config\.ts|eslint\.config\.mjs)/,
    /^\.(husky|agents|claude|vscode)\//,
    /^(AGENTS|CLAUDE|README|PRODUCT|AUDIT-PLAYBOOK)/,
];

const SOURCE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const LAYOUTISH = new Set([
    "layout",
    "template",
    "loading",
    "error",
    "not-found",
    "default",
    "global-error",
    "forbidden",
    "unauthorized",
    "providers",
]);

// ---------------------------------------------------------------------------
// Files and imports

function* walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else yield full;
    }
}
const isSource = (f) =>
    SOURCE_EXT.some((e) => f.endsWith(e)) && !f.endsWith(".d.ts");
const isTest = (f) =>
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(f) || f.includes("/__tests__/");

const IMPORT_RE =
    /(?:^|[^.\w])(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|(?:^|[^.\w])import\s*["']([^"']+)["']|(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/gm;
function importsOf(file) {
    const text = readFileSync(file, "utf8");
    const out = [];
    for (const m of text.matchAll(IMPORT_RE)) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
}
function resolveFile(base) {
    if (existsSync(base) && statSync(base).isFile()) return base;
    for (const e of SOURCE_EXT) if (existsSync(base + e)) return base + e;
    // `./x.js` written for a `./x.ts` source (ESM-style specifiers)
    const stripped = base.replace(/\.(js|jsx|mjs)$/, "");
    if (stripped !== base)
        for (const e of SOURCE_EXT)
            if (existsSync(stripped + e)) return stripped + e;
    if (existsSync(base) && statSync(base).isDirectory())
        for (const e of SOURCE_EXT)
            if (existsSync(join(base, "index" + e)))
                return join(base, "index" + e);
    return null;
}

/**
 * The reverse import graph of a set of roots: for each file, the files that
 * import it. `alias` resolves `@/…` to that directory. Imports of a workspace
 * package are recorded per package name, for pkg: changes.
 */
function buildGraph(roots, alias) {
    const importers = new Map(); // abs file -> Set<abs file>
    const pkgImporters = new Map(); // "@saroh/x" -> Set<abs file>
    const add = (map, k, v) => {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k).add(v);
    };
    for (const r of roots) {
        for (const file of walk(join(ROOT, r))) {
            if (!isSource(file) || isTest(file)) continue;
            for (const spec of importsOf(file)) {
                let target = null;
                if (spec.startsWith("."))
                    target = resolveFile(resolve(dirname(file), spec));
                else if (alias && spec.startsWith("@/"))
                    target = resolveFile(join(ROOT, alias, spec.slice(2)));
                else if (spec.startsWith("@saroh/")) {
                    add(
                        pkgImporters,
                        spec.split("/").slice(0, 2).join("/"),
                        file,
                    );
                    continue;
                }
                if (target) add(importers, target, file);
            }
        }
    }
    return { importers, pkgImporters };
}

/** Every file that reaches `start` through imports, `start` included. */
function reach(graph, starts, stop = () => false) {
    const seen = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
        const f = queue.shift();
        if (stop(f) && !starts.includes(f)) continue;
        for (const by of graph.importers.get(f) ?? []) {
            if (!seen.has(by)) {
                seen.add(by);
                queue.push(by);
            }
        }
    }
    return seen;
}

// ---------------------------------------------------------------------------
// Routes

/** `apps/app.saroh.in/app/(shell)/commerce/orders/[id]/page.tsx` → `/commerce/orders/[id]`. */
function routeOf(surface, absFile) {
    const rel = relative(join(ROOT, surface.dir, "app"), absFile);
    if (rel.startsWith("..")) return null;
    const segs = dirname(rel)
        .split("/")
        .filter(
            (s) =>
                s &&
                s !== "." &&
                !/^\(.*\)$/.test(s) &&
                !s.startsWith("@") &&
                !s.startsWith("_"),
        )
        .filter((s) => !surface.dropSegments.includes(s));
    const name = basename(absFile).replace(/\.[^.]+$/, "");
    return { path: "/" + segs.join("/"), layout: LAYOUTISH.has(name) };
}
/** Every route path a surface has, for validating keys. */
function routesOf(surface) {
    const out = new Set(["/"]);
    for (const file of walk(join(ROOT, surface.dir, "app"))) {
        const r = routeOf(surface, file);
        if (!r) continue;
        const parts = r.path.split("/").filter(Boolean);
        for (let i = 1; i <= parts.length; i++)
            out.add("/" + parts.slice(0, i).join("/"));
    }
    return out;
}
/** Does a change at route `hit` reach a spec that covers route `key`? */
function routeMatches(key, hit) {
    if (key === hit.path) return true;
    // A layout reaches everything beneath it.
    if (hit.layout && (hit.path === "/" || key.startsWith(hit.path + "/")))
        return true;
    // A spec on a list reaches the list's dynamic children: `/customers` covers
    // `/customers/[id]`, not `/customers/new`.
    if (key !== "/" && hit.path.startsWith(key + "/")) {
        return hit.path.slice(key.length + 1).startsWith("[");
    }
    return false;
}

// ---------------------------------------------------------------------------
// Specs

function loadSpecs() {
    return readdirSync(E2E_TESTS)
        .filter((f) => f.endsWith(".spec.ts"))
        .sort()
        .map((f) => {
            const text = readFileSync(join(E2E_TESTS, f), "utf8");
            const keys = [];
            for (const m of text.matchAll(/^\/\/\s*@covers\s+(.+)$/gm))
                keys.push(...m[1].trim().split(/\s+/));
            const imports = importsOf(join(E2E_TESTS, f))
                .filter((s) => s.startsWith("."))
                .map((s) => resolveFile(resolve(E2E_TESTS, s)))
                .filter(Boolean);
            return { file: `tests/${f}`, keys, imports };
        });
}

function validKeys() {
    const valid = new Set();
    for (const s of SURFACES)
        for (const r of routesOf(s)) valid.add(`${s.key}:${r}`);
    for (const m of readdirSync(join(ROOT, API_MODULES))) valid.add(`api:${m}`);
    for (const p of readdirSync(join(ROOT, "packages"))) valid.add(`pkg:${p}`);
    return valid;
}

function check() {
    const valid = validKeys();
    const bad = [];
    const specs = loadSpecs();
    for (const s of specs) {
        if (s.keys.length === 0)
            bad.push(`${s.file}: no \`// @covers …\` line`);
        for (const k of s.keys)
            if (!valid.has(k)) bad.push(`${s.file}: unknown key ${k}`);
    }
    if (bad.length) {
        console.error("e2e @covers check failed:\n  " + bad.join("\n  "));
        console.error(
            "\nEvery browser spec names what it exercises (scripts/e2e-affected.mjs):\n" +
                "  // @covers app:/<route> site:/<route> accounts:/<route> api:<module> pkg:<package>",
        );
        process.exit(1);
    }
    console.log(
        `e2e @covers: ${specs.length} specs, every key names a real route, module or package`,
    );
}

// ---------------------------------------------------------------------------
// Selection

function packageDependents() {
    const byName = new Map();
    for (const p of readdirSync(join(ROOT, "packages"))) {
        const pj = join(ROOT, "packages", p, "package.json");
        if (!existsSync(pj)) continue;
        const json = JSON.parse(readFileSync(pj, "utf8"));
        byName.set(json.name, {
            dir: p,
            deps: Object.keys({
                ...json.dependencies,
                ...json.peerDependencies,
            }),
        });
    }
    return (dir) => {
        const names = [...byName]
            .filter(([, v]) => v.dir === dir)
            .map(([n]) => n);
        const out = new Set(names);
        let grew = true;
        while (grew) {
            grew = false;
            for (const [n, v] of byName)
                if (!out.has(n) && v.deps.some((d) => out.has(d))) {
                    out.add(n);
                    grew = true;
                }
        }
        return [...out].map((n) => ({ name: n, dir: byName.get(n).dir }));
    };
}

function select(changed) {
    const specs = loadSpecs();
    /** spec file -> Set of reasons */
    const chosen = new Map();
    const pick = (spec, why) => {
        if (!chosen.has(spec.file)) chosen.set(spec.file, new Set());
        chosen.get(spec.file).add(why);
    };
    const notes = []; // files that select nothing, and why
    let all = null;

    // Lazily built graphs.
    const graphs = new Map();
    const graphFor = (key) => {
        if (!graphs.has(key)) {
            if (key === "api")
                graphs.set(
                    key,
                    buildGraph([`${API_DIR}/src`], `${API_DIR}/src`),
                );
            else {
                const s = SURFACES.find((x) => x.key === key);
                graphs.set(
                    key,
                    buildGraph(
                        [`${s.dir}/app`, `${s.dir}/components`, `${s.dir}/lib`],
                        s.dir,
                    ),
                );
            }
        }
        return graphs.get(key);
    };
    const dependents = packageDependents();

    const byKey = (pred, why) => {
        let n = 0;
        for (const s of specs)
            if (s.keys.some(pred)) {
                pick(s, why);
                n++;
            }
        return n;
    };

    // Files of one surface → the routes whose files import them → the specs.
    // A changed file inside app/ also stands for its own route, even deleted.
    const surfaceHits = (surface, files, why, own = []) => {
        const hits = new Map();
        const add = (r) => {
            if (!r) return;
            const prev = hits.get(r.path);
            hits.set(r.path, {
                path: r.path,
                layout: Boolean(prev?.layout) || r.layout,
            });
        };
        for (const f of files.length ? reach(graphFor(surface.key), files) : [])
            add(routeOf(surface, f));
        for (const f of own) add(routeOf(surface, f));
        let n = 0;
        for (const s of specs) {
            for (const k of s.keys) {
                if (!k.startsWith(surface.key + ":")) continue;
                const hit = [...hits.values()].find((h) =>
                    routeMatches(k.slice(surface.key.length + 1), h),
                );
                if (hit) {
                    pick(
                        s,
                        `${why} → ${surface.key}:${hit.path}${hit.layout ? " (layout)" : ""}`,
                    );
                    n++;
                    break;
                }
            }
        }
        return n;
    };
    // A set of api files → the modules they reach → the specs.
    const apiHits = (files, why) => {
        const g = graphFor("api");
        const modules = new Set();
        const moduleOf = (f) => {
            const rel = relative(join(ROOT, API_MODULES), f);
            return rel.startsWith("..") ? null : rel.split("/")[0];
        };
        // Inside the changed file's own module, every file that reaches it;
        // then one step out: the modules with a file importing one of those.
        // Not further: stock → orders → bookings → … would reach every module.
        for (const start of files) {
            const own = moduleOf(start);
            const reached = reach(
                g,
                [start],
                (f) => f.endsWith(".module.ts") || moduleOf(f) !== own,
            );
            for (const f of reached) {
                const m = moduleOf(f);
                if (m) modules.add(m);
            }
        }
        let n = 0;
        for (const m of modules)
            n += byKey((k) => k === `api:${m}`, `${why} → api:${m}`);
        return n;
    };

    for (const path of changed) {
        const abs = join(ROOT, path);
        const g = GLOBAL.find(([re]) => re.test(path));
        if (g) {
            all ??= `${path} (${g[1]})`;
            continue;
        }
        let m;
        if ((m = path.match(/^e2e\/tests\/([^/]+\.spec\.ts)$/))) {
            const s = specs.find((x) => x.file === `tests/${m[1]}`);
            if (s) pick(s, `${path} (the spec itself)`);
            else notes.push(`${path}: deleted`);
            continue;
        }
        if (path.startsWith("e2e/") && isSource(path)) {
            const n = specs
                .filter((s) => s.imports.includes(abs))
                .map((s) => pick(s, `${path} (imported by the spec)`)).length;
            if (!n) notes.push(`${path}: no spec imports it`);
            continue;
        }
        if (NONE.some((re) => re.test(path))) {
            notes.push(`${path}: nothing a browser spec runs`);
            continue;
        }
        const surface = SURFACES.find((s) => path.startsWith(s.dir + "/"));
        if (surface) {
            const inside = path.slice(surface.dir.length + 1);
            let n;
            if (/^(app|components|lib)\//.test(inside)) {
                const graphed = existsSync(abs) && isSource(path) ? [abs] : [];
                n = surfaceHits(surface, graphed, path, [abs]);
                if (!n)
                    notes.push(`${path}: no spec covers a route that uses it`);
            } else {
                // middleware, next.config, env.ts, styles/, public/, package.json
                n = byKey(
                    (k) => k.startsWith(surface.key + ":"),
                    `${path} (${surface.key}-wide: config, middleware or styles)`,
                );
                if (!n) notes.push(`${path}: no spec covers ${surface.key}`);
            }
            continue;
        }
        if (
            (m = path.match(/^apps\/api\.saroh\.in\/src\/modules\/([^/]+)\//))
        ) {
            const n =
                existsSync(abs) && isSource(path)
                    ? apiHits([abs], path)
                    : byKey(
                          (k) => k === `api:${m[1]}`,
                          `${path} → api:${m[1]}`,
                      );
            if (!n)
                notes.push(
                    `${path}: no spec covers api:${m[1]} or a module that imports it`,
                );
            continue;
        }
        if ((m = path.match(/^packages\/([^/]+)\//))) {
            const pkgs = dependents(m[1]);
            const globalDep = pkgs.find((p) =>
                GLOBAL.some(([re]) => re.test(`packages/${p.dir}/x`)),
            );
            if (globalDep) {
                all ??= `${path} (${globalDep.name} depends on it)`;
                continue;
            }
            let n = 0;
            for (const p of pkgs) {
                n += byKey(
                    (k) => k === `pkg:${p.dir}`,
                    `${path} → pkg:${p.dir}`,
                );
                for (const s of SURFACES) {
                    const files = [
                        ...(graphFor(s.key).pkgImporters.get(p.name) ?? []),
                    ];
                    if (files.length)
                        n += surfaceHits(
                            s,
                            files,
                            `${path} → ${p.name} imported`,
                        );
                }
                const apiFiles = [
                    ...(graphFor("api").pkgImporters.get(p.name) ?? []),
                ];
                if (apiFiles.length)
                    n += apiHits(apiFiles, `${path} → ${p.name} imported`);
            }
            if (!n)
                notes.push(
                    `${path}: no spec covers ${pkgs.map((p) => p.name).join(", ")} or what imports it`,
                );
            continue;
        }
        if (path.startsWith("apps/")) {
            notes.push(`${path}: an app with no browser specs`);
            continue;
        }
        notes.push(`${path}: not mapped (no spec chosen)`);
    }

    if (all)
        return {
            specs: specs.map((s) => s.file),
            all,
            chosen: new Map(),
            notes,
            total: specs.length,
        };
    return {
        specs: [...chosen.keys()].sort(),
        all: null,
        chosen,
        notes,
        total: specs.length,
    };
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
if (args.includes("--check")) {
    check();
    process.exit(0);
}
let changed;
const fi = args.indexOf("--files");
if (fi >= 0) changed = args.slice(fi + 1);
else if (args.includes("--stdin"))
    changed = readFileSync(0, "utf8").split("\n").filter(Boolean);
else {
    const opt = (name, fallback) =>
        args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
    const range = `${opt("--base", "origin/development")}...${opt("--head", "HEAD")}`;
    changed = execFileSync("git", ["diff", "--name-only", range], {
        cwd: ROOT,
        encoding: "utf8",
    })
        .split("\n")
        .filter(Boolean);
}
const quiet = args.includes("--quiet");
const r = select(changed);
const err = (s) => quiet || process.stderr.write(s + "\n");
if (r.all) {
    err(`e2e: all ${r.total} specs — ${r.all}`);
} else {
    err(
        `e2e: ${r.specs.length} of ${r.total} specs for ${changed.length} changed files`,
    );
    for (const f of r.specs) {
        const why = [...r.chosen.get(f)];
        err(`  ${f}`);
        for (const w of why.slice(0, 4)) err(`      ${w}`);
        if (why.length > 4) err(`      … and ${why.length - 4} more`);
    }
}
if (args.includes("--why") && r.notes.length) {
    err("  not selecting:");
    for (const n of r.notes) err(`      ${n}`);
}
if (r.specs.length) process.stdout.write(r.specs.join("\n") + "\n");
