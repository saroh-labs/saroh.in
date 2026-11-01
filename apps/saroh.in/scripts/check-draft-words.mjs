// A production-like build of saroh.in carries no word or file of a page
// that isn't live (plan 2026-10-31-002, R3, R9), and no draft free tool's
// code (plan 2026-11-01-001, U4): GST pages, guides, downloads, /for/ pages
// and tools alike.
//
// It answers the build's publish-list read itself (a stand-in API on a free
// port) with two /for/ pages and one tool live, and one GST page live with
// unconfirmed facts (so the build must hold it back), builds the site as a
// deploy does (`pnpm cf:build`: the prebuild steps, `next build`,
// OpenNext), and fails if a sentence of any other page, a phrase from a
// draft tool's component, or a download's file, is anywhere in `.next`,
// `.open-next`, `public/` or the build's generated copies (`lib/*.gen.ts`).
// The live /for/ page's words and the live tool's code must be found: the
// scan proves it can see. The sitemap index and its group sitemaps must be
// static files, with no group for the held page.
//
// Run: pnpm run check:draft-words (prepush --int/--e2e/--all, when saroh.in
// or @saroh/search-pages changed). It rebuilds apps/saroh.in's .next, so
// stop `pnpm dev` first, and puts back the publish list it found.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = path.join(APP, "../../packages/search-pages");
const LIST = path.join(APP, ".search-pages.json");
const HELD = "/gst/salon-and-beauty-services";
const LIVE_FOR = "/for/salons";
const LIVE_FOR_TOO = "/for/gyms";
// Its component has words of its own to look for (`codeMarkersOf`).
const LIVE_TOOL = "/tools/wifi-qr-code-generator";
const LIVE = [LIVE_FOR, LIVE_FOR_TOO, LIVE_TOOL];

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;
const frontmatter = (file) =>
    parse(FENCE.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "");

/** A page's sentences long enough to be its own, with nothing a page escapes (quotes, &, <). */
function markersOf(fm) {
    return [fm.h1, fm.description, fm.lead]
        .filter((t) => typeof t === "string")
        .flatMap((t) => t.split(/[.:;!?(),]/))
        .map((t) => t.trim())
        .filter((t) => t.length >= 25 && !/[&'"<>’]/.test(t));
}

/** Every file under `dir` (recursive), its path. */
const filesIn = (dir) =>
    fs
        .readdirSync(dir, { recursive: true })
        .map((f) => path.join(dir, f))
        .filter((f) => fs.statSync(f).isFile());

const TOOLS_SRC = path.join(PACKAGE, "src/tools");
const toolSlugOf = (p) => p.slice("/tools/".length);
/**
 * What a live build ships on purpose: the live pages' words, the package's
 * code but other tools' components (the live tool's included), and
 * saroh.in's own code and content. A phrase in any of it isn't a draft's
 * own.
 */
const otherTool = (f) => {
    const rel = path.relative(TOOLS_SRC, f).split(path.sep);
    return (
        rel.length > 1 &&
        !rel[0].startsWith("..") &&
        !rel[0].startsWith("_") &&
        rel[0] !== toolSlugOf(LIVE_TOOL)
    );
};
const liveText = [
    ...LIVE.map((p) => path.join(PACKAGE, "content", `${p.slice(1)}.mdx`)),
    ...filesIn(path.join(PACKAGE, "src")).filter((f) => !otherTool(f)),
    ...["app", "components", "content", "lib"].flatMap((d) =>
        filesIn(path.join(APP, d)),
    ),
]
    .filter((f) => !/\.gen\.ts$|\.test\.tsx?$/.test(f))
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n")
    .toLowerCase();
const own = (m) => !liveText.includes(m.toLowerCase());

/**
 * Phrases from a tool's component (`src/tools/<slug>/index.tsx`, which no
 * other tool imports): its string literals (class names, sample words,
 * storage keys) and its JSX text lines, which a bundle keeps as written.
 */
function codeMarkersOf(slug) {
    const file = path.join(TOOLS_SRC, slug, "index.tsx");
    if (!fs.existsSync(file)) return [];
    const src = fs.readFileSync(file, "utf8");
    return [
        ...[...src.matchAll(/"([^"\\\n]{16,})"/g)].map((m) => m[1]),
        ...[...src.matchAll(/^\s*([A-Z][^<>{}=;()`"/*\n]{24,})$/gm)].map((m) =>
            m[1].trim(),
        ),
    ].filter(
        (t) =>
            // Not a path, a link or an SVG path an icon set may share.
            !/^[./]/.test(t) &&
            !/^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/.test(t) &&
            !/[&'"<>’`$\\]/.test(t),
    );
}

/** Every GST page, guide and download in the code; none is live in this build. */
const docs = ["gst", "guides", "downloads"].flatMap((kind) => {
    const dir = path.join(PACKAGE, "content", kind);
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => ({
            path: `/${kind}/${f.slice(0, -4)}`,
            markers: markersOf(frontmatter(path.join(dir, f))).filter(own),
        }));
});
/**
 * Every /for/ page and tool not live in this build: its words, and a
 * tool's code. The two app tools (`inApp`) are saroh.in's own routes, their
 * words in its code: out of scope.
 */
const searchDrafts = ["for", "tools"].flatMap((kind) => {
    const dir = path.join(PACKAGE, "content", kind);
    return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => `/${kind}/${f.slice(0, -4)}`)
        .filter((p) => !LIVE.includes(p))
        .filter(
            (p) =>
                frontmatter(path.join(PACKAGE, "content", `${p.slice(1)}.mdx`))
                    .inApp !== true,
        )
        .map((p) => ({
            path: p,
            markers: [
                ...markersOf(
                    frontmatter(
                        path.join(PACKAGE, "content", `${p.slice(1)}.mdx`),
                    ),
                ),
                ...(kind === "tools" ? codeMarkersOf(toolSlugOf(p)) : []),
            ].filter(own),
        }));
});
const drafts = [...docs, ...searchDrafts];
const files = fs.readdirSync(path.join(PACKAGE, "content/downloads/files"), {
    recursive: true,
});
const fileNames = files
    .filter((f) => path.extname(f))
    .map((f) => path.basename(f));
const seen = markersOf(
    frontmatter(path.join(PACKAGE, `content/for/${LIVE_FOR.slice(5)}.mdx`)),
)[0];
if (!seen) throw new Error(`${LIVE_FOR} has no sentence to look for`);
const seenTool = codeMarkersOf(toolSlugOf(LIVE_TOOL))[0];
if (!seenTool)
    throw new Error(`${LIVE_TOOL}'s component has no phrase to look for`);
if (drafts.some((d) => d.markers.length === 0))
    throw new Error(
        `no sentence to look for in ${drafts.filter((d) => !d.markers.length).map((d) => d.path)}`,
    );

const run = (cmd, args, env = {}) =>
    execFileSync(cmd, args, {
        cwd: APP,
        stdio: "inherit",
        env: { ...process.env, ...env },
    });

const before = fs.existsSync(LIST) ? fs.readFileSync(LIST) : null;
const api = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    // Anything else is "nothing published" (no catalogue, no offer), as the
    // API says it with a 404: a production build reads those too.
    if (req.url !== "/public/search-pages") res.statusCode = 404;
    res.end(
        req.url === "/public/search-pages"
            ? JSON.stringify({ live: [...LIVE, HELD], takenOff: [] })
            : "{}",
    );
});
await new Promise((r) => api.listen(0, "127.0.0.1", () => r(undefined)));
const address = api.address();
const API_URL = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
let failed = [];
try {
    // Async: the stand-in API answers from this process while the build runs.
    await new Promise((resolve, reject) =>
        spawn("pnpm", ["cf:build"], {
            cwd: APP,
            stdio: "inherit",
            env: {
                ...process.env,
                API_URL,
                // A production deploy's build: only live pages, no preview.
                VERCEL_ENV: "production",
                SITE_RELAY_SECRET: "check-draft-words-not-a-real-secret",
                RESOURCES_PREVIEW: "",
                NEXT_TELEMETRY_DISABLED: "1",
            },
        }).on("exit", (code) =>
            code === 0
                ? resolve(undefined)
                : reject(new Error(`cf:build: exit ${code}`)),
        ),
    );
    const list = JSON.parse(fs.readFileSync(LIST, "utf8"));
    if (list.preview !== false)
        failed.push(
            ".search-pages.json says preview: the build didn't read the stand-in list",
        );

    /** @param {string} dir */
    const walk = (dir) =>
        !fs.existsSync(dir)
            ? []
            : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
                  const p = path.join(dir, e.name);
                  // The compile cache and `next dev`'s output aren't what ships.
                  if (/[/\\]\.next[/\\](cache|dev)$/.test(p)) return [];
                  // The app folder's copy in the server bundle's input holds
                  // the R12 test pins (every page's HTML); the Worker imports
                  // none of them (checked 1 Nov: not in worker.js or handler.mjs).
                  if (/[/\\]__snapshots__$/.test(p)) return [];
                  // A link points into node_modules (standalone output): not this build's own files.
                  if (e.isSymbolicLink()) return [];
                  return e.isDirectory() ? walk(p) : [p];
              });
    const shipped = [
        ...[".next", ".open-next", "public"].flatMap((d) =>
            walk(path.join(APP, d)),
        ),
        // The copies the build compiled from, as it wrote them.
        path.join(APP, "lib/docs-content.gen.ts"),
        path.join(APP, "lib/search-content.gen.ts"),
        path.join(APP, "lib/tool-registry.gen.ts"),
    ];
    const markers = drafts.flatMap((d) =>
        d.markers.map((m) => ({ page: d.path, m, buf: Buffer.from(m) })),
    );
    const registry = fs.readFileSync(
        path.join(APP, "lib/tool-registry.gen.ts"),
        "utf8",
    );
    for (const d of searchDrafts.filter((d) => d.path.startsWith("/tools/")))
        if (registry.includes(`/tools/${toolSlugOf(d.path)}"`))
            failed.push(`lib/tool-registry.gen.ts imports ${d.path}'s code`);
    let sawLive = false;
    let sawTool = false;
    for (const file of shipped) {
        const base = path.basename(file);
        if (fileNames.includes(base))
            failed.push(`${path.relative(APP, file)}: a download's file`);
        const body = fs.readFileSync(file);
        if (!sawLive && body.includes(seen)) sawLive = true;
        if (!sawTool && body.includes(seenTool)) sawTool = true;
        for (const { page, m, buf } of markers)
            if (body.includes(buf))
                failed.push(`${path.relative(APP, file)}: "${m}" (${page})`);
    }
    if (!sawLive)
        failed.push(
            `the live ${LIVE_FOR}'s words ("${seen}") are in no output: the scan can't see`,
        );
    if (!sawTool)
        failed.push(
            `the live ${LIVE_TOOL}'s code ("${seenTool}") is in no output: the scan can't see`,
        );
    // The sitemap index and its groups are static files (plan U5): one per
    // group with a live page (/for/salons here), none for the held GST page.
    const out = (p) => path.join(APP, ".next/server/app", `${p}.body`);
    for (const p of ["sitemap.xml", "sitemap/pages.xml", "sitemap/for.xml"])
        if (!fs.existsSync(out(p)))
            failed.push(`${p} wasn't built as a static file`);
    if (fs.existsSync(out("sitemap/gst.xml")))
        failed.push("sitemap/gst.xml was built with no live GST page");
    if (
        fs.existsSync(out("sitemap.xml")) &&
        fs.readFileSync(out("sitemap.xml"), "utf8").includes("/sitemap/gst.xml")
    )
        failed.push("the sitemap index names gst.xml with no live GST page");
    const state = path.join(APP, ".open-next");
    if (!fs.existsSync(state)) failed.push(".open-next wasn't written");
} finally {
    api.close();
    if (before) fs.writeFileSync(LIST, before);
    else fs.rmSync(LIST, { force: true });
    // Back to the copy the next `pnpm dev` or build would write.
    run("pnpm", ["exec", "tsx", "docs-content.config.ts"]);
}

if (failed.length) {
    console.error(
        `check:draft-words: a page that isn't live reached the build:\n  ${failed.slice(0, 40).join("\n  ")}`,
    );
    process.exit(1);
}
console.log(
    `check:draft-words: ${drafts.length} pages not live (${searchDrafts.length} /for/ pages and tools), none of their words, tools' code or files in .next, .open-next, public/ or lib/*.gen.ts`,
);
